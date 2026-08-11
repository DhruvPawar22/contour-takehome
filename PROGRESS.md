# Progress — Contour feedback tool

Status snapshot, written for a context handoff. Full architecture, research findings, and the reasoning
behind every decision live in [PLANNING.md](PLANNING.md) — this file only tracks what's actually done
versus pending, and the concrete state of local config. Read both after a context clear; this one tells
you where to pick up, PLANNING.md tells you why things are built the way they are.

## Where things stand

**Phase 0 — Access & setup: complete**
- Firebase project created: `contour-takehome`.
- Web app registered in that project; its config is in `frontend/.env`.
- Firestore Database created.
- Email/Password sign-in provider — instructions were given, but completion was never explicitly
  confirmed back in chat. **Verify this is actually toggled on before phase 3 needs it.**
- Service account key generated and correctly placed (minified to one line) in root `.env` as
  `FIREBASE_SERVICE_ACCOUNT_KEY` — parsed and verified: 11 fields intact, `project_id` matches
  `contour-takehome`, private key structurally sound.
- Vercel account created, `vercel login` completed successfully — CLI is authenticated.
- Gemini API key (AI Studio) in root `.env` as `GEMINI_API_KEY`.
- Roster API key (from the assignment brief) in root `.env` as `ROSTER_API_KEY`.
- `firebase login` (CLI) deliberately **not** done — not needed yet, see "Notable fixes" below.

**Phase 1 — Scaffold repo: complete**
- `frontend/` — Vite + React + TypeScript. Builds clean (`npm run build --prefix frontend` verified).
- `api/` — placeholder `health.ts`, typed against Node's built-in `http` module, not `@vercel/node`
  (see "Notable fixes" below).
- Root config scaffolded: `package.json`, `tsconfig.json`, `vercel.json`, `firebase.json`, `.firebaserc`
  (points at `contour-takehome`), `firestore.rules` (locked down — `allow read, write: if false` — real
  rules land in phase 3), `firestore.indexes.json` (empty).
- Root `.gitignore` covers `node_modules/`, `.env`, `dist/`, `.vercel/`, `.firebase/`.
- Git repo initialized and correctly scoped to this project folder (see "Notable fixes" below).
- First commit made, on branch `main`.

**Phase 2 — Ingestion pipe: complete and verified live end-to-end.** Deployed to Vercel production
(`https://contour-takehome.vercel.app`), the sheet's Apps Script is wired up and running, and the whole
sheet's pre-existing backlog (93 rows) plus one fresh form submission — 94 rows total — has been
confirmed correctly ingested into Firestore: 0 unmatched classes, 0 rating/timestamp anomalies, priority
tiers computed correctly (25 tier-1 / 16 tier-2 / 53 tier-3), Melbourne timestamps carrying the right
`+10:00`/`+11:00` offset across the DST boundary. Phase 2's exit criterion is met.
- `api/_lib/firebaseAdmin.ts` — lazy-initialized Admin SDK app (`FIREBASE_SERVICE_ACCOUNT_KEY`), exports
  `getDb()`.
