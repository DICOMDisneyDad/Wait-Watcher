/**
 * Wait Watcher — Posted Wait Logger
 *
 * Logs Disneyland Resort posted standby waits from ThemeParks.wiki into the
 * Wait Watcher Log spreadsheet, writing a row ONLY when a ride's status or
 * posted wait changes. An hourly heartbeat records how many checks ran, so a
 * gap in the log can be told apart from "nothing changed".
 *
 * It also serves each ride's current state to the Wait Watcher app (doGet):
 * when the posted wait last changed and, for the "just reopened" flag, when
 * the status last changed and what it was before. That lets the app show
 * exact "unchanged for" times the moment it opens.
 *
 * Event nights: a separately ticketed after-hours event (see
 * CONFIG.EVENT_NIGHTS) makes waits behave unlike a normal day. Rows logged
 * during one are still kept, but marked TRUE in the "Event Night" column so
 * analysis can leave them out, and doGet tells the app which rides are in an
 * event window right now.
 *
 * Likely to drop: the logger also keeps a running tally of each ride's posted
 * waits today, and at each change counts four signs that the next posted
 * change will be a drop (see DROP). doGet sends the count to the app, which
 * badges rides showing 3 or more. In the first week of logs, 3+ signs were
 * followed by a drop about 75% of the time versus about 49% overall.
 *
 * Setup: standalone Apps Script project; run setup() once and approve the
 * permissions prompt. Then Deploy → New deployment → Web app (Execute as: Me,
 * Who has access: Anyone) and paste the /exec URL into the app under
 * My waits → Posted wait logger. Writes to the sheet named by CONFIG.SHEET_ID.
 *
 * Upgrading an existing install to event-night tagging: paste this file over
 * the old one, run backfillEventFlags() once to mark rows already logged, then
 * Deploy → Manage deployments → edit → New version so the app sees the change.
 */

const CONFIG = {
  SHEET_ID: '15nJvjsDSAb9pxFS4wj-ufP2wAhYYbNZZRv-4GSqqNHk', // Wait Watcher Log
  DESTINATION_ID: 'bfc89fd6-314d-44b4-b89e-df1a89cf991e', // Disneyland Resort
  PARKS: {
    '7340550b-c14d-4def-80bb-acdb51d49a66': 'Disneyland',
    '832fcd51-ea19-4e77-85c7-75d5843b127c': 'California Adventure',
  },
  LOG_SHEET: 'Posted Waits',
  HEARTBEAT_SHEET: 'Logger Heartbeat',
  INTERVAL_MINUTES: 5,
  GAP_MINUTES: 15, // a longer gap between successful checks means changes in between weren't timed exactly
  TIME_ZONE: 'America/Los_Angeles', // park local time, used for event-night days and hours

  /*
   * Separately ticketed after-hours events. A row is an event-night row when
   * its park matches, its local weekday is in 'days' (1 = Mon … 7 = Sun), its
   * local hour is 'startHour' or later, and its date is within 'from'/'until'
   * (inclusive, 'yyyy-MM-dd'; null = no limit). Set 'until' to the event's
   * last night so the flag stops on its own when the season ends.
   */
  EVENT_NIGHTS: [
    {
      park: 'California Adventure',
      days: [2, 4, 7], // Tuesday, Thursday, Sunday
      startHour: 18,   // 6 PM
      from: '2026-10-01', // the event runs during October only
      until: '2026-10-31',
    },
  ],
};

const LOG_HEADERS = [
  'Logged At',          // when this logger saw the change (up to ~5 min after it happened)
  'Park',
  'Ride ID',            // ThemeParks.wiki entity ID — same as the Wait Watcher map
  'Ride',
  'Status',             // OPERATING / DOWN / CLOSED / REFURBISHMENT
  'Posted Wait (min)',  // standby; blank when none is posted
  'Previous Status',
  'Previous Wait (min)',
  'Feed Last Updated',  // ThemeParks.wiki's own lastUpdated for this ride
  'Event Night',        // TRUE during a ticketed event window (CONFIG.EVENT_NIGHTS); blank otherwise
];
const EVENT_COL = LOG_HEADERS.indexOf('Event Night') + 1; // 1-based column number
const DATE_TIME_FORMAT = 'M/d/yyyy H:mm:ss';

