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

**Phase 4 — Frontend: complete and verified live against the real deployed backend and real
Firestore data (94 real rows), signed in as all three seeded accounts in an actual browser.**
Exit criterion met: full flow (login → live scoped/redacted queue → mark handled → AI summary)
works end-to-end for lead, coordinator, and tutor. Two genuine production bugs were caught and
fixed only because of that live walkthrough — see "Notable fixes" #12 and #14; neither would have
been caught by unit tests or a build check alone.
- `frontend/src/lib/firebase.ts` — Firebase client SDK init (`firebase` package added, 0
  vulnerabilities) from `VITE_FIREBASE_*` env vars; exports `auth`, `db`, `API_BASE_URL`.
- `frontend/src/context/AuthContext.tsx` — email/password sign-in, calls `/api/auth/sync-role` and
  force-refreshes the ID token on every sign-in (including a returning session on page load, not
  just a fresh login) so custom claims are always current before any Firestore read.
- `frontend/src/hooks/useFeedback.ts` — live `onSnapshot` on `feedback` (see "Notable fixes" #14
  for why tutor queries must declare `where('class', 'in', classes)` rather than relying on rules
  to filter an unscoped query), plus `feedbackPii` for lead/coordinator only. Resets state on every
  role/classes change so a slower or failed subscription for a newly-signed-in user can never
  leave a previous user's data on screen in the same tab.
- `frontend/src/hooks/useStaffDirectory.ts` — live `staff` directory (readable by any
  authenticated user per firestore.rules) for tutor-name display and the class filter dropdown.
- `frontend/src/lib/queue.ts` — pure `sortFeedback`/`filterFeedback`/`describeScope`, mirroring the
  tiering/FIFO rules in PLANNING.md section 3.2 client-side.
