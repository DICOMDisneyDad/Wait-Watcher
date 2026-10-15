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
 * Setup: standalone Apps Script project; run setup() once and approve the
 * permissions prompt. Then Deploy → New deployment → Web app (Execute as: Me,
 * Who has access: Anyone) and paste the /exec URL into the app under
 * My waits → Posted wait logger. Writes to the sheet named by CONFIG.SHEET_ID.
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
];

const HEARTBEAT_HEADERS = ['Hour Starting', 'Successful Checks', 'Failed Checks', 'Last Error'];

/*
 * Per-ride state, kept in script properties (one property per park, to stay
 * under the 9 KB-per-property limit). Each ride is a compact array:
 *   [status, wait, since, exact, statusSince, prevStatus]
 * status/wait   what the feed said at the last check (wait '' when none posted)
 * since         epoch seconds when status or wait last changed
 * exact         1 if `since` is a change this logger saw within one check,
 *               0 if it is only a lower bound (first sighting, or after a gap)
 * statusSince   epoch seconds when the status last changed
 * prevStatus    the status before that change ('' if unknown)
 */
const S = {status: 0, wait: 1, since: 2, exact: 3, statusSince: 4, prevStatus: 5};

/** Run once: creates the tabs and installs the 5-minute timer. */
function setup() {
  const ss = ss_();
  ensureSheet_(ss, CONFIG.LOG_SHEET, LOG_HEADERS);
  ensureSheet_(ss, CONFIG.HEARTBEAT_SHEET, HEARTBEAT_HEADERS);

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
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    saveState_(newState, live);
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
 * current status, posted wait, and when they last changed.
 */
function doGet() {
  const props = PropertiesService.getScriptProperties();
  const state = loadState_();
  const rides = {};
  Object.keys(state).forEach(id => {
    const s = state[id];
    rides[id] = {
      status: s[S.status],
      wait: s[S.wait] === '' ? null : s[S.wait],
      since: s[S.since] * 1000,
      exact: s[S.exact] === 1,
      statusSince: s[S.statusSince] * 1000,
      prevStatus: s[S.prevStatus] || '',
    };
  });
  const out = {
    ok: true,
    app: 'wait-watcher-logger',
    checkedAt: Number(props.getProperty('lastCheck') || 0) * 1000,
    intervalMin: CONFIG.INTERVAL_MINUTES,
    rides: rides,
  };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
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
