import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRosterStaff } from './roster';

// Locks in the fix for a real bug found during phase 2: the live Staff Roster API's own
// pagination overlaps by one record at page boundaries (confirmed by fetching all 3 pages
// directly — page 1's last entry reappeared as page 2's first entry), which over-counted staff
// (19 instead of 18) before fetchAllRosterStaff started deduping by email.
test('fetchAllRosterStaff dedupes staff that appear on more than one page', async (t) => {
  const pages: Record<number, unknown> = {
    1: {
      status: 'ok', page: 1, page_size: 2, total: 3, total_pages: 2, next_page: 2,
      staff: [
        { name: 'A', email: 'a@example.com', role: 'tutor', classes: ['X'] },
        { name: 'B', email: 'b@example.com', role: 'tutor', classes: ['Y'] },
      ],
    },
    2: {
      status: 'ok', page: 2, page_size: 2, total: 3, total_pages: 2, next_page: null,
      staff: [
        { name: 'B', email: 'b@example.com', role: 'tutor', classes: ['Y'] }, // overlaps page 1
        { name: 'C', email: 'c@example.com', role: 'tutor', classes: ['Z'] },
      ],
    },
  };

  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = (async (url: string) => {
    const page = Number(new URL(url).searchParams.get('page'));
    return {
      ok: true,
      json: async () => pages[page],
    } as Response;
  }) as typeof fetch;

  const staff = await fetchAllRosterStaff('fake-key');
  assert.equal(staff.length, 3);
  assert.deepEqual(staff.map((s) => s.email).sort(), ['a@example.com', 'b@example.com', 'c@example.com']);
});
