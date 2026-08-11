# Contour feedback tool

Work in progress — see [PLANNING.md](PLANNING.md) for full context, research findings, architecture,
and every decision made so far (and why).

## Layout

- `frontend/` — React + Vite + TypeScript app, deployed to Firebase Hosting
- `api/` — Vercel serverless functions (ingest webhook, roster sync, AI summary, auth role sync)
- `apps-script/` — reference copy of the Google Apps Script bound to the feedback sheet

Setup instructions and the full environment variable list will be filled in here as each build phase
lands (see PLANNING.md's phased plan).
