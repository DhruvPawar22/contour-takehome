export type StaffRole = 'lead' | 'coordinator' | 'tutor';

export interface RosterStaffMember {
  name: string;
  email: string;
  role: StaffRole;
  classes: string[];
}

interface RosterPageResponse {
  status: string;
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  next_page: number | null;
  staff: RosterStaffMember[];
}

const ROSTER_URL = 'https://contourcandidate.web.app/api/roster';

// Fetches every page of the Staff Roster API using the X-Api-Key header (confirmed equivalent to
// the api_key query param, but keeps the key out of URLs/access logs). Budget: 60 req/hr on the
// key; a full sync is 3 requests (18 staff, page_size 8), well under that even if triggered by
// hand a few times during development.
export async function fetchAllRosterStaff(apiKey: string): Promise<RosterStaffMember[]> {
  // Keyed by email: the roster API's own pagination has been observed to overlap by one record
  // at page boundaries (the last entry of page N reappears as the first entry of page N+1), so
  // naive concatenation over-counts. Deduping here keeps the sync idempotent and the reported
  // count accurate regardless of that upstream quirk.
  const staffByEmail = new Map<string, RosterStaffMember>();
  let page: number | null = 1;

  while (page !== null) {
    const res = await fetch(`${ROSTER_URL}?page=${page}`, {
      headers: { 'X-Api-Key': apiKey },
    });
    if (!res.ok) {
      throw new Error(`Roster API request failed: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as RosterPageResponse;
    for (const member of body.staff) {
      staffByEmail.set(member.email, member);
    }
    page = body.next_page;
  }

  return Array.from(staffByEmail.values());
}
