# Apps Script (bound to the sheet copy)

`Code.gs` here is a reference copy of the script that must be pasted into the sheet's Extensions →
Apps Script editor. Apps Script doesn't deploy from git — this file is the source of truth for review
and history, but the sheet's own copy (kept in sync by hand) is what actually runs.

## Design

Installable `onFormSubmit` trigger (fixes the inherited script's actual bug — see
[PLANNING.md](../PLANNING.md) section 2.2) plus a time-based safety net every 5 minutes. Both converge
on one `pushRow_` function; delivery is idempotent because the sheet row number becomes the Firestore
document ID on the backend. Full reasoning in PLANNING.md section 3.5.

## Setup (do this once per deployment of this file)

1. Open the sheet copy → Extensions → Apps Script.
2. Replace the contents of the default `Code.gs` with this file's contents.
3. Set the two Script Properties the script reads at runtime, **directly through the UI** rather than
   pasting either value into the source (see "Why the UI, not `setSecret_`/`setEndpoint_`" below):
   Project Settings (gear icon, left sidebar) → Script Properties → Add script property, twice:
   - `INGEST_SECRET` = the real value of `INGEST_WEBHOOK_SECRET` from the root `.env` (or the Vercel
     dashboard once deployed)
   - `INGEST_ENDPOINT_URL` = `https://contour-takehome.vercel.app/api/feedback/ingest` (the stable
     production alias — not a per-deployment `*.vercel.app` URL, those change on every deploy)
4. Select `setup_` in the function dropdown, click Run. Google will prompt for authorization the first
   time (this app calls `UrlFetchApp` and reads the spreadsheet) — approve it. This installs the
   `onFormSubmit` trigger and the 5-minute safety-net trigger, and creates a "Sync Log" tab if one
   doesn't already exist.
5. To smoke-test without waiting for a real form submission, select `testPushLastRow_` and click Run —
   it re-pushes whatever the current last row is (safe: ingestion is an upsert, so this can't create a
   duplicate).

### Why the UI, not `setSecret_`/`setEndpoint_`

`Code.gs` still has `setSecret_`/`setEndpoint_` helper functions (paste a value into a variable, run
once) as a fallback, but setting Script Properties directly through the UI is preferred: it means the
secret never touches the script source at all, not even transiently. `buildPayload_` only ever reads
`PropertiesService.getScriptProperties().getProperty(SECRET_KEY)` — it doesn't care how that property
was set, so either path works identically at runtime.

## Rotating the secret or endpoint later

Update the Script Property value directly (Project Settings → Script Properties), or re-run
`setSecret_`/`setEndpoint_` if you're using that path. No need to re-run `setup_` either way — the
triggers already exist and read the current Script Properties value on every invocation.

## Known residual risk

Because the sheet must be shared "anyone with the link: editor," any editor can open
Extensions → Apps Script → Project Settings → Script Properties and read the secret in plaintext. This
is documented and accepted in PLANNING.md section 3.5: the ingest endpoint can only ever create
shape-validated feedback rows, so a leaked secret's worst case is someone injecting fake feedback rows
— annoying, not a data-exposure risk, and fully recoverable by deleting the bad rows and rotating the
secret.