/*
 * "Likely to drop" signs, each worked out when a ride's posted wait changes:
 *   high  the new wait is 20%+ above that ride's average posted wait so far today
 *   peak  it is the ride's highest posted wait so far today
 *   jump  it just went up 10+ minutes from the previous posted wait
 *   late  it was posted at 8 PM or later
 * Only counted once the ride has at least 4 posted waits today, and never
 * during an event night (those rows are left out of the tally too).
 */
const DROP = {aboveAvg: 1.2, jumpMin: 10, lateHour: 20, minChanges: 4};
const DROP_BITS = [['high', 1], ['peak', 2], ['jump', 4], ['late', 8]];

/*
 * Per-ride tally for today, one script property per park ('day:' + park id
 * prefix), each ride a compact array:
 *   [ymd, changes, sum, max, bits, wait]
 * ymd      park-local date the tally is for ('yyyy-MM-dd')
 * changes  posted waits seen today while operating; sum/max of those waits
 * bits     DROP signs present at the latest change (-1 = not enough to judge)
 * wait     the posted wait those signs describe
 */
const D = {ymd: 0, n: 1, sum: 2, max: 3, bits: 4, wait: 5};

const HEARTBEAT_HEADERS = ['Hour Starting', 'Successful Checks', 'Failed Checks', 'Last Error'];

/*
 * Per-ride state, kept in script properties (one property per park, to stay
 * under the 9 KB-per-property limit). Each ride is a compact array:
 *   [status, wait, since, exact, statusSince, prevStatus]
 * status/wait   what the feed said at the last check (wait '' when none posted)
 * since         epoch seconds when status or wait last changed
 * exact         1 if 'since' is a change this logger saw within one check,
 *               0 if it is only a lower bound (first sighting, or after a gap)
 * statusSince   epoch seconds when the status last changed
 * prevStatus    the status before that change ('' if unknown)
 */
const S = {status: 0, wait: 1, since: 2, exact: 3, statusSince: 4, prevStatus: 5};

/** Run once: creates the tabs and installs the 5-minute timer. */
function setup() {
  const ss = ss_();
  const log = ensureSheet_(ss, CONFIG.LOG_SHEET, LOG_HEADERS);
  ensureSheet_(ss, CONFIG.HEARTBEAT_SHEET, HEARTBEAT_HEADERS);
  ensureLogColumns_(log);

  // Remove any earlier copies of the trigger so it never double-logs.
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'logPostedWaits')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('logPostedWaits')
    .timeBased()
    .everyMinutes(CONFIG.INTERVAL_MINUTES)
    .create();

  logPostedWaits(); // first check now, so you can see it work
}

