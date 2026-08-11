#!/usr/bin/env node
// Seeds one Firebase Auth email/password test account per role (lead/coordinator/tutor), using
// real roster identities so behavior matches production exactly. Idempotent — safe to re-run
// (updates the password/claims if the account already exists rather than failing).
//
// Usage: node scripts/seed-test-accounts.js
// Requires FIREBASE_SERVICE_ACCOUNT_KEY and TEST_ACCOUNT_PASSWORD in the root .env.

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function loadEnv() {
  const raw = fs.readFileSync(path.join(repoRoot, '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    if (!(key in process.env)) {
      process.env[key] = t.slice(idx + 1).trim();
    }
  }
}

loadEnv();

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const TEST_ACCOUNTS = [
  { email: 'marcus.chen@contoureducation.example', expectRole: 'lead' },
  { email: 'nadia.rahman@contoureducation.example', expectRole: 'coordinator' },
  { email: 'rohan.iyer@contoureducation.example', expectRole: 'tutor' },
];

async function main() {
  const password = process.env.TEST_ACCOUNT_PASSWORD;
  if (!password) {
    console.error('TEST_ACCOUNT_PASSWORD not set in .env');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();
  const auth = getAuth();

  const results = [];

  for (const { email, expectRole } of TEST_ACCOUNTS) {
    const staffDoc = await db.collection('staff').doc(email).get();
    if (!staffDoc.exists) {
      console.error(`No staff/${email} doc found — run roster sync first.`);
      process.exit(1);
    }
    const staff = staffDoc.data();
    if (staff.role !== expectRole) {
      console.error(`${email}: expected role "${expectRole}" but roster has "${staff.role}" — roster may have changed, update TEST_ACCOUNTS.`);
      process.exit(1);
    }

    let user;
    try {
      user = await auth.createUser({ email, password, displayName: staff.name });
      console.log(`created  ${email} (${staff.role})`);
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        user = await auth.getUserByEmail(email);
        await auth.updateUser(user.uid, { password, displayName: staff.name });
        console.log(`updated  ${email} (${staff.role})`);
      } else {
        throw err;
      }
    }

    await auth.setCustomUserClaims(user.uid, { role: staff.role, classes: staff.classes });
    results.push({ email, role: staff.role, classes: staff.classes.length, uid: user.uid });
  }

  console.log('\nSeeded accounts (password is TEST_ACCOUNT_PASSWORD in .env, same for all three):');
  console.table(results);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
