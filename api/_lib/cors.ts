import type { IncomingMessage, ServerResponse } from 'node:http';

// Frontend (Firebase Hosting) and backend (Vercel) are deliberately different origins — see
// PLANNING.md section 3.4/6 for why Firebase Functions wasn't used. Only the two endpoints the
// browser calls directly (auth/sync-role, summary/generate) need CORS; ingest and roster/sync are
// server-to-server only (Apps Script, cron) and are intentionally left without it.
const ALLOWED_ORIGINS = new Set([
  'https://contour-takehome.web.app',
  'https://contour-takehome.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:4173',
]);

// Returns true if the request was a preflight OPTIONS request that this function already
// answered — the caller should return immediately without running its own handler logic.
export function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}