/** Called by the timer. Fetches live data and appends a row per change. */
function logPostedWaits() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return; // a previous run is still going

  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  try {
    const url = 'https://api.themeparks.wiki/v1/entity/' + CONFIG.DESTINATION_ID + '/live';
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      throw new Error('HTTP ' + res.getResponseCode());
    }
    const live = JSON.parse(res.getContentText()).liveData || [];

    const props = PropertiesService.getScriptProperties();
    const lastState = loadState_();
    const lastCheck = Number(props.getProperty('lastCheck') || 0);
    const gap = !lastCheck || nowSec - lastCheck > CONFIG.GAP_MINUTES * 60;
    const newState = {};
    const rows = [];
    const eventNow = {};
    Object.keys(CONFIG.PARKS).forEach(p => { eventNow[p] = isEventNight_(CONFIG.PARKS[p], now); });
    const today = Utilities.formatDate(now, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
    const hourNow = Number(Utilities.formatDate(now, CONFIG.TIME_ZONE, 'H'));
    const day = hasDayTally_() ? loadDay_() : rebuildDayTally_(today);

    live.forEach(e => {
      if (e.entityType !== 'ATTRACTION') return;
      const park = CONFIG.PARKS[e.parkId];
      if (!park) return;

      const status = e.status || '';
      const standby = e.queue && e.queue.STANDBY ? e.queue.STANDBY.waitTime : null;
      const wait = (standby === null || standby === undefined) ? '' : Number(standby);
      const feedSec = e.lastUpdated ? Math.floor(Date.parse(e.lastUpdated) / 1000) || 0 : 0;

      const prev = lastState[e.id];
      let st;
      if (!prev) {
        // First sighting: unchanged since at least now (or the feed's own time, if earlier).
        st = [status, wait, feedSec && feedSec < nowSec ? feedSec : nowSec, 0, nowSec, ''];
      } else if (prev[S.status] !== status || prev[S.wait] !== wait) {
        const statusChanged = prev[S.status] !== status;
        st = [status, wait, nowSec, gap ? 0 : 1,
          statusChanged ? nowSec : prev[S.statusSince],
          statusChanged ? (gap ? '' : prev[S.status]) : prev[S.prevStatus]];
      } else {
        st = prev.slice();
        // Unchanged, but if we were away the ride may have changed and changed back.
        if (gap && feedSec > st[S.since] && feedSec <= nowSec) { st[S.since] = feedSec; st[S.exact] = 0; }
      }
      newState[e.id] = st;

      if (!prev || prev[S.status] !== status || prev[S.wait] !== wait) {
        const shard = 'day:' + e.parkId.slice(0, 8);
        day[shard] = day[shard] || {};
        day[shard][e.id] = tallyChange_(day[shard][e.id], today, hourNow, status, wait,
          prev ? prev[S.status] : null, prev ? prev[S.wait] : null, eventNow[e.parkId]);
        rows.push([
          now,
          park,
          e.id,
          e.name,
          status,
          wait,
          prev ? prev[S.status] : '',
          prev ? prev[S.wait] : '',
          e.lastUpdated ? new Date(e.lastUpdated) : '',
          eventNow[e.parkId] ? true : '',
        ]);
      }
    });

    // Keep last-known state for rides missing from this response, so a
    // temporarily absent ride doesn't log a false "change" when it returns.
    Object.keys(lastState).forEach(id => {
      if (!(id in newState)) newState[id] = lastState[id];
    });

    if (rows.length) {
      const sheet = ss_().getSheetByName(CONFIG.LOG_SHEET);
      ensureLogColumns_(sheet);
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    saveState_(newState, live);
    saveDay_(day, today);
    props.setProperty('lastCheck', String(nowSec));
    recordHeartbeat_(now, true, '');
  } catch (err) {
    recordHeartbeat_(now, false, String(err && err.message || err));
  } finally {
    lock.releaseLock();
  }
}

/**
 * Web app endpoint for the Wait Watcher app. Read-only: returns each ride's
 * current status, posted wait, when they last changed, its park, and whether
 * that park is in a ticketed event window right now.
 */
