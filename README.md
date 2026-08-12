# Contour feedback tool

Live trial-class feedback queue for the Student Experience team: parent feedback lands here as it's
submitted, sorted by urgency, with role-scoped visibility and an on-demand AI summary. Built for the
Contour take-home assessment.

- **Live app:** https://contour-takehome.web.app
- **Backend API:** https://contour-takehome.vercel.app
- **Google Form** (feeds the sheet that feeds the pipeline): https://docs.google.com/forms/d/e/1FAIpQLSe5PPMERtbxWxp7-VeKZx8JeAWEnGc9QN_UWld9s1o64rn_7g/viewform
- Full build history, research findings, and the reasoning behind every decision: [PLANNING.md](PLANNING.md)
- Phase-by-phase build status and notable bugs/fixes: [PROGRESS.md](PROGRESS.md)

## Layout

```
frontend/       React + Vite + TypeScript app, deployed to Firebase Hosting
api/            Vercel serverless functions (ingest webhook, roster sync, AI summary, auth role sync)
  _lib/         Shared pure logic (priority tiering, access control, roster fetch, Gemini client) + tests
apps-script/    Google Apps Script bound to the feedback sheet (Code.gs is the source of truth for review;
                the sheet's own copy is what actually runs — Apps Script doesn't deploy from git)
scripts/        One-off/setup scripts (seed-test-accounts.js)
firestore.rules, firestore.indexes.json   Firestore security rules
firebase.json, .firebaserc                Firebase Hosting + project config
vercel.json                               Vercel build/output config + cron schedule
```

## Architecture, in one paragraph

A Google Form feeds a Sheet; an Apps Script installable trigger (plus a 5-minute safety-net sweep) pushes
each new row to `POST /api/feedback/ingest` on Vercel, which resolves the row's tutor from a Firestore-cached
staff roster, computes a priority tier, and upserts into Firestore. A Vercel cron job refreshes that staff
roster from Contour's Staff Roster API once a day. The React frontend (Firebase Hosting) authenticates via
Firebase Auth, calls `/api/auth/sync-role` once per sign-in to get role/class custom claims, then reads the
live feedback queue directly from Firestore (`onSnapshot`) — Firestore security rules enforce the same
role/class scoping server-side, not just in the UI. An on-demand `/api/summary/generate` endpoint sends
Gemini a plain-text summary prompt over whatever's currently filtered into view.

See [PLANNING.md §6](PLANNING.md#6-architecture-text-diagram) for the full text diagram.

## Prerequisites

- Node 20+ (built and tested on 24.16.0)
- npm 10+
- [Firebase CLI](https://firebase.google.com/docs/cli) (`npm i -g firebase-tools`), logged in
  (`firebase login`) — only needed to deploy Hosting or Firestore rules
- [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`), logged in (`vercel login`) — only needed
  to deploy the API or manage env vars
- A Firebase project with Firestore + Email/Password Auth enabled, and a Vercel project — or reuse the ones
  this was built against (ask for access)

## Environment variables

Two separate env files, neither committed (`.gitignore` covers `.env*`):

**Root `.env`** (backend — Vercel functions read these; copy `.env.example` and fill in):

| Var | Used by | Notes |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | all `/api` functions | Firebase service account JSON, minified to one line |
| `ROSTER_API_KEY` | `/api/roster/sync` | Contour Staff Roster API key, sent as `X-Api-Key` header |
| `GEMINI_API_KEY` | `/api/summary/generate` | Google AI Studio key |
| `INGEST_WEBHOOK_SECRET` | `/api/feedback/ingest` | Shared secret checked against the Apps Script's payload |
| `CRON_SECRET` | `/api/roster/sync` | Must be named exactly this — Vercel auto-authorizes its own cron calls with this value as a Bearer token |
| `TEST_ACCOUNT_PASSWORD` | `scripts/seed-test-accounts.js` (local only, not deployed) | Shared password for the three seeded role accounts |

**`frontend/.env`** (frontend — Vite bundles anything prefixed `VITE_`; copy `frontend/.env.example`):

`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` — the web app
config from Firebase console (not secret, but kept out of source anyway); `VITE_API_BASE_URL` — the stable
Vercel production alias (`https://contour-takehome.vercel.app`), not a per-deployment `*.vercel.app` URL.

## Local development

```bash
npm install              # installs root + frontend workspace together (single lockfile)
npm run dev               # starts the Vite dev server on http://localhost:5173
npm test                   # compiles api/_lib and runs the unit suite (node --test)
npm run build              # production build of frontend/
```

`api/` functions aren't run by `npm run dev` — that only serves the frontend. To exercise the API locally,
either point `frontend/.env`'s `VITE_API_BASE_URL` at the deployed Vercel URL (simplest), or run
`vercel dev` from the repo root.

## Deploying

```bash
# Frontend → Firebase Hosting
npm run build
firebase deploy --only hosting

# Firestore security rules
firebase deploy --only firestore:rules

# Backend → Vercel (production)
vercel deploy --prod
```

After a Hosting deploy, if the assigned origin ever differs from `contour-takehome.web.app` /
`contour-takehome.firebaseapp.com`, add it to `ALLOWED_ORIGINS` in [api/_lib/cors.ts](api/_lib/cors.ts) —
those are the only two browser-facing endpoints (`auth/sync-role`, `summary/generate`) that need CORS at
all, since the frontend (Hosting) and backend (Vercel) are different origins by design.

## Seeding test accounts

```bash
node scripts/seed-test-accounts.js
```

Idempotent — safe to re-run. Creates/updates one Firebase Auth account per role using real roster
identities (see the decision memo for the actual emails/password) and sets their custom claims directly, so
they're usable immediately without waiting on a frontend sign-in to call `/api/auth/sync-role`.

## Apps Script setup

See [apps-script/README.md](apps-script/README.md) for pasting `Code.gs` into the sheet and configuring its
Script Properties — this is what pushes new form submissions into the pipeline.

## Testing

`npm test` runs `node --test` over the pure-logic modules in `api/_lib/` (priority tiering, class-scoping
access rules, the PII-redaction guarantee, summary prompt building, roster pagination de-dup) — 18+ unit
tests, no emulator or network calls. There's no full end-to-end suite; see PLANNING.md §10 for what's
explicitly out of scope and why.

## Known limitations / residual risks

See the decision memo for the full list (inherited-script fix summary, deliberately-cut scope, and
pre-rollout flags). The short version: the Apps Script's shared secret can't be a true secret because the
sheet must be shared as "anyone with the link: editor" (documented, low-severity — see
[apps-script/README.md](apps-script/README.md#known-residual-risk)); roster sync runs daily, not hourly,
because Vercel's free Hobby plan caps cron at once/day; and grouping coordinators with lead for
full-visibility access was an inference from the original Slack brief, not something stated explicitly —
flagged for confirmation before a real rollout.