- `frontend/src/pages/Login.tsx`, `Dashboard.tsx` — login screen; live queue with status
  (Active/Handled/All) and tier filter chips, a class dropdown (lead/coordinator only, since
  tutors are already scoped), mark-handled/mark-unhandled, and the redaction fallback ("Family —
  [class]") for tutors, who never even issue the `feedbackPii` subscription in the first place.
- `frontend/src/components/SummaryPanel.tsx` + `api/summary/generate.ts` — on-demand AI summary of
  whatever's currently filtered into view. The client sends only the fields the model needs from
  items it already legitimately fetched under Firestore rules; the endpoint never re-derives or
  widens that scope, just requires a valid Firebase ID token (so the free Gemini quota isn't open
  to the internet) and persists to `summaries/{scopeKey}` via Admin SDK for audit (the client never
  reads that collection back — it gets the text directly in the HTTP response — so
  firestore.rules' phase-1 lockdown on `summaries` didn't need to change).
- `api/_lib/summaryPrompt.ts` (+ 7 unit tests), `api/_lib/gemini.ts` — pure prompt builder and a
  plain `fetch`-based Gemini REST call (no `@google/genai` dependency, matching this repo's
  minimal-dependency pattern). Model pinned to the `gemini-flash-latest` alias, not a dated
  snapshot — see "Notable fixes" #13.
- `api/_lib/cors.ts` — CORS for the two browser-facing endpoints only (`auth/sync-role`,
  `summary/generate`); `ingest`/`roster/sync` are server-to-server only and deliberately left
  without it. Frontend (Firebase Hosting) and backend (Vercel) are different origins by design —
  see PLANNING.md section 3.4.
- Contour design tokens (cream/navy/lime/pill radius scale, Inter + Space Grotesk via Google
  Fonts) implemented directly in `frontend/src/index.css` per PLANNING.md section 2.4; default
  Vite scaffold (App.css, react.svg, vite.svg, hero.png) removed.
- `frontend/.env`'s `VITE_API_BASE_URL` filled in with the stable `https://contour-takehome.vercel.app`
  alias (not a per-deployment `*.vercel.app` URL).
- `.claude/launch.json` added (`npm run dev --prefix frontend` on port 5173) so the dev server can
  be previewed without recreating this each session.

**Phases 5-6: not started.**

## Local environment state

- Root `.env` (gitignored, never committed): `FIREBASE_SERVICE_ACCOUNT_KEY`, `ROSTER_API_KEY`,
  `GEMINI_API_KEY`, `INGEST_WEBHOOK_SECRET`, `CRON_SECRET`, and (phase 3) `TEST_ACCOUNT_PASSWORD` all
  set. `.env.example` updated to match — still blank there.
- `frontend/.env` (gitignored): all six `VITE_FIREBASE_*` values set from the real `contour-takehome`
  web app config, plus (phase 4) `VITE_API_BASE_URL=https://contour-takehome.vercel.app`.
- `npm audit`, frontend: 0 vulnerabilities (`firebase` client SDK added in phase 4, no new advisories).
  Root: **6 moderate**, all transitive through `firebase-admin` → `@google-cloud/storage` →
  `teeny-request`/`gaxios` → `uuid` (buffer-bounds-check advisory in `uuid`'s v3/v5/v6 generation). We
  never call `uuid` or the Storage APIs directly — only Firestore — so this is dead-code exposure, not a
  reachable path. `npm audit fix --force` would downgrade `firebase-admin` to `10.3.0` (three-plus years
  old), which is worse. Left as-is; flagged for the decision memo, same treatment as the phase 1
  `@vercel/node` call. Unrelated to this, root `package.json` also gained an `overrides` entry pinning
  `jose` to `5.10.0` in phase 4 — that one's a hard functional fix, not an audit-severity call, see
  "Notable fixes" #13.
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

12. **`api/auth/sync-role.ts` had been silently broken in production since phase 3, undetected
    until phase 4's frontend actually called it live.** Root cause: it imported `getAuth` directly
    from `'firebase-admin/auth'` and called it as its *first* Admin SDK operation. That bare
    `getAuth()` resolves the *default* Firebase app via its own lifecycle lookup; nothing had
    called `initializeApp()` yet in that code path (that only happened later, inside `getDb()`, or
    not at all if the handler returned before reaching it). On a cold Vercel invocation this threw
    `FirebaseAppError: The default Firebase app does not exist` — caught by a generic `catch {}`
    and reported to the client as a plain "invalid or expired token" 401, indistinguishable from an
    actually-bad token. Phase 3's "live verification" (see #11's note above) tested Firestore
    rules directly via REST calls using tokens whose custom claims were already set by
    `scripts/seed-test-accounts.js` — it never actually invoked this deployed endpoint, so the bug
    sat live and undetected through all of phase 3. Fixed by adding `getAdminAuth()` to
    `api/_lib/firebaseAdmin.ts`, which guarantees `getAdminApp()` (and thus `initializeApp()`) runs
    first; `sync-role.ts` and `summary/generate.ts` now import `getAdminAuth` from there instead of
    a bare `firebase-admin/auth` import. **Any new endpoint that needs Firebase Auth (not just
    Firestore) must go through `getAdminAuth()`, never `getAuth()` imported directly — grep for
    `from 'firebase-admin/auth'` outside `_lib/firebaseAdmin.ts` if this class of bug resurfaces.**
13. **`firebase-admin@14.2.0`'s dependency chain crashes on Vercel with `ERR_REQUIRE_ESM`,
    independent of #12.** `firebase-admin`'s `utils/jwt.js` does a top-level `require('jwks-rsa')`,
    which depends on `jose@6.2.8` — an ESM-only package as of v6 — via a synchronous `require()`.
    Because this `require` sits at module load time, *any* function that imports anything from
    `firebase-admin/auth` crashes immediately on Vercel's Node runtime, before any of the
    handler's own code runs. Fixed with an npm `overrides` entry pinning `jose` to `5.10.0` (last
    major with real CJS support) in the root `package.json` — `npm install` after adding it
    correctly re-resolves the nested `node_modules/jwks-rsa/node_modules/jose` copy. **Do not bump
    `firebase-admin` past 14.x without first checking whether the override is still needed** (i.e.
    whether `jwks-rsa`/`jose` have fixed the CJS/ESM interop upstream).