function doGet() {
  const props = PropertiesService.getScriptProperties();
  const state = loadState_();
  const parkOf = loadParkOf_();
  const now = new Date();
  const today = Utilities.formatDate(now, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  const dayAll = {};
  const dayShards = loadDay_();
  Object.keys(dayShards).forEach(k => Object.assign(dayAll, dayShards[k]));
  const eventNow = {};
  Object.keys(CONFIG.PARKS).forEach(p => {
    const name = CONFIG.PARKS[p];
    eventNow[name] = isEventNight_(name, now);
  });
  const rides = {};
  Object.keys(state).forEach(id => {
    const s = state[id];
    const park = parkOf[id] || '';
    rides[id] = {
      status: s[S.status],
      wait: s[S.wait] === '' ? null : s[S.wait],
      since: s[S.since] * 1000,
      exact: s[S.exact] === 1,
      statusSince: s[S.statusSince] * 1000,
      prevStatus: s[S.prevStatus] || '',
      park: park,
      eventNight: !!eventNow[park],
      drop: eventNow[park] ? null : dropFor_(dayAll[id], today, s),
    };
  });
  const out = {
    ok: true,
    app: 'wait-watcher-logger',
    checkedAt: Number(props.getProperty('lastCheck') || 0) * 1000,
    intervalMin: CONFIG.INTERVAL_MINUTES,
    eventNight: eventNow, // { 'Disneyland': false, 'California Adventure': true } right now
    rides: rides,
  };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- event nights ---------- */

/** True when 'date' falls in one of CONFIG.EVENT_NIGHTS for 'park' (park local time). */
function isEventNight_(park, date) {
  const tz = CONFIG.TIME_ZONE;
  const day = Number(Utilities.formatDate(date, tz, 'u')); // 1 = Mon … 7 = Sun
  const hour = Number(Utilities.formatDate(date, tz, 'H'));
  const ymd = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
  return CONFIG.EVENT_NIGHTS.some(ev =>
    ev.park === park &&
    ev.days.indexOf(day) !== -1 &&
    hour >= ev.startHour &&
    (!ev.from || ymd >= ev.from) &&
    (!ev.until || ymd <= ev.until));
}

/**
 * Run once after upgrading (and again any time you change EVENT_NIGHTS):
 * re-marks the Event Night column for every row already in Posted Waits.
 */
function backfillEventFlags() {
  const sheet = ss_().getSheetByName(CONFIG.LOG_SHEET);
  ensureLogColumns_(sheet);
  const last = sheet.getLastRow();
  if (last < 2) return;
  const vals = sheet.getRange(2, 1, last - 1, 2).getValues(); // Logged At, Park
  const flags = vals.map(r => {
    const t = r[0] instanceof Date ? r[0] : new Date(r[0]);
    return [!isNaN(t) && isEventNight_(String(r[1]), t) ? true : ''];
  });
  sheet.getRange(2, EVENT_COL, flags.length, 1).setValues(flags);
}

/**
 * Brings an existing Posted Waits tab up to the current layout: adds the
 * Event Night header if it's missing, and shows Logged At and Feed Last
 * Updated with their times (a date-only format drops the time from exports).
 * Cheap to call; does its work once.
 */
function ensureLogColumns_(sheet) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('logLayout') === '2') return;
  if (sheet.getRange(1, EVENT_COL).getValue() === '') {
    sheet.getRange(1, EVENT_COL).setValue(LOG_HEADERS[EVENT_COL - 1]).setFontWeight('bold');
  }
  const rows = Math.max(sheet.getMaxRows(), 2);
  sheet.getRange(1, 1, rows, 1).setNumberFormat(DATE_TIME_FORMAT);
  sheet.getRange(1, 9, rows, 1).setNumberFormat(DATE_TIME_FORMAT);
  sheet.getRange(1, 1, 1, LOG_HEADERS.length).setNumberFormat('@'); // keep headers as text
  props.setProperty('logLayout', '2');
}

/* ---------- likely to drop ---------- */

/**
 * Updates one ride's tally for a newly logged row and returns it. prevStatus
 * and prevWait are what the ride showed before this change (null on a first
 * sighting). Rows that aren't an operating posted wait, or fall on an event
 * night, leave the tally as it was.
 */
function tallyChange_(d, today, hour, status, wait, prevStatus, prevWait, eventNight) {
  if (status !== 'OPERATING' || wait === '' || wait === null || eventNight) return d;
  if (!d || d[D.ymd] !== today) d = [today, 0, 0, 0, -1, ''];
  d[D.n] += 1;
  d[D.sum] += wait;
  d[D.max] = Math.max(d[D.max], wait);
  const prevOk = prevStatus === 'OPERATING' && prevWait !== '' && prevWait !== null;
  let bits = -1;
  if (prevOk && d[D.n] >= DROP.minChanges) {
    const avg = d[D.sum] / d[D.n];
    bits = (wait >= DROP.aboveAvg * avg ? 1 : 0) | (wait >= d[D.max] ? 2 : 0) |
      (wait - prevWait >= DROP.jumpMin ? 4 : 0) | (hour >= DROP.lateHour ? 8 : 0);
  }
  d[D.bits] = bits;
  d[D.wait] = wait;
  return d;
}

