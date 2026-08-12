import { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../hooks/useFeedback';
import { useStaffDirectory } from '../hooks/useStaffDirectory';
import { describeScope, filterFeedback, sortFeedback, type QueueFilters } from '../lib/queue';
import type { FeedbackItem } from '../types';
import FilterBar from '../components/FilterBar';
import FeedbackCard from '../components/FeedbackCard';
import SummaryPanel from '../components/SummaryPanel';

const ROLE_LABEL: Record<string, string> = {
  lead: 'Lead',
  coordinator: 'Coordinator',
  tutor: 'Tutor',
};

const DEFAULT_FILTERS: QueueFilters = { status: 'active', tiers: new Set([1, 2, 3]), classLabel: null };

export default function Dashboard() {
  const { user, role, classes, logout } = useAuth();
  const { items, piiById, loading, error } = useFeedback(role, classes);
  const staffByEmail = useStaffDirectory();
  const [filters, setFilters] = useState<QueueFilters>(DEFAULT_FILTERS);

  const showTutorColumn = role === 'lead' || role === 'coordinator';
  const canSeePii = role === 'lead' || role === 'coordinator';

  const classOptions = useMemo(() => {
    if (!showTutorColumn) return [];
    const set = new Set(items.map((item) => item.class));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items, showTutorColumn]);

  const visibleItems = useMemo(() => sortFeedback(filterFeedback(items, filters)), [items, filters]);
  const scopeLabel = useMemo(() => describeScope(filters), [filters]);

  async function toggleHandled(item: FeedbackItem) {
    const ref = doc(db, 'feedback', item.id);
    if (item.handled) {
      await updateDoc(ref, { handled: false, handledBy: null, handledAt: null });
    } else {
      await updateDoc(ref, { handled: true, handledBy: user?.email ?? null, handledAt: serverTimestamp() });
    }
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <h1>Contour Feedback</h1>
        <div className="topbar-right">
          <span className="pill pill-role">{role ? ROLE_LABEL[role] : ''}</span>
          <span className="topbar-email">{user?.email}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {role === 'tutor' && classes.length === 0 && (
          <div className="card empty-state">
            <p>You don't have any classes assigned yet, so there's nothing to show here.</p>
          </div>
        )}

        <FilterBar filters={filters} onChange={setFilters} classOptions={classOptions} showClassFilter={showTutorColumn} />

        <SummaryPanel scopeLabel={scopeLabel} items={visibleItems} />

        {error && <p className="dashboard-error">{error}</p>}
        {loading && <p className="dashboard-loading">Loading feedback…</p>}

        {!loading && visibleItems.length === 0 && (
          <div className="card empty-state">
            <p>Nothing matches this filter.</p>
          </div>
        )}

        <div className="feedback-list">
          {visibleItems.map((item) => (
            <FeedbackCard
              key={item.id}
              item={item}
              pii={canSeePii ? piiById[item.id] : undefined}
              tutorName={item.tutorEmail ? staffByEmail[item.tutorEmail]?.name ?? item.tutorEmail : null}
              showTutor={showTutorColumn}
              onToggleHandled={toggleHandled}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
