import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../_lib/firebaseAdmin';
import { computePriorityTier } from '../_lib/priority';
import { buildFeedbackDocs } from '../_lib/feedbackDoc';
import { readJsonBody, sendJson } from '../_lib/http';

const CONTINUING_VALUES = new Set(['Yes', 'Not sure', 'No']);
const YES_NO_VALUES = new Set(['Yes', 'No']);

interface IngestPayload {
  secret: string;
  row_number: number;
  submitted_at: string;
  parent_name: string;
  student_name: string;
  class_label: string;
  rating: number;
  continuing: string;
  contact_requested: string;
  comments: string;
}

function isValidPayload(body: unknown): body is IngestPayload {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.secret === 'string' &&
    Number.isInteger(b.row_number) &&
    (b.row_number as number) > 0 &&
    typeof b.submitted_at === 'string' &&
    typeof b.parent_name === 'string' &&
    typeof b.student_name === 'string' &&
    typeof b.class_label === 'string' &&
    b.class_label !== '' &&
    typeof b.rating === 'number' &&
    b.rating >= 1 &&
    b.rating <= 5 &&
    typeof b.continuing === 'string' &&
    CONTINUING_VALUES.has(b.continuing) &&
    typeof b.contact_requested === 'string' &&
    YES_NO_VALUES.has(b.contact_requested) &&
    typeof b.comments === 'string'
  );
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Receives one feedback row from the Apps Script trigger (installable onFormSubmit, plus a
// time-based safety net — see PLANNING.md section 3.5). The shared secret here is a low-trust
// integrity check, not a real auth boundary — the sheet must be "anyone with the link: editor",
// so anyone with edit access can read it from Script Properties. This endpoint can only ever
// create shape-validated feedback rows, so a leaked secret's blast radius is limited to fake rows.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  const expectedSecret = process.env.INGEST_WEBHOOK_SECRET;
  if (!expectedSecret) {
    sendJson(res, 500, { error: 'INGEST_WEBHOOK_SECRET not configured' });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'invalid JSON body' });
    return;
  }

  if (!isValidPayload(body)) {
    sendJson(res, 400, { error: 'payload failed validation' });
    return;
  }

  if (!secretMatches(body.secret, expectedSecret)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }

  try {
    const db = getDb();

    const tutorMatch = await db
      .collection('staff')
      .where('classes', 'array-contains', body.class_label)
      .limit(1)
      .get();
    const tutorEmail = tutorMatch.empty ? null : tutorMatch.docs[0].id;
    const unmatchedClass = tutorMatch.empty;

    const priorityTier = computePriorityTier({
      rating: body.rating,
      continuing: body.continuing,
      contactRequested: body.contact_requested,
      comments: body.comments,
    });

    const rowId = `row_${body.row_number}`;
    const ref = db.collection('feedback').doc(rowId);
    // parentName/studentName live in a separate collection with its own security rules (lead/
    // coordinator only) — Firestore rules can only allow-or-deny a whole document on read, not
    // individual fields, so genuine tutor redaction requires the PII to never be part of the
    // document a tutor is allowed to read at all. See PLANNING.md section 3.1/4.
    const piiRef = db.collection('feedbackPii').doc(rowId);
    const { feedbackDoc, piiDoc } = buildFeedbackDocs(body, tutorEmail, unmatchedClass, priorityTier);

    // Upsert keyed by row number (idempotent by construction — a safety-net retry of an
    // already-ingested row can never duplicate it). Existing handled/handledBy/handledAt/createdAt
    // are deliberately left untouched on re-delivery so a retry can't undo staff already
    // marking an item handled.
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        tx.set(ref, {
          ...feedbackDoc,
          handled: false,
          handledBy: null,
          handledAt: null,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.set(ref, feedbackDoc, { merge: true });
      }
      tx.set(piiRef, piiDoc);
    });

    sendJson(res, 200, { ok: true, id: ref.id, priorityTier, tutorEmail, unmatchedClass });
  } catch (err) {
    sendJson(res, 502, { error: err instanceof Error ? err.message : 'ingest failed' });
  }
}
