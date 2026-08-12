import type { PriorityTier } from '../types';

const TIER_LABEL: Record<PriorityTier, string> = {
  1: 'Same-day',
  2: 'Elevated',
  3: 'Can wait',
};

const TIER_CLASS: Record<PriorityTier, string> = {
  1: 'tier-badge tier-badge-1',
  2: 'tier-badge tier-badge-2',
  3: 'tier-badge tier-badge-3',
};

export default function PriorityBadge({ tier }: { tier: PriorityTier }) {
  return <span className={`pill ${TIER_CLASS[tier]}`}>{TIER_LABEL[tier]}</span>;
}
