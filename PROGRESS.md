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

**Phase 2 — Ingestion pipe: not started — this is the next task.** Rewrite the Apps Script (installable
`onFormSubmit` trigger + time-based safety net, exact design in PLANNING.md section 3.5) and build
`/api/feedback/ingest` plus roster sync (`/api/roster/sync` + cron). Will need Dhruv to paste the
rewritten script into the sheet's Extensions → Apps Script editor and wire up the triggers once it's
written — that part can't be done remotely.

**Phases 3-6: not started.**

## Local environment state

- Root `.env` (gitignored, never committed): `FIREBASE_SERVICE_ACCOUNT_KEY` set, `ROSTER_API_KEY` set,
  `GEMINI_API_KEY` set, `INGEST_WEBHOOK_SECRET` still blank (generated when phase 2 builds the ingest
  endpoint).
- `frontend/.env` (gitignored): all six `VITE_FIREBASE_*` values set from the real `contour-takehome`
  web app config. `VITE_API_BASE_URL` still blank (filled in once the api exists locally/deployed).
- `npm audit`: 0 vulnerabilities, both root and frontend.
- Firebase CLI and Vercel CLI installed globally. Vercel CLI is authenticated. Firebase CLI is not
  (intentional, see below).

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

## Immediate next step

Phase 2: rewrite the Apps Script per PLANNING.md section 3.5, then build `/api/feedback/ingest` and the
roster sync endpoint + cron. Needs Dhruv to paste the new script into the sheet and wire up triggers
once it exists.
