import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

let app: App;

function getAdminApp(): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY env var is not set');
  }
  const serviceAccount = JSON.parse(raw);
  app = initializeApp({ credential: cert(serviceAccount) });
  return app;
}

export function getDb(): Firestore {
  return getFirestore(getAdminApp());
}

// Every Admin SDK entrypoint must go through getAdminApp() first — a bare `getAuth()` imported
// directly from 'firebase-admin/auth' resolves the default app via its own lifecycle lookup,
// which throws `app/no-app` on a cold Vercel invocation if nothing has called initializeApp() yet
// in that request. Route all Auth access through here instead of importing getAuth directly.
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
