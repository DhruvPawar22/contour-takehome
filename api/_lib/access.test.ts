import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classBelongsToTutor, canSeeFeedback } from './access';

test('classBelongsToTutor is exact-string membership', () => {
  assert.equal(classBelongsToTutor(['VCE Methods — Mon 6pm (Rohan)'], 'VCE Methods — Mon 6pm (Rohan)'), true);
  assert.equal(classBelongsToTutor(['VCE Methods — Mon 6pm (Rohan)'], 'VCE Methods - Mon 6pm (Rohan)'), false); // hyphen, not em-dash
  assert.equal(classBelongsToTutor([], 'anything'), false);
});

test('classBelongsToTutor handles unicode class names exactly (no fuzzy matching)', () => {
  assert.equal(classBelongsToTutor(['VCE English — Mon 5pm (Zoë)'], 'VCE English — Mon 5pm (Zoë)'), true);
  assert.equal(classBelongsToTutor(['VCE English — Mon 5pm (Zoe)'], 'VCE English — Mon 5pm (Zoë)'), false);
});

test('lead and coordinator see every class, even ones they have no classes[] entry for', () => {
  assert.equal(canSeeFeedback('lead', [], 'any class at all'), true);
  assert.equal(canSeeFeedback('coordinator', [], 'any class at all'), true);
});

test('tutor sees only their own classes', () => {
  assert.equal(canSeeFeedback('tutor', ['A', 'B'], 'A'), true);
  assert.equal(canSeeFeedback('tutor', ['A', 'B'], 'C'), false);
});

test('tutor with an empty classes[] (nothing assigned yet) sees nothing — not an error', () => {
  assert.equal(canSeeFeedback('tutor', [], 'A'), false);
});
