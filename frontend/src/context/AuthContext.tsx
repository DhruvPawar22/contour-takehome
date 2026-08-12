import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { postJson } from '../lib/api';
import type { StaffRole } from '../types';

interface AuthContextValue {
  user: User | null;
  role: StaffRole | null;
  classes: string[];
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getFreshIdToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Every sign-in (fresh login or a returning session on page load) calls /api/auth/sync-role and
// force-refreshes the ID token so custom claims (role, classes) are current before any Firestore
// read happens — there's no Cloud Functions auth-trigger on the card-free plan to do this
// automatically. See PLANNING.md section 3.3/5 and api/auth/sync-role.ts.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setError(null);
      if (!nextUser) {
        setUser(null);
        setRole(null);
        setClasses([]);
        setLoading(false);
        return;
      }

      try {
        const idToken = await nextUser.getIdToken();
        await postJson<{ ok: true; role: StaffRole; classes: string[] }>(
          '/api/auth/sync-role',
          idToken,
          {},
        );
        const result = await nextUser.getIdTokenResult(true);
        setUser(nextUser);
        setRole((result.claims.role as StaffRole) ?? null);
        setClasses((result.claims.classes as string[]) ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to sync role');
        setUser(nextUser);
        setRole(null);
        setClasses([]);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Sign-in failed — check the email and password.');
      throw new Error('sign-in failed');
    }
  }

  async function logout() {
    await signOut(auth);
  }

  async function getFreshIdToken(): Promise<string> {
    if (!auth.currentUser) throw new Error('not signed in');
    return auth.currentUser.getIdToken();
  }

  return (
    <AuthContext.Provider value={{ user, role, classes, loading, error, login, logout, getFreshIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