14. **The Gemini model name in `api/_lib/gemini.ts` was originally `gemini-2.5-flash` — a live
    404 in production** ("no longer available to new users") even though `ListModels` still listed
    it for this key. Google rotates which dated snapshots are servable per-key without much
    notice. Fixed by switching to the `gemini-flash-latest` alias, which Google keeps pointed at a
    current fast/free-tier model. **If summary generation ever 404s again, check
    `GET /v1beta/models?key=...` against the model name in `gemini.ts` before assuming it's a code
    bug** — it's almost always the model name going stale, not the request shape.
15. **Firestore rejects an entirely-unfiltered `list` query outright (`PERMISSION_DENIED`) once the
    rule depends on per-document data — it does *not* silently filter results the way `get` does.**
    Confirmed directly against the REST API (`runQuery` with a tutor's real token, no `where`
    clause, on `feedback`): a flat 403, not a filtered result set. This invalidated the original
    assumption in PLANNING.md section 5 that an unscoped client query would "just" come back
    correctly scoped per role. Fixed in `frontend/src/hooks/useFeedback.ts`: lead/coordinator still
    query `feedback` unfiltered (the rule for them is unconditionally true, which Firestore *can*
    prove without inspecting per-doc data, so that query is allowed); tutors now query with
    `where('class', 'in', classes)`, mirroring the rule's own condition exactly. A tutor with an
    empty `classes[]` (the Ethan Moreau edge case, PLANNING.md section 2.3) skips the subscription
    entirely rather than issuing a `where('class', 'in', [])` — Firestore throws at query
    *construction* time for an empty `in` array, before the request ever goes out.
16. **Compounding #15: switching between roles in the same browser tab (sign out, sign back in as
    someone else, no full reload) left the previous user's feedback items on screen.** `useFeedback`
    never cleared its `items` state when the tutor query above failed outright — the successful
    coordinator snapshot from moments earlier just sat in React state untouched, since the error
    callback only set an error message, never cleared data. This is exactly the class of bug a
    unit test can't catch (there's no unit around a live `onSnapshot` subscription) and manual
    testing did: signing in as coordinator then tutor, in the same tab, showed the tutor account
    all 94 rows instead of their own ~19. Fixed by resetting `items`/`piiById` at the start of every
    role/classes change and on any subscription error, not just on success.
17. **The AI summary rendered with raw, unparsed markdown** (`**bold**`, `### headers`, `---`,
    emoji) because `SummaryPanel.tsx` renders the response as plain text (`white-space: pre-wrap`
    in a `<p>`), not through a markdown parser — and adding one just for this panel wasn't worth a
    new dependency. Fixed at the source instead: `api/_lib/summaryPrompt.ts`'s prompt now
    explicitly instructs Gemini to output plain text only (no asterisks/`#`/`---`/backticks/emoji,
    section labels as a plain line ending in a colon, list items as a leading dash) — verified live
    against the deployed endpoint with mixed-sentiment test data, response contains no markdown
    characters and renders cleanly with the existing plain-text styling.
