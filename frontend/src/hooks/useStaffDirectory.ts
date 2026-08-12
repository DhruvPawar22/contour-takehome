import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { StaffMember } from '../types';

// `staff` is readable by any authenticated user (firestore.rules) — used to render which tutor
// owns a class and to build the class filter dropdown for lead/coordinator.
export function useStaffDirectory() {
  const [staffByEmail, setStaffByEmail] = useState<Record<string, StaffMember>>({});

  useEffect(() => {
    return onSnapshot(collection(db, 'staff'), (snap) => {
      const next: Record<string, StaffMember> = {};
      for (const d of snap.docs) next[d.id] = d.data() as StaffMember;
      setStaffByEmail(next);
    });
  }, []);

  return staffByEmail;
}
