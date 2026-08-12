import type { FeedbackItem, PriorityTier } from '../types';

export type StatusFilter = 'active' | 'handled' | 'all';

export interface QueueFilters {
  status: StatusFilter;
  tiers: Set<PriorityTier>;
  classLabel: string | null;
}

// Priority tier ascending (most urgent first), then unhandled before handled, then oldest first
// within a tier (FIFO) so nothing stale gets buried under newer same-tier items. See
// PLANNING.md section 3.2.
export function sortFeedback(items: FeedbackItem[]): FeedbackItem[] {
  return [...items].sort((a, b) => {
    if (a.priorityTier !== b.priorityTier) return a.priorityTier - b.priorityTier;
    if (a.handled !== b.handled) return a.handled ? 1 : -1;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
}

export function filterFeedback(items: FeedbackItem[], filters: QueueFilters): FeedbackItem[] {
  return items.filter((item) => {
    if (filters.status === 'active' && item.handled) return false;
    if (filters.status === 'handled' && !item.handled) return false;
    if (!filters.tiers.has(item.priorityTier)) return false;
    if (filters.classLabel && item.class !== filters.classLabel) return false;
    return true;
  });
}

const STATUS_LABEL: Record<StatusFilter, string> = { active: 'Active', handled: 'Handled', all: 'All' };

// Plain-English description of the current filter combination — sent to /api/summary/generate as
// the scope label so the resulting summaries/{scopeKey} doc (and the AI's own framing) reflects
// exactly what the staff member was looking at when they asked for it.
export function describeScope(filters: QueueFilters): string {
  const parts = [STATUS_LABEL[filters.status]];
  if (filters.tiers.size < 3) {
    parts.push([...filters.tiers].sort().map((t) => `Tier ${t}`).join(' & '));
  }
  parts.push(filters.classLabel ?? 'All classes');
  return parts.join(' · ');
}
