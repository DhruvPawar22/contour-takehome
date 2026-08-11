// ============================================================================
// Contour feedback sheet -> /api/feedback/ingest
//
// Rewrite of the inherited script (see PLANNING.md section 2.2 for the full diagnosis of why the
// original never worked, and section 3.5 for what changed and why). Two triggers converge on one
// pushRow_ function:
//   1. An INSTALLABLE onFormSubmit trigger (the real fix — the original used a bare `onEdit(e)`
//      function name, which Apps Script installs as a *simple* trigger. Simple triggers run in a
//      restricted, unauthorized context and are forbidden from calling UrlFetchApp — every call
//      was throwing and being swallowed by an empty catch block. Installable triggers, set up via
//      setup_ below, run fully authorized.)
//   2. A time-based trigger (every 5 min) that re-scans for rows past the last-synced pointer, as
//      a safety net for transient failures, quota errors, or a script redeploy landing mid-flight.
//
// Every helper function below ends in `_` — Apps Script convention for "private", which also
// keeps them out of the function-picker dropdowns (only setup_/testPushLastRow_ show up there).
// Do not rename these without renaming every call site to match — trigger targets in particular
// are stored as plain strings at trigger-creation time and do NOT auto-update if you rename the
// function later; a mismatch fails at runtime with "Script function not found: <name>".
//
// One-time setup (run once from the Apps Script editor, or after any redeploy of this file):
//   1. Project Settings (gear icon) -> Script Properties -> Add script property, twice:
//        INGEST_SECRET       = the real value of INGEST_WEBHOOK_SECRET from the backend's .env
//        INGEST_ENDPOINT_URL = https://contour-takehome.vercel.app/api/feedback/ingest
//      (the stable production alias — not a per-deployment *.vercel.app URL, those change on
//      every deploy)
//   2. Select `setup_` in the function dropdown and click Run. This creates both triggers and
//      prompts for the authorization scopes the first time.
// ============================================================================

var SHEET_NAME = 'Form Responses 1';
var LAST_SYNCED_ROW_KEY = 'LAST_SYNCED_ROW';
var ENDPOINT_URL_KEY = 'INGEST_ENDPOINT_URL';
var SECRET_KEY = 'INGEST_SECRET';
var SYNC_LOG_SHEET_NAME = 'Sync Log';
var MAX_ATTEMPTS = 3;

// ---- One-time setup -------------------------------------------------------

function setup_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmitInstalled_' || t.getHandlerFunction() === 'syncSafetyNet_') {
      ScriptApp.deleteTrigger(t);
    }
  });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('onFormSubmitInstalled_').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('syncSafetyNet_').timeBased().everyMinutes(5).create();

  getOrCreateSyncLogSheet_();
  Logger.log('Triggers installed. Confirm INGEST_SECRET and INGEST_ENDPOINT_URL are set under Project Settings -> Script Properties.');
}

// ---- Triggers ---------------------------------------------------------------

function onFormSubmitInstalled_(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return;
  var row = e && e.range ? e.range.getRow() : sheet.getLastRow();
  pushRow_(row);
}

function syncSafetyNet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var props = PropertiesService.getScriptProperties();
  var lastSynced = Number(props.getProperty(LAST_SYNCED_ROW_KEY) || 1);

  for (var row = lastSynced + 1; row <= lastRow; row++) {
    pushRow_(row);
  }
}

// ---- Core push --------------------------------------------------------------

function pushRow_(rowNumber) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet || rowNumber < 2) return;

  var values = sheet.getRange(rowNumber, 1, 1, 8).getValues()[0];
  var payload = buildPayload_(values, rowNumber);

  var ok = sendWithRetry_(payload);
  if (ok) {
    advanceLastSyncedRow_(rowNumber);
  } else {
    logSyncFailure_(rowNumber, payload);
  }
}

function buildPayload_(row, rowNumber) {
  var ts = row[0];
  var submittedAt = ts && ts.getTime
    ? Utilities.formatDate(ts, 'Australia/Melbourne', "yyyy-MM-dd'T'HH:mm:ssXXX")
    : String(ts || '');

  return {
    secret: PropertiesService.getScriptProperties().getProperty(SECRET_KEY) || '',
    row_number: rowNumber,
    submitted_at: submittedAt,
    parent_name: String(row[1] || ''),
    student_name: String(row[2] || ''),
    class_label: String(row[3] || ''),
    rating: Number(row[4] || 0),
    continuing: String(row[5] || ''),
    contact_requested: String(row[6] || ''),
    comments: String(row[7] || ''),
  };
}

function sendWithRetry_(payload) {
  var endpoint = PropertiesService.getScriptProperties().getProperty(ENDPOINT_URL_KEY);
  if (!endpoint) {
    Logger.log('INGEST_ENDPOINT_URL not set — add it under Project Settings -> Script Properties.');
    return false;
  }

  for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      var response = UrlFetchApp.fetch(endpoint, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      var code = response.getResponseCode();
      if (code >= 200 && code < 300) return true;
      // 4xx (bad payload / bad secret) won't succeed on retry — stop immediately.
      if (code >= 400 && code < 500) {
        Logger.log('Ingest rejected row ' + payload.row_number + ' with ' + code + ': ' + response.getContentText());
        return false;
      }
    } catch (err) {
      Logger.log('Attempt ' + attempt + ' for row ' + payload.row_number + ' threw: ' + err);
    }
    if (attempt < MAX_ATTEMPTS) {
      Utilities.sleep(1000 * attempt);
    }
  }
  return false;
}

// ---- Bookkeeping --------------------------------------------------------------

function advanceLastSyncedRow_(rowNumber) {
  var props = PropertiesService.getScriptProperties();
  var current = Number(props.getProperty(LAST_SYNCED_ROW_KEY) || 1);
  if (rowNumber > current) {
    props.setProperty(LAST_SYNCED_ROW_KEY, String(rowNumber));
  }
}

function logSyncFailure_(rowNumber, payload) {
  var redacted = {};
  for (var key in payload) {
    redacted[key] = key === 'secret' ? '[redacted]' : payload[key];
  }
  var logSheet = getOrCreateSyncLogSheet_();
  logSheet.appendRow([new Date(), rowNumber, JSON.stringify(redacted)]);
}

function getOrCreateSyncLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName(SYNC_LOG_SHEET_NAME);
  if (!logSheet) {
    logSheet = ss.insertSheet(SYNC_LOG_SHEET_NAME);
    logSheet.appendRow(['Logged at', 'Sheet row', 'Payload (secret redacted)']);
  }
  return logSheet;
}

// ---- Manual test helper (safe to run from the editor; not called by triggers) ----

function testPushLastRow_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return;
  pushRow_(sheet.getLastRow());
}
