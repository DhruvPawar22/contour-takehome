import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAdminAuth, getDb } from '../_lib/firebaseAdmin';
import { sendJson } from '../_lib/http';
import { applyCors } from '../_lib/cors';

function extractBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

// Called by the frontend once, right after Firebase Auth sign-in. Verifies the caller's own ID
// token (never a client-supplied uid/email — role escalation isn't possible this way), looks up
// their email in the roster-synced staff collection, and sets role/classes as custom claims so
// Firestore security rules can read them from the token. There's no Cloud Functions auth-trigger
// available on a card-free plan, so this has to be an explicit call instead of running
// automatically on sign-up. The client must force-refresh its ID token afterward
// (getIdToken(true)) for the new claims to take effect in subsequent Firestore reads.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  const idToken = extractBearerToken(req);
  if (!idToken) {
    sendJson(res, 401, { error: 'missing bearer token' });
    return;
  }

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    sendJson(res, 401, { error: 'invalid or expired token' });
    return;
  }

  const email = decoded.email;
  if (!email) {
    sendJson(res, 400, { error: 'token has no email' });
    return;
  }

  try {
    const db = getDb();
    const staffDoc = await db.collection('staff').doc(email.toLowerCase()).get();
    if (!staffDoc.exists) {
      sendJson(res, 403, { error: 'not a recognized staff member' });
      return;
    }

    const { role, classes } = staffDoc.data() as { role: string; classes: string[] };
    await getAdminAuth().setCustomUserClaims(decoded.uid, { role, classes });

    sendJson(res, 200, { ok: true, role, classes });
  } catch (err) {
    sendJson(res, 502, { error: err instanceof Error ? err.message : 'role sync failed' });
  }
}
