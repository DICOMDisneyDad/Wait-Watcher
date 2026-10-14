/**
 * Wait Watcher → Google Sheet sync.
 * Paste this into the sheet's Extensions → Apps Script, then Deploy → New deployment → Web app
 * (Execute as: Me, Who has access: Anyone). Paste the web app URL into Wait Watcher → My waits → Google Sheet sync.
 *
 * The app sends each finished wait with an id (its start time). Rows already in the sheet are skipped,
 * so the app can safely retry after a dropped connection.
 */
const SHEET_NAME = 'Timed Waits'; // its own tab, separate from the Posted Waits logger
const HEADERS = ['id','date','ride','posted_min','unchanged_min','unchanged_exact','actual_min','actual_sec',
  'sign_lap_sec','sign_to_board_sec','preshow_laps','ride_went_down','synced_at'];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME, 0);
  if (sh.getLastRow() === 0) { sh.appendRow(HEADERS); sh.setFrozenRows(1); sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold'); }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ok: true, app: 'wait-watcher', rows: Math.max(0, sheet_().getLastRow() - 1)});
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const sh = sheet_();
    const last = sh.getLastRow();
    const have = new Set(last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0])) : []);
    const now = new Date();
    const add = [];
    const ids = [];
    for (const r of rows) {
      const id = String(r.id || '');
      if (!id) continue;
      ids.push(id);
      if (have.has(id)) continue;
      have.add(id);
      add.push([id, r.date ? new Date(r.date) : '', r.ride || '', num_(r.posted_min), num_(r.unchanged_min), r.unchanged_exact || '',
        num_(r.actual_min), num_(r.actual_sec), num_(r.sign_lap_sec), num_(r.sign_to_board_sec), r.preshow_laps || '',
        r.ride_went_down || '', now]);
    }
    if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, HEADERS.length).setValues(add);
    return json_({ok: true, ids: ids, added: add.length});
  } catch (err) {
    return json_({ok: false, error: String(err)});
  } finally {
    lock.releaseLock();
  }
}

function num_(v) { return v === '' || v === null || v === undefined ? '' : Number(v); }