- `api/_lib/roster.ts` — `fetchAllRosterStaff()`, paginates the Staff Roster API via `X-Api-Key`,
  dedupes by email (see "Notable fixes" below — the API's own pagination overlaps by one record).
- `api/_lib/priority.ts` — `computePriorityTier()`, pure function implementing the 3-tier rules from
  PLANNING.md §3.2. Verified by hand via the smoke test (rating 2 → tier 1, etc.); real unit tests land
  in phase 3 per the phased plan.
- `api/_lib/http.ts` — tiny `readJsonBody`/`sendJson` helpers (kept plain-`node:http`-typed, consistent
  with the phase 1 decision to not depend on `@vercel/node`).
- `api/feedback/ingest.ts` — POST endpoint. Validates payload shape, checks the shared secret with
  `crypto.timingSafeEqual`, resolves `tutorEmail` via `classes array-contains class_label` against the
  `staff` collection, computes `priorityTier`, upserts `feedback/row_<n>` inside a transaction that
  **only sets `handled`/`handledBy`/`handledAt`/`createdAt` on first creation** — re-delivery from the
  Apps Script safety net updates the source fields but can never clobber a staff member's handled-state.
  Confirmed by smoke test: marked a row handled, re-delivered the same payload, `handled` stayed `true`.
- `api/roster/sync.ts` — GET/POST endpoint, guarded by `Authorization: Bearer $CRON_SECRET` (doubles as
  the cron target and a manual on-demand refresh — see PLANNING.md §3.6). Batch-writes `staff/{email}`
  and `config/rosterSync`. Smoke-tested: 18 staff synced, matching PLANNING.md §2.3's confirmed count.
- `vercel.json` — added `crons: [{ path: "/api/roster/sync", schedule: "0 3 * * *" }]` (**daily, not
  hourly as originally planned** — see "Notable fixes" below).
- `apps-script/Code.gs` — full rewrite per PLANNING.md §3.5: installable `onFormSubmit` trigger (the
  actual fix for the inherited bug) + 5-min time-based safety net, both converging on `pushRow_`, retry
  with backoff, secret-redacted "Sync Log" tab on failure, `Australia/Melbourne` timestamps. Setup steps
  for pasting it into the sheet are in `apps-script/README.md` (new).
- Added `firebase-admin` as a root dependency (needed for Admin SDK Firestore access from `/api`).

**Deployment (also phase 2, brought forward from phase 5 — see "Notable fixes" #6):**
- Vercel project `contour-takehome` linked (org `xyz-a4cd`), deployed to production via CLI
  (`vercel deploy --prod`). Stable URL: `https://contour-takehome.vercel.app` — this is what goes
  anywhere an endpoint URL is needed (per-deployment `*.vercel.app` URLs change every deploy, don't use
  those). GitHub auto-connect during `vercel link` failed (couldn't reach `DhruvPawar22/contour-takehome`)
  — harmless, deploys are CLI-driven, not git-push-triggered, so this was never needed.
- All 5 backend env vars (`FIREBASE_SERVICE_ACCOUNT_KEY`, `ROSTER_API_KEY`, `GEMINI_API_KEY`,
  `INGEST_WEBHOOK_SECRET`, `CRON_SECRET`) set on Vercel production, marked Sensitive (write-only after
  creation — `vercel env pull` returns `[REDACTED]` for these, by design, not a bug).
- `vercel.json` gained `buildCommand`/`outputDirectory` pointing at `frontend/dist` — needed once an
  actual deploy was attempted (see "Notable fixes" #7).

**Phase 3 — Auth & rules: complete and verified live against the real deployed rules (not just unit
tests).** Exit criterion met: each seeded role signs in and gets exactly the scoped/redacted data,
confirmed by actually signing in as each seeded account and hitting the Firestore REST API directly
with their real ID tokens (not the Admin SDK, which bypasses all rules) — see "Notable fixes" #11 for
the full result table.
- **Data model correction:** `feedback/{rowId}` originally held `parentName`/`studentName` inline (phase
  2 design). Firestore rules can only allow-or-deny a whole document on read, never individual fields,
  so that design could never actually redact names for tutors — only fully show or fully hide the whole
  document. Split into `feedback/{rowId}` (everything except names) and a new `feedbackPii/{rowId}`
  (just `parentName`/`studentName`, lead/coordinator only). PLANNING.md §3.1/§4/§5 updated. The 94
  already-ingested real rows were migrated live (PII moved out of `feedback`, into `feedbackPii`,
  verified field-by-field, no data lost).
- `api/_lib/feedbackDoc.ts` — `buildFeedbackDocs()`, pure function extracted from `ingest.ts` that
  builds both documents from one payload. Makes the redaction guarantee directly unit-testable: a test
  asserts `parentName`/`studentName` never appear anywhere in the `feedback`-bound object.
- `api/_lib/access.ts` — `classBelongsToTutor()` / `canSeeFeedback()`, a plain-JS mirror of
  `firestore.rules`' access logic, kept in sync by hand (rules aren't JS, can't literally share code)
  so the intended semantics are unit-tested even without an emulator.
- `firestore.rules` — real rules replacing the phase-1 lockdown: `feedback` read/update scoped by
  role/class (update restricted to only `handled`/`handledBy`/`handledAt` changing), `feedbackPii` read
  restricted to lead/coordinator, `staff` read for any authenticated user, everything write-restricted
  to the Admin SDK. Deployed live via `firebase deploy --only firestore:rules`.
- `api/auth/sync-role.ts` — POST endpoint. Verifies the caller's own Firebase ID token (never a
  client-supplied uid/email — no role-escalation path), looks up `staff/{email}` for that verified
  email, sets `{role, classes}` as custom claims via `setCustomUserClaims`. Frontend (phase 4) must call
  this once after sign-in and then force-refresh the ID token (`getIdToken(true)`) for the new claims to
  take effect in Firestore reads.
- `scripts/seed-test-accounts.js` — idempotent (safe to re-run), creates/updates one Firebase Auth
  email/password account per role using real roster identities: `marcus.chen@...` (lead),
  `nadia.rahman@...` (coordinator), `rohan.iyer@...` (tutor). Sets custom claims directly too, so the
  accounts are usable immediately without waiting on the phase-4 frontend to call `sync-role`. Shared
  password in root `.env` as `TEST_ACCOUNT_PASSWORD` — goes in the grader-facing memo (phase 6), never
  committed.
- 18 unit tests, `npm test` (`node --test`, zero new dependencies — matches this repo's established
  minimal-dependency pattern): full `computePriorityTier` rule matrix, `access.ts`'s class-scoping
  semantics (including the empty-`classes[]` tutor edge case from PLANNING §2.3), the redaction
  guarantee in `feedbackDoc.ts`, and a regression test locking in the roster pagination-dedup fix from
  phase 2 (mocks `fetch`, asserts an overlapping record across two pages is deduped).

**Phases 4-6: not started.**

## Local environment state

- Root `.env` (gitignored, never committed): `FIREBASE_SERVICE_ACCOUNT_KEY`, `ROSTER_API_KEY`,
  `GEMINI_API_KEY`, `INGEST_WEBHOOK_SECRET`, `CRON_SECRET`, and (phase 3) `TEST_ACCOUNT_PASSWORD` all
  set. `.env.example` updated to match — still blank there.
- `frontend/.env` (gitignored): all six `VITE_FIREBASE_*` values set from the real `contour-takehome`
  web app config. `VITE_API_BASE_URL` still blank (filled in once phase 4 frontend build starts).
- `npm audit`, frontend: 0 vulnerabilities. Root: **6 moderate**, all transitive through
  `firebase-admin` → `@google-cloud/storage` → `teeny-request`/`gaxios` → `uuid` (buffer-bounds-check
  advisory in `uuid`'s v3/v5/v6 generation). We never call `uuid` or the Storage APIs directly — only
  Firestore — so this is dead-code exposure, not a reachable path. `npm audit fix --force` would
  downgrade `firebase-admin` to `10.3.0` (three-plus years old), which is worse. Left as-is; flagged for
  the decision memo, same treatment as the phase 1 `@vercel/node` call.
- Firebase CLI and Vercel CLI both installed globally **and authenticated** (`firebase login` completed
  in phase 3 — was deliberately deferred until rules needed deploying, see phase 0/1 notes).
- `npm test` runs the unit suite (`tsc -p tsconfig.json && node --test "dist/**/*.test.js"`) — see
  "Notable fixes" #10 for why the glob is quoted literally instead of passing a bare directory.

## Notable fixes made this session — a fresh session should know these before touching git or `api/`

1. **Git was scoped wrong.** The git repo responding to commands in this folder was actually rooted at
   `C:\Users\dhruv\.git` — the entire home directory, not this project. It was empty (zero commits), so
   nothing was lost, and it was left completely untouched — not this project's call to delete something
   outside its own folder. Fixed by running `git init` directly inside `contour-takehome/`; nested repos
   work fine, the inner one takes over for everything inside it. Branch renamed from git's default
   `master` to `main`. **If a fresh session runs `git status` or `git log` and the result looks wrong
   (e.g. history that shouldn't be there, or `git rev-parse --show-toplevel` not resolving to this
   folder), check for this again before ever running `git add -A` here** — that command stages
   repo-wide regardless of current directory, not just the cwd and below.
2. **`@vercel/node` was dropped as a dependency.** It pulled in `undici`/`tar`/`esbuild`/etc. with 8-10
   known vulnerabilities (one critical) purely for two type names (`VercelRequest`/`VercelResponse`).
   Vercel's Node runtime works fine with plain Node `http` types (`IncomingMessage`/`ServerResponse`),
   so `api/health.ts` — and future functions — are typed against those instead: zero third-party deps,
   zero vulnerabilities, and it's what Vercel actually runs server-side regardless of what's installed
   locally.
3. **`firebase login` is deliberately not done.** Not needed for anything through phase 2 — the backend
   authenticates to Firebase via the service account key already in `.env` (a completely separate auth
   path from the CLI), and the frontend uses the public web config. The CLI login only matters for
   CLI-driven deploys: pushing Firestore security rules live (phase 3) and `firebase deploy --only
   hosting` (phase 5). Pick it back up then, not before — don't re-attempt it prematurely.
4. **Vercel Hobby plan caps cron jobs at once per day** — PLANNING.md §3.6 originally called for an
   hourly roster sync; that schedule fails at `vercel deploy` time on Hobby, not just at runtime.
   Corrected to `0 3 * * *` (daily) in `vercel.json`. Not a real loss: roster data changes rarely, and
   the same endpoint still works as an on-demand manual refresh
   (`curl -H "Authorization: Bearer $CRON_SECRET" .../api/roster/sync`) whenever a faster refresh is
   needed during development. **If a future phase needs sub-daily roster freshness, that requires the
   paid Pro plan — flag before assuming otherwise.**
5. **The Staff Roster API's own pagination overlaps by one record at page boundaries** — confirmed by
   fetching all 3 pages directly: page 1's last entry (`chloe.tan@...`) is also page 2's first entry.
   Naive concatenation across pages over-counted (19 instead of 18). `fetchAllRosterStaff()` in
   `api/_lib/roster.ts` dedupes by email to correct for this — a quirk of the *external* API, not
   something we can fix upstream, so this dedup should stay even if the bug is ever patched on their
   end (harmless no-op either way).
6. **Deploy was pulled forward from phase 5 into phase 2.** Rationale: the ingestion pipe is the brief's
   top-priority fix, and its exit criterion ("a test row lands in Firestore") can't actually be verified
   without a real deployed endpoint for the Apps Script to hit — testing only via direct function calls
   (the earlier smoke test) doesn't exercise the real HTTP path, real env var config, or the real deploy
   pipeline. Frontend (phase 4) is still just a blank scaffold; deploying it now cost nothing extra since
   Vercel deploys `api/` and the static build together regardless.
7. **`frontend/` deps were never installed on Vercel's build machine — first deploy failed.** Root and
   `frontend/` were two independent npm projects (separate `package-lock.json`, separate `node_modules`).
   Vercel's build only runs `npm install` at the repo root before the custom `buildCommand`; it never
   touched `frontend/`. Worked locally by accident (both had already been installed by hand at different
   points). Fixed by converting to an npm workspace: root `package.json` gained `"workspaces":
   ["frontend"]`, `frontend/package-lock.json` was removed (npm workspaces use a single root lockfile),
   confirmed with a clean `rm -rf frontend/node_modules && npm install && npm run build`. Also added
   `buildCommand`/`outputDirectory` to `vercel.json` since zero-config detection doesn't know the static
   output lives at `frontend/dist`.
8. **`FIREBASE_SERVICE_ACCOUNT_KEY` got corrupted when first uploaded to Vercel — caused every
   Firestore-touching endpoint to 502.** Cause: uploaded via `printf '%s' "${!key}" | vercel env add ...`
   inside a loop that had done `source ./.env` first. Bash's `source` on a raw JSON value (unquoted
   in the `.env` file, containing `{`, `"`, `\n`) triggers brace expansion and quote-removal, mangling it
   (2342 chars → 2298, invalid JSON). The other 4 vars are plain hex/alphanumeric tokens with no
   bash-special characters, so they were unaffected — confirmed by reasoning about their character sets,
   since Vercel won't let a "Sensitive" var be read back for direct comparison (`vercel env pull` returns
   `[REDACTED]` for these by design). Fixed by removing and re-adding just that one var, piping in a
   value read via a small Node script instead of bash `source`, verifying `JSON.parse()` succeeded
   *before* piping it anywhere. **Lesson for future secret handling in this repo: never `source ./.env`
   in bash when a value contains `{`, `"`, `` ` ``, or `\` — read it with a real parser instead
   (Node/JS, not shell).**
9. **The Apps Script pasted into the actual sheet drifted from the canonical `Code.gs` twice, both times
   from partial manual renames.** Installable-trigger handler functions are registered by plain string at
   `ScriptApp.newTrigger('name')` call time and do **not** auto-update if the function is later renamed in
   the editor — a mismatch fails at runtime with "Script function not found: `<name>`", and it can fail
   silently-ish (the time-based trigger just shows a 100% error rate in the Triggers list; the form
   trigger just never appears to fire). Root cause both times: dropping the trailing `_` from some
   function definitions but not all call sites (or vice versa). Resolved by re-pasting a fully consistent
   version and removing `setSecret_`/`setEndpoint_` from the canonical script entirely — Script Properties
   (`INGEST_SECRET`, `INGEST_ENDPOINT_URL`) are now set directly via the Apps Script UI (Project Settings
   → Script Properties) instead of pasted into source, which also means the secret never sits in the
   visible script body even transiently. **If a fresh session hears about a "Script function not found"
   or a trigger with a nonzero error rate, check for exactly this class of bug first** — it's almost
   always a definition/call-site name mismatch, not a logic bug.

10. **`node --test <bare directory>` doesn't work reliably in this Node version (24.16.0) — fails with
    `MODULE_NOT_FOUND`, treating the directory name as a file to require.** Passing a literal glob
    pattern string instead (`node --test "dist/**/*.test.js"`) works correctly — Node resolves the glob
    itself. `package.json`'s `test` script uses the quoted-glob form for this reason; don't "simplify"
    it back to a bare `dist` path, it'll break.
11. **The 94 already-ingested real feedback rows needed a live migration when the PII split landed.**
    They were written under the old (phase 2) schema with `parentName`/`studentName` inline. A one-off
    script moved those two fields out into new `feedbackPii/{rowId}` docs and deleted them from
    `feedback/{rowId}` via `FieldValue.delete()`, verified field-by-field afterward (94 docs in, 94
    `feedbackPii` docs out, spot-checked samples). Necessary because otherwise a tutor allowed to read
    an old `feedback` doc for their own class would still receive the PII fields still sitting on it —
    the new rules only gate the collections, they don't retroactively strip fields from documents
    written under the old shape.

## Immediate next step

Phase 3 is done, deployed, and live-verified — confirmed by actually signing in as the lead, coordinator,
and tutor test accounts and hitting the Firestore REST API with their real tokens: tutor sees own class
(200), denied other classes (403), denied all PII (403), can read the staff directory (200); lead and
coordinator see any class and all PII (200 across the board).

Phase 4 (frontend) is next: login screen, live feedback queue (sorted by priority tier, filterable),
mark-as-handled, AI summary panel, Contour-styled UI per PLANNING.md §2.4. It can now build against the
real deployed API and real Firestore data (94 real rows, real roles) instead of mocks. Test sign-ins:
the three seeded accounts (`marcus.chen@...` / `nadia.rahman@...` / `rohan.iyer@...`
`@contoureducation.example`), shared password in root `.env` as `TEST_ACCOUNT_PASSWORD`.