/** What doGet sends for one ride: the signs present now, or null if there's nothing to judge. */
function dropFor_(d, today, s) {
  if (!d || d[D.ymd] !== today || d[D.bits] < 0) return null;
  if (s[S.status] !== 'OPERATING' || s[S.wait] !== d[D.wait]) return null; // tally describes an older posting
  const why = DROP_BITS.filter(b => d[D.bits] & b[1]).map(b => b[0]);
  return {signals: why.length, why: why, todayAvg: Math.round(d[D.sum] / d[D.n]), todayMax: d[D.max], changes: d[D.n]};
}

function hasDayTally_() {
  return Object.keys(PropertiesService.getScriptProperties().getProperties()).some(k => k.indexOf('day:') === 0);
}

/** { 'day:<park prefix>': { rideId: tally } } */
function loadDay_() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const out = {};
  Object.keys(all).forEach(k => { if (k.indexOf('day:') === 0) out[k] = JSON.parse(all[k] || '{}'); });
  return out;
}

/** Saves the tally, dropping rides whose tally is from an earlier day. */
function saveDay_(day, today) {
  const write = {};
  Object.keys(CONFIG.PARKS).forEach(p => { write['day:' + p.slice(0, 8)] = '{}'; });
  Object.keys(day).forEach(k => {
    const keep = {};
    Object.keys(day[k]).forEach(id => { if (day[k][id] && day[k][id][D.ymd] === today) keep[id] = day[k][id]; });
    write[k] = JSON.stringify(keep);
  });
  PropertiesService.getScriptProperties().setProperties(write);
}

/**
 * Rebuilds today's tally from the Posted Waits tab. Runs by itself the first
 * time the logger runs without one (right after this upgrade), so badges work
 * straight away instead of waiting for four new changes per ride.
 */
function rebuildDayTally_(today) {
  const day = {};
  const idOf = {};
  Object.keys(CONFIG.PARKS).forEach(p => { idOf[CONFIG.PARKS[p]] = p; day['day:' + p.slice(0, 8)] = {}; });
  const sheet = ss_().getSheetByName(CONFIG.LOG_SHEET);
  const last = sheet ? sheet.getLastRow() : 0;
  if (last < 2) return day;
  const n = Math.min(last - 1, 4000); // more than a full day of changes
  const rows = sheet.getRange(last - n + 1, 1, n, EVENT_COL).getValues();
  rows.forEach(r => {
    const t = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (isNaN(t) || Utilities.formatDate(t, CONFIG.TIME_ZONE, 'yyyy-MM-dd') !== today) return;
    const pid = idOf[String(r[1])];
    if (!pid) return;
    const shard = 'day:' + pid.slice(0, 8), id = String(r[2]);
    const hour = Number(Utilities.formatDate(t, CONFIG.TIME_ZONE, 'H'));
    const wait = r[5] === '' ? '' : Number(r[5]);
    const prevStatus = r[6] === '' ? null : String(r[6]);
    const prevWait = r[7] === '' ? '' : Number(r[7]);
    const event = r[EVENT_COL - 1] === true || isEventNight_(String(r[1]), t);
    day[shard][id] = tallyChange_(day[shard][id], today, hour, String(r[4]), wait, prevStatus, prevWait, event);
  });
  return day;
}

/** Run by hand if you ever want to rebuild today's tally from the sheet. */
function rebuildTodaysDropTally() {
  const today = Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  saveDay_(rebuildDayTally_(today), today);
}

/* ---------- state storage ---------- */

function loadState_() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const state = {};
  Object.keys(all).forEach(k => {
    if (k.indexOf('state:') === 0) Object.assign(state, JSON.parse(all[k] || '{}'));
  });
  // One-time upgrade from the first version, which kept only [status, wait].
  if (!Object.keys(state).length && all.lastState) {
    Object.assign(state, migrateLegacy_(JSON.parse(all.lastState)));
  }
  return state;
}

