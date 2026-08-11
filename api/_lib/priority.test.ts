import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePriorityTier } from './priority';

function tier(rating: number, continuing: string, contactRequested: string, comments = '') {
  return computePriorityTier({ rating, continuing, contactRequested, comments });
}

// Tier 1 — same-day, no exceptions (PLANNING.md section 3.2)
test('rating 1 or 2 is always tier 1, regardless of continuing/contact', () => {
  assert.equal(tier(1, 'Yes', 'No'), 1);
  assert.equal(tier(2, 'Not sure', 'No'), 1);
  assert.equal(tier(1, 'No', 'Yes'), 1);
});

test('rating 4-5 with continuing=No is tier 1 (the "vanishes quietly" signal)', () => {
  assert.equal(tier(4, 'No', 'No'), 1);
  assert.equal(tier(5, 'No', 'No'), 1);
});

test('contactRequested=Yes is tier 1 at any rating, even a 5-star', () => {
  assert.equal(tier(5, 'Yes', 'Yes'), 1);
  assert.equal(tier(3, 'Not sure', 'Yes'), 1);
});

// Tier 2 — elevated
test('rating 3 with non-empty comments is tier 2', () => {
  assert.equal(tier(3, 'Yes', 'No', 'a real complaint'), 2);
});

test('rating 4-5 with continuing=Not sure is tier 2', () => {
  assert.equal(tier(4, 'Not sure', 'No'), 2);
  assert.equal(tier(5, 'Not sure', 'No'), 2);
});

// Tier 3 — can wait
test('rating 3 with empty (or whitespace-only) comments is tier 3', () => {
  assert.equal(tier(3, 'Yes', 'No', ''), 3);
  assert.equal(tier(3, 'Yes', 'No', '   '), 3);
});

test('rating 4-5 with continuing=Yes is tier 3', () => {
  assert.equal(tier(4, 'Yes', 'No'), 3);
  assert.equal(tier(5, 'Yes', 'No'), 3);
});

// Rule precedence — contactRequested=Yes overrides what would otherwise be tier 3
test('contactRequested=Yes beats an otherwise-tier-3 rating/continuing combination', () => {
  assert.equal(tier(5, 'Yes', 'Yes'), 1);
});
