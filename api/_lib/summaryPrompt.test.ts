import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryPrompt, slugifyScope, type SummaryItem } from './summaryPrompt';

function item(overrides: Partial<SummaryItem> = {}): SummaryItem {
  return {
    class: 'VCE Methods — Mon 6pm (Rohan)',
    rating: 2,
    continuing: 'Not sure',
    contactRequested: 'No',
    comments: 'struggled to keep up',
    priorityTier: 1,
    handled: false,
    ...overrides,
  };
}

test('slugifyScope lowercases and replaces non-alphanumerics with hyphens', () => {
  assert.equal(slugifyScope('All Unhandled · Tier 1'), 'all-unhandled-tier-1');
});

test('slugifyScope falls back to "all" for a scope with no alphanumeric characters', () => {
  assert.equal(slugifyScope('···'), 'all');
});

test('buildSummaryPrompt includes the scope label and item count', () => {
  const prompt = buildSummaryPrompt('Unhandled — Tier 1', [item(), item()]);
  assert.match(prompt, /Unhandled — Tier 1/);
  assert.match(prompt, /2 feedback items/);
});

test('buildSummaryPrompt renders each item\'s class, rating, and comment', () => {
  const prompt = buildSummaryPrompt('All', [item({ comments: 'a specific complaint here' })]);
  assert.match(prompt, /VCE Methods — Mon 6pm \(Rohan\)/);
  assert.match(prompt, /rating 2\/5/);
  assert.match(prompt, /a specific complaint here/);
});

test('buildSummaryPrompt falls back to a placeholder for empty comments', () => {
  const prompt = buildSummaryPrompt('All', [item({ comments: '   ' })]);
  assert.match(prompt, /\(no comment\)/);
});

test('buildSummaryPrompt truncates beyond 400 items but keeps the true count in the header', () => {
  const items = Array.from({ length: 450 }, () => item());
  const prompt = buildSummaryPrompt('All', items);
  assert.match(prompt, /450 feedback items/);
  assert.equal(prompt.match(/rating 2\/5/g)?.length, 400);
});