/** Which park each tracked ride is in, read from the per-park state shards. */
function loadParkOf_() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const byPrefix = {};
  Object.keys(CONFIG.PARKS).forEach(p => { byPrefix['state:' + p.slice(0, 8)] = CONFIG.PARKS[p]; });
  const out = {};
  Object.keys(all).forEach(k => {
    if (!byPrefix[k]) return;
    Object.keys(JSON.parse(all[k] || '{}')).forEach(id => { out[id] = byPrefix[k]; });
  });
  return out;
}

/** Saves state split by park. A ride missing from this response keeps the shard it was in. */
function saveState_(state, live) {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const shardOf = {};
  Object.keys(all).forEach(k => {
    if (k.indexOf('state:') === 0) Object.keys(JSON.parse(all[k] || '{}')).forEach(id => { shardOf[id] = k; });
  });
  live.forEach(e => { if (CONFIG.PARKS[e.parkId]) shardOf[e.id] = 'state:' + e.parkId.slice(0, 8); });
  const shards = {};
  Object.keys(CONFIG.PARKS).forEach(p => { shards['state:' + p.slice(0, 8)] = {}; });
  Object.keys(state).forEach(id => {
    const key = shardOf[id] || 'state:other';
    (shards[key] = shards[key] || {})[id] = state[id];
  });
  const write = {};
  Object.keys(shards).forEach(k => { write[k] = JSON.stringify(shards[k]); });
  props.setProperties(write);
  if (all.lastState) props.deleteProperty('lastState');
}

/**
 * Rebuilds the change times for rides the first version was already tracking,
 * from the Posted Waits tab: the last row per ride is when it last changed,
 * and the last row whose status differs from its previous status is when the
 * status last changed.
 */
function migrateLegacy_(legacy) {
  const out = {};
  const nowSec = Math.floor(Date.now() / 1000);
  const sheet = ss_().getSheetByName(CONFIG.LOG_SHEET);
  const last = sheet ? sheet.getLastRow() : 0;
  const rows = last > 1 ? sheet.getRange(2, 1, last - 1, 8).getValues() : [];
  const lastRow = {}, lastStatusRow = {};
  rows.forEach(r => {
    const id = String(r[2]);
    lastRow[id] = r;
    if (r[6] !== '' && r[6] !== r[4]) lastStatusRow[id] = r;
  });
  Object.keys(legacy).forEach(id => {
    const [status, wait] = legacy[id];
    const lr = lastRow[id], sr = lastStatusRow[id];
    const since = lr ? Math.floor(new Date(lr[0]).getTime() / 1000) : nowSec;
    const exact = lr && lr[6] !== '' ? 1 : 0; // the very first row per ride is a first sighting, not a change
    out[id] = [status, wait, since, exact,
      sr ? Math.floor(new Date(sr[0]).getTime() / 1000) : since,
      sr ? String(sr[6]) : ''];
  });
  return out;
}

/* ---------- heartbeat ---------- */

/** One row per hour: how many checks succeeded/failed. Gaps = logger was down. */
function recordHeartbeat_(now, ok, errorMsg) {
  const props = PropertiesService.getScriptProperties();
  const hour = new Date(now);
  hour.setMinutes(0, 0, 0);
  const hourKey = String(hour.getTime());

  const hb = JSON.parse(props.getProperty('heartbeat') || '{}');
  if (hb.hour && hb.hour !== hourKey) flushHeartbeat_(hb); // hour rolled over
  if (hb.hour !== hourKey) {
    hb.hour = hourKey; hb.ok = 0; hb.fail = 0; hb.err = '';
  }
  if (ok) hb.ok++; else { hb.fail++; hb.err = errorMsg; }
  props.setProperty('heartbeat', JSON.stringify(hb));
}

function flushHeartbeat_(hb) {
  const sheet = ss_().getSheetByName(CONFIG.HEARTBEAT_SHEET);
  sheet.appendRow([new Date(Number(hb.hour)), hb.ok, hb.fail, hb.err]);
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

/** Optional: stop logging (removes the timer, keeps all data). */
function stopLogging() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'logPostedWaits')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function ss_() {
  return SpreadsheetApp.openById(CONFIG.SHEET_ID);
}
