import type { PriorityTier } from '../types';
import type { QueueFilters, StatusFilter } from '../lib/queue';

const ALL_TIERS: PriorityTier[] = [1, 2, 3];
const TIER_LABEL: Record<PriorityTier, string> = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' };
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'handled', label: 'Handled' },
  { value: 'all', label: 'All' },
];

interface FilterBarProps {
  filters: QueueFilters;
  onChange: (filters: QueueFilters) => void;
  classOptions: string[];
  showClassFilter: boolean;
}

export default function FilterBar({ filters, onChange, classOptions, showClassFilter }: FilterBarProps) {
  function setStatus(status: StatusFilter) {
    onChange({ ...filters, status });
  }

  function toggleTier(tier: PriorityTier) {
    const next = new Set(filters.tiers);
    if (next.has(tier)) {
      if (next.size === 1) return; // keep at least one tier selected
      next.delete(tier);
    } else {
      next.add(tier);
    }
    onChange({ ...filters, tiers: next });
  }

  return (
    <div className="filter-bar">
      <div className="filter-group" role="group" aria-label="Status">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className="chip"
            aria-pressed={filters.status === opt.value}
            onClick={() => setStatus(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="filter-group" role="group" aria-label="Priority tier">
        {ALL_TIERS.map((tier) => (
          <button
            key={tier}
            type="button"
            className="chip"
            aria-pressed={filters.tiers.has(tier)}
            onClick={() => toggleTier(tier)}
          >
            {TIER_LABEL[tier]}
          </button>
        ))}
      </div>

      {showClassFilter && (
        <select
          className="chip filter-class-select"
          value={filters.classLabel ?? ''}
          onChange={(e) => onChange({ ...filters, classLabel: e.target.value || null })}
        >
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
