import type { IncomingMessage, ServerResponse } from 'node:http';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getDb } from '../_lib/firebaseAdmin';
import { readJsonBody, sendJson } from '../_lib/http';
import { buildSummaryPrompt, slugifyScope, type SummaryItem } from '../_lib/summaryPrompt';
import { generateSummaryText } from '../_lib/gemini';
import { applyCors } from '../_lib/cors';

const MAX_ITEMS = 500;

function isValidItem(v: unknown): v is SummaryItem {
  if (typeof v !== 'object' || v === null) return false;
  const item = v as Record<string, unknown>;
  return (
    typeof item.class === 'string' &&
    typeof item.rating === 'number' &&
    typeof item.continuing === 'string' &&
    typeof item.contactRequested === 'string' &&
    typeof item.comments === 'string' &&
    (item.priorityTier === 1 || item.priorityTier === 2 || item.priorityTier === 3) &&
    typeof item.handled === 'boolean'
  );
}

function extractBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

// On-demand only (never runs automatically at ingest) — summarizes whatever the caller is
// currently looking at. The client sends the feedback items it already legitimately fetched
// under Firestore rules; this endpoint doesn't re-derive or widen that scope, it only requires a
// valid Firebase ID token so the free Gemini quota isn't exposed to the open internet. See
// PLANNING.md section 3.7.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    sendJson(res, 500, { error: 'GEMINI_API_KEY not configured' });
    return;
  }

  const idToken = extractBearerToken(req);
  if (!idToken) {
    sendJson(res, 401, { error: 'missing bearer token' });
    return;
  }
  try {
    await getAdminAuth().verifyIdToken(idToken);
  } catch {
    sendJson(res, 401, { error: 'invalid or expired token' });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'invalid JSON body' });
    return;
  }

  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { error: 'payload failed validation' });
    return;
  }
  const { scopeLabel, items } = body as Record<string, unknown>;
  if (typeof scopeLabel !== 'string' || !scopeLabel.trim() || !Array.isArray(items) || items.length > MAX_ITEMS) {
    sendJson(res, 400, { error: 'payload failed validation' });
    return;
  }
  if (!items.every(isValidItem)) {
    sendJson(res, 400, { error: 'one or more items failed validation' });
    return;
  }

  if (items.length === 0) {
    sendJson(res, 200, { text: 'Nothing in this view yet — no feedback to summarize.', basedOnCount: 0 });
    return;
  }

  try {
    const prompt = buildSummaryPrompt(scopeLabel, items);
    const text = await generateSummaryText(geminiKey, prompt);
    const scopeKey = slugifyScope(scopeLabel);

    await getDb()
      .collection('summaries')
      .doc(scopeKey)
      .set({ scope: scopeLabel, text, basedOnCount: items.length, generatedAt: FieldValue.serverTimestamp() });

    sendJson(res, 200, { text, basedOnCount: items.length, scopeKey });
  } catch (err) {
    sendJson(res, 502, { error: err instanceof Error ? err.message : 'summary generation failed' });
  }
}