18. **A real ingestion incident, caused by the form-relinking workaround itself (`Form Responses 1`
    is view-only for Dhruv — see PLANNING.md section 7 and the "how do I add it to the original
    sheet" thread): swapping in a replacement tab under that same name broke the row-based
    idempotency scheme.** `feedback`/`feedbackPii` document IDs were `row_<sheet row number>` —
    fine as long as exactly one tab named `Form Responses 1` exists for the sheet's entire
    lifetime, but the new tab's row numbering restarts from 1, so its row 2 and row 3 collided
    with the *historical* tab's row 2 and row 3. Confirmed live: a first test submission (row 2)
    landed nowhere in Firestore (see next paragraph for why), and a second (row 3) silently
    overwrote a real historical feedback doc's content in place. **Not a one-time fluke** — every
    future submission through the new tab would keep colliding with (and silently corrupting)
    historical rows 4 through 95 until the new tab's own count finally passed 95.
    - Root cause of the *first* row going missing entirely (compounding the collision issue):
      `pushRow_`'s pointer-advancement wasn't scoped to the safety net's own ordered sweep — the
      live `onFormSubmitInstalled_` event path called it too. Row 3's live event apparently fired
      and succeeded while row 2's didn't (plausible propagation lag right after linking a new form
      to the spreadsheet), and that success alone advanced `LAST_SYNCED_ROW` to 3 — so by the time
      any 5-minute safety-net sweep ran, it started scanning from row 4, permanently unable to loop
      back for row 2. Fixed in `apps-script/Code.gs`: only `syncSafetyNet_`'s own sequential sweep
      advances `LAST_SYNCED_ROW` now, and only through the longest *unbroken* run of successes
      starting right after the current pointer — a later row succeeding out of order can no longer
      strand an earlier one. The event trigger still pushes immediately for low latency, it just
      never touches the pointer. Every row in range is still retried every sweep regardless, so a
      genuinely transient failure still self-heals on the next pass instead of blocking forever.
    - Root cause of the *collision/overwrite* itself: fixed by keying documents off
      `(sheet_id, row_number)` together instead of `row_number` alone. `sheet_id` is
      `sheet.getSheetId()` — a tab's stable internal ID, assigned once at creation, unchanged by
      renames, always fresh for a brand-new tab — added to the Apps Script payload
      (`buildPayload_`) and to `api/feedback/ingest.ts`'s validation and `rowId` construction
      (`row_${sheet_id}_${row_number}`). This permanently prevents this exact class of collision
      even if a tab gets swapped again in the future, with no migration of historical data needed —
      old docs keep their old `row_<n>` IDs untouched, only new ingests use the new format.
    - The two actual test rows from this incident were manually verified into Firestore directly
      (row 2 via a one-off authenticated call to `/api/feedback/ingest` with its real field values,
      row 3 already correct from the live trigger's earlier success) — both still under the old
      `row_<n>` ID format from before this fix landed, which is harmless: they're correct content,
      just an old-style ID, and nothing dedupes against them going forward. **If a fresh session
      needs to relink a form to a sheet again, expect this exact class of bug and check whether the
      relevant tab is truly a fresh tab (new row numbering) before assuming row numbers are safe to
      reuse as document identity.**
    - **Confirmed fixed live, end to end, after both patches landed:** Dhruv re-pasted the updated
      `Code.gs`, submitted a fresh response through the new form, and it appeared correctly and
      immediately in the deployed dashboard with no manual intervention — the same sequence the
      walkthrough video needs to show (form → sheet → app, live). This is also the first time the
      *entire* pipe was exercised through a real Google Form rather than a direct API call or the
      original historical backfill, so it's a stronger confirmation of phase 2's exit criterion than
      what existed before this session.

## Immediate next step

Phase 4 is done and live-verified end-to-end in a real browser against the real deployed backend and
real Firestore data — signed in as all three seeded accounts and confirmed: lead and coordinator both
see all 94 rows with real names and can generate an AI summary and mark items handled; tutor
(rohan.iyer) sees exactly their own 19 rows across their 5 classes, names redacted to "Family — [class]",
no class filter shown, and can still summarize/mark-handled within that scope. Two real production bugs
(sync-role's cold-start crash, and the tutor query being outright rejected instead of filtered) were
only caught because of this live walkthrough — see "Notable fixes" #12 and #15/#16.

Phase 5 (deploy & verify) is next: `firebase deploy --only hosting` to publish the frontend build to
Firebase Hosting, add the resulting Hosting origin(s) to `api/_lib/cors.ts`'s allowlist (currently only
`contour-takehome.web.app`/`contour-takehome.firebaseapp.com` are pre-populated — confirm these match
what Firebase actually assigns once Hosting is live), then repeat the same three-role smoke test against
the deployed Hosting URL instead of localhost. Phase 6 (deliverables: README, decision memo,
#ops-requests announcement, video shot-list, `.zip`) follows once Phase 5's smoke test passes.
