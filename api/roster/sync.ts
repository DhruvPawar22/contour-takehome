import type { IncomingMessage, ServerResponse } from 'node:http';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../_lib/firebaseAdmin';
import { fetchAllRosterStaff } from '../_lib/roster';
import { sendJson } from '../_lib/http';

// Triggered by Vercel Cron (daily — Hobby plan caps cron frequency at once/day; a schedule more
// frequent than that fails deployment outright, see PLANNING.md section 3.6) and callable by hand
// during development: curl -H "Authorization: Bearer <CRON_SECRET>" .../api/roster/sync
// Vercel auto-sends that same header on cron invocations because the env var is named CRON_SECRET.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  const expected = process.env.CRON_SECRET;
  if (!expected) {
    sendJson(res, 500, { error: 'CRON_SECRET not configured' });
    return;
  }
  if (req.headers.authorization !== `Bearer ${expected}`) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }

  const rosterApiKey = process.env.ROSTER_API_KEY;
  if (!rosterApiKey) {
    sendJson(res, 500, { error: 'ROSTER_API_KEY not configured' });
    return;
  }

  try {
    const staff = await fetchAllRosterStaff(rosterApiKey);
    const db = getDb();
    const batch = db.batch();

    for (const member of staff) {
      const ref = db.collection('staff').doc(member.email);
      batch.set(ref, {
        name: member.name,
        email: member.email,
        role: member.role,
        classes: member.classes,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    batch.set(db.collection('config').doc('rosterSync'), {
      lastSyncedAt: FieldValue.serverTimestamp(),
      lastStaffCount: staff.length,
    });

    await batch.commit();
    sendJson(res, 200, { synced: staff.length });
  } catch (err) {
    sendJson(res, 502, { error: err instanceof Error ? err.message : 'roster sync failed' });
  }
}
