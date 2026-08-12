import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { FeedbackItem, FeedbackPiiItem, StaffRole } from '../types';

// feedbackPii is lead/coordinator only, so tutors never even issue that subscription — there's
// nothing to redact client-side because it was never requested. See PLANNING.md section 3.1/4.
//
// Firestore rejects an *unfiltered* list query outright with PERMISSION_DENIED once the rule
// depends on per-document data (confirmed directly against the REST API) — unlike `get`, `list`
// does not silently filter out non-matching documents. A tutor's query must declare the same
// class scoping the rule checks (`where('class', 'in', classes)`) or the whole query is rejected.
export function useFeedback(role: StaffRole | null, classes: string[]) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [piiById, setPiiById] = useState<Record<string, FeedbackPiiItem>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset on every role/classes change (including sign-out/sign-in within the same tab) so a
    // failed or slower subscription for the new user can never leave the previous user's data on
    // screen — see PROGRESS.md's phase 4 manual-test writeup for the bug this fixes.
    setItems([]);
    setPiiById({});
    setError(null);

    if (!role) return;
    if (role === 'tutor' && classes.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const feedbackQuery =
      role === 'tutor' ? query(collection(db, 'feedback'), where('class', 'in', classes)) : collection(db, 'feedback');

    const unsubFeedback = onSnapshot(
      feedbackQuery,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FeedbackItem));
        setLoading(false);
      },
      (err) => {
        setItems([]);
        setError(err.message);
        setLoading(false);
      },
    );

    const canSeePii = role === 'lead' || role === 'coordinator';
    const unsubPii = canSeePii
      ? onSnapshot(
          collection(db, 'feedbackPii'),
          (snap) => {
            const next: Record<string, FeedbackPiiItem> = {};
            for (const d of snap.docs) next[d.id] = d.data() as FeedbackPiiItem;
            setPiiById(next);
          },
          (err) => {
            setPiiById({});
            setError(err.message);
          },
        )
      : undefined;

    return () => {
      unsubFeedback();
      unsubPii?.();
    };
  }, [role, classes]);

  return { items, piiById, loading, error };
}
