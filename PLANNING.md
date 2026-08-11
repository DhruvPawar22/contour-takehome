# Contour Feedback Tool — Planning & Context

Single source of truth for this take-home. Written before any code exists, kept up to date as decisions
get made. If a future session (or a teammate) needs to pick this up cold, this file plus the git log
should be enough.

Status as of **2026-08-11**: planning complete, questions to Dhruv answered, build not yet started.

---

## 1. The brief, condensed (nothing dropped)

**From Marcus Chen (Student Experience, #ops-requests):** after every trial class, parent feedback lands
in a Google Sheet nobody reads. Wants a tool where the team can see feedback as it arrives, mark items
handled, and get an AI summary instead of reading 200 rows by hand. His manager should see everything;
casual tutors should see less. "Needs to be live by next week."

**The job:**
1. Copy the sheet (master is view-only). Share the copy as anyone-with-the-link **editor**. Register the
   link in the assessment's Resources page — required before submission, and it's what routes fresh
   feedback to *my* copy instead of just the master.
2. Fix the pipe. A contractor wired part of a script to push new rows out of the sheet; it never worked
   and was never reviewed. Make new rows reach the backend reliably — production-worthy, not a demo hack.
3. Build from scratch: React frontend people sign into, on Firebase (Auth, Firestore, Hosting) — live
   feedback list, mark-as-handled, and role-based access per Marcus. Team wants to work the queue by
   what matters most, not scroll order.
4. Design matters — daily-use, still a Contour asset. Take cues from contoureducation.com.au.
5. Roles come from the Staff Roster API — who leads, who coordinates, which tutor owns which classes.
   Don't hardcode.
6. AI summary via Gemini, on a free AI Studio key.
7. Deploy live: Firebase Hosting for the app; server-side pieces on any card-free free tier
   (Vercel/Netlify/Cloudflare — my call, justified in the memo).

**Ground rules:** all data is fictional but treated as real for access-control judgment (graded). Free
tiers only, no card anywhere. Design is graded. Everything not explicitly specified is a decision I own,
not an instruction I'm missing — "making good calls is part of the assessment."

**Deliverables:**
1. Registered sheet copy (done in Resources — Dhruv's action, see §7).
2. Live URL + test sign-ins per role, in the memo.
3. Code as a `.zip`: include `.git` (history is signal), exclude `node_modules`, README a cold developer
   could follow.
4. Decision memo: what was built and why, what was fixed in the inherited script, what was deliberately
   not built, what to flag before a company-wide rollout.
5. Internal announcement: the exact message to post in #ops-requests once live.
6. Walkthrough video, ≤10 min: a new row landing in the sheet **and** appearing in the deployed tool,
   live.

**Sheet columns** (confirmed against the real sheet, see §2.1): Timestamp (Melbourne time), Parent name,
Student name, Class (e.g. `VCE Methods — Mon 6pm (Rohan)`; brackets = tutor; matches the roster's
`classes` field exactly, character-for-character), Rating (1–5, 5 best), Continuing? (Yes/Not sure/No),
Contact requested? (Yes/No), Comments (free text, sometimes empty).

**Staff Roster API:** `GET https://contourcandidate.web.app/api/roster?api_key=...&page=1`, key also
accepted as `X-Api-Key` header ("where it lives in your build matters" — i.e. don't put it somewhere
careless). Paginated (`total_pages`/`next_page`), 60 requests/hour on the key — fetch, store, reuse;
don't call per page load.

---

## 2. Research findings

### 2.1 The sheet (Dhruv's copy)

URL: `https://docs.google.com/spreadsheets/d/1AzgFR6fMkwJTbCX9pKSEpiBnOLmvUlEuBcYxmoSNSMI/edit`
Tab: `Form Responses 1`. Confirmed reachable via CSV export (public view access works).

Real header row (fetched directly, 2026-08-11):

```
Timestamp, Parent name, Student name, Class, Rating, Continuing?, Contact requested?, Comments
```

**This is 8 columns, not 7.** The brief's prose bullet "Parent / Student name: as typed" reads like one
combined field but is actually two separate columns. This matters because it means the contractor's
script — which assumes 8 columns (`row[0]` through `row[7]`) — had the *column mapping* right. Its
failure is entirely about *trigger mechanics*, not data shape (see §2.2).

Sample rows confirm: dates are DD/MM/YYYY (Melbourne locale), ratings 1–5 all appear in the live data,
`Continuing?` and `Contact requested?` vary independently of rating (e.g. a 3-star row with a real
complaint in the comments and Contact requested = Yes), which validates the priority tiering in §3.2.

### 2.2 Inherited Apps Script — full diagnosis

Original source (paths/secrets redacted — real values live only in chat history and will be rotated,
never committed):

```javascript
// ============= CONFIG =============
var ENDPOINT_URL = "[REDACTED — dead Make.com webhook, contractor's own comment: 'swap later??']";
var WEBHOOK_TOKEN = "[REDACTED — hardcoded auth token]";
var SHEET_NAME = "Form Responses 1";

function onEdit(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var row = sheet.getRange(lastRow, 1, 1, 8).getValues()[0];
    var payload = buildPayload_(row);
    pushToBackend_(payload);
  } catch (err) {
    // don't want popups bothering the SE team
  }
}

function buildPayload_(row) {
  var ts = row[0];
  var formatted = "";
  if (ts && ts.getTime) {
    formatted = Utilities.formatDate(ts, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ss");
  } else {
    formatted = String(ts || "");
  }
  return {
    token: WEBHOOK_TOKEN,
    submitted_at: formatted,
    parent_name: String(row[1] || ""),
    student_name: String(row[2] || ""),
    class_label: String(row[3] || ""),
    rating: Number(row[4] || 0),
    rebook: String(row[5] || ""),
    contact_request: String(row[6] || ""),
    comments: String(row[7] || ""),
  };
}

function pushToBackend_(payload) {
  try {
    UrlFetchApp.fetch(ENDPOINT_URL, {
      method: "post", contentType: "application/json",
      payload: JSON.stringify(payload), muteHttpExceptions: true,
    });
  } catch (err) { /* network stuff, ignore for now */ }
}

function testPush() { /* manual test helper, "worked once on my machine 30/5" -RK */ }
```

**Root cause of "never worked":** `onEdit(e)` is defined as a bare function name, which Apps Script
installs as a *simple trigger*. Simple triggers execute in a restricted, unauthorized context and are
explicitly forbidden from calling services that require authorization — including `UrlFetchApp`. Every
live invocation of `pushToBackend_` was throwing inside that restricted context and being swallowed by
the empty `catch` block. This exactly explains the code comments: `testPush()` "worked once" because
*manually running a function from the editor* is fully authorized (not a simple-trigger context), while
the real `onEdit` trigger silently did nothing, every time, in production.

Other issues found, in order of severity:
- **Wrong event.** `onEdit` fires on *any* edit to the sheet, not just form submissions — a staff member
  correcting a typo in an old row would also fire it and misread `getLastRow()` as if it were a new
  submission.
- **Dead endpoint.** Points at a Make.com scenario the contractor never finished migrating off.
- **Wrong timezone.** Formats the timestamp in `Asia/Kolkata`; the brief specifies Melbourne time. As
  written this would silently mislabel every timestamp by ~5 hours.
- **Secret in source.** `WEBHOOK_TOKEN` is a plain hardcoded string. Given the sheet *must* be shared as
  "anyone with the link: editor" per the assignment, that token is readable by literally anyone who opens
  Extensions → Apps Script — sharing requirements make true secrecy here unachievable, which shapes how
  I treat this value (see §3.4).
- **No retries, no visibility.** Failures vanish into a comment ("don't want popups bothering the SE
  team") — sympathetic goal, wrong mechanism; the right fix is a log staff can check, not silence.
  Row mapping (8 columns, correct field order) is fine as-is.
- **No idempotency / de-dupe.** Any retry or re-run would push the same row twice.

### 2.3 Staff Roster API — real shape

Fetched all 3 pages directly (2026-08-11), 18 staff total:

| Role | Count | Names |
|---|---|---|
| `lead` | 1 | Marcus Chen |
| `coordinator` | 2 | Nadia Rahman, Tom Feldman |
| `tutor` | 15 | Rohan Iyer, Mia Costa, Daniel Reeve, Sarah Whelan, Chloe Tan, Liam O'Shea, Zoë Mercer, Arjun Nair, Bec Sandilands, Harvey Lu, Priyanka Desai, Callum Wright, Jess Amato, Sam Kaur, Ethan Moreau |

Notable, build-relevant details:
- Every email is `@contoureducation.example` — `.example` is an IANA-reserved, non-routable TLD
  (RFC 2606). **No real person can ever receive mail or complete an OAuth flow at these addresses.**
  This is a hard constraint, not a style preference (see auth decision, §3.3).
- `classes[]` entries are the exact strings that appear in the sheet's Class column, including unicode
  (`"VCE English — Mon 5pm (Zoë)"`) — confirms exact-string matching is correct and sufficient; no
  fuzzy/bracket-parsing needed.
- Lead and coordinators have `classes: []` (they don't teach) — matching logic must not assume every
  staff member teaches.
- At least one tutor (Ethan Moreau) has `classes: []` too (edge case: a tutor with nothing assigned yet
  → empty queue for them, not an error).
- Confirmed `X-Api-Key` header works identically to the `api_key` query param — I'll use the header
  server-side (keeps the key out of URL/access logs).

### 2.4 Design tokens from contoureducation.com.au

Pulled live via computed styles, not guessed:

| Token | Value |
|---|---|
| Background (cream) | `#FFF9F1` |
| Text | `#212121` (headings), `#212121` at ~68% opacity (body) |
| Heading font | `"Polysans Bulky"` (proprietary — not publicly licensed, will substitute a bold geometric sans) |
| Body font | `Inter` (free, Google Fonts) |
| Accent / primary CTA | `#D6FC3C` (lime), pill-shaped buttons, `border-radius: 10rem` |
| Blue family | `#007AFF` (bright), `#0C3166` (medium), `#0C213F` (darkest), `#809AC0` (grey-blue), `#E3EBF8` (light) |
| Neutrals | `#F4ECE1`, `#F9F3EB`, `#E2DBD1`, `#585756` |
| Radius scale | `0.25rem` (xs) / `0.75rem` (sm) / `1rem` (md) / `10rem` (pill) |

Site tone: warm/premium ed-tech, not generic SaaS blue. Lots of white space, testimonial-heavy social
proof, rounded pill CTAs, confident stat callouts. I'll carry the cream/near-black/lime/navy palette,
Inter body font, and pill-button language into the tool; heading font substituted with a comparable
free geometric sans (e.g. Space Grotesk or General Sans) since Polysans is proprietary.

### 2.5 Local environment

Node 24.16.0, npm 11.13.0, git 2.54.0, GitHub CLI 2.94.0 available. `firebase-tools` and `vercel` CLI
not installed yet — will install when Phase 1 starts. Project directory was empty (only `.claude/`);
git repo exists with zero commits.

---

## 3. Decisions log (feeds the final decision memo)

Each entry tagged by who actually made the call.

### 3.1 Role-based visibility — **Marcus's call**

> "leads should be able to see everything but the tutors should only be able to see their own feedbacks
> (obviously hiding parent details etc.)"

- **Lead & coordinator:** full visibility — every class, every field, including parent/student names.
- **Tutor:** scoped to their own classes only (exact-match against roster `classes[]`), **and** the
  parent/student name fields are redacted in their view (shown as e.g. "Family — [class]" rather than
  the real name). Rating, continuing-status, contact-requested, comments, timestamp, and handled-state
  all remain visible for their own classes — a tutor needs the substance of the feedback to act on it,
  just not the family's identity.
- **Judgment call flagged for confirmation:** Marcus said "leads" and "tutors" but didn't mention
  coordinators. I'm grouping coordinators with lead (full access) since they're operational staff, not
  the "casual tutors" his original message singled out — but this is my inference, not his explicit
  word, and I'm flagging it in the decision memo as something to confirm before a real rollout.
  Enforcement is server-driven (Firestore security rules keyed off a role synced from the roster, plus
  field-level redaction in the client for the name fields) — never a client-side "hide this div" toggle.

### 3.2 Queue priority — **Marcus's call, formalized by me**

> "1-2 star ratings need to be same-day action items, no exceptions. But those parents who rate us 4-5
> stars and then say they won't continue? Those are the ones that scare me — they vanish so quietly...
> 3-star ratings only really matter if there's an actual complaint in the comments. Otherwise, they can
> wait."

Three tiers, most to least urgent. Within a tier: unhandled first, then oldest-first (FIFO) so nothing
stale gets buried under newer same-tier items. Marking an item handled removes it from the active queue.

1. **Same-day, no exceptions:**
   - Rating 1–2 (any comments, any continuing status), **or**
   - Rating 4–5 **and** `Continuing? = No` (the "vanishes quietly" signal), **or**
   - `Contact requested? = Yes`, at any rating — **my addition, not something Marcus said explicitly**;
     a family directly asking for a callback reads as unambiguously urgent regardless of rating, flagged
     as such in the memo.
2. **Elevated — surface soon:**
   - Rating 3 **with** non-empty comments, **or**
   - Rating 4–5 **and** `Continuing? = Not sure`.
3. **Can wait:**
   - Rating 3 with empty comments, **or**
   - Rating 4–5 **and** `Continuing? = Yes`.

**Why this stays rule-based instead of AI-scored:** deterministic, instant, free, and unit-testable —
no dependency on a Gemini call sitting in the path of "what do I see when I open the app." Gemini is
reserved for the explicit ask ("AI summary... so we don't have to read 200 entries"), not for gating
what staff see first. A live sort shouldn't be able to break because a model call timed out.

### 3.3 Auth strategy — **my call**, forced by §2.3's `.example` finding

Firebase Auth **email/password**, with one seeded test account per role using the real roster
names/emails, documented in the memo for graders. **Not** Google Sign-In: roster emails are
`@contoureducation.example`, a reserved non-routable domain, so no one — including graders — could ever
complete a real OAuth flow against them. Role/class-ownership still comes entirely from the
roster-synced `staff` Firestore collection; the seeded accounts exist only to let a real person
authenticate *as* one of these fictional identities.

### 3.4 Backend host — **Dhruv's call: Vercel**

Node.js serverless functions under `/api`, free Hobby tier, no card required, cron via `vercel.json`.
Chosen over Cloudflare Workers (great free tier, but a restricted non-Node runtime complicates
`firebase-admin` usage) and Netlify (comparable to Vercel, no strong reason to prefer it here).
**Not Firebase Cloud Functions:** deploying Functions at all requires the Blaze (pay-as-you-go) plan,
which requires a card on file even to stay entirely within free usage — directly conflicts with "free
tiers only, do not attach a card." This is almost certainly *why* the brief splits "Firebase Hosting for
the app" from "server-side pieces on any card-free free tier" instead of just saying "use Firebase
Functions."

### 3.5 Ingestion pipe rewrite — **my call**

- Replace the `onEdit` simple trigger with an **installable `onFormSubmit` trigger** (correct event,
  runs fully authorized — fixes the actual root cause in §2.2).
- Add a **time-based safety-net trigger** (every 5 min) that re-scans for any row past a
  `ScriptProperties`-tracked "last synced row" pointer and pushes what the event trigger missed
  (transient failures, quota errors, script redeploys). Uses script state, not an extra sheet column —
  keeps the sheet's visible shape identical to the form's output.
- Both paths converge on one `pushRow_(rowNumber)` function. The row number travels in the payload and
  becomes the Firestore document ID on the backend — upsert semantics make delivery **idempotent by
  construction**, so the safety net can never create a duplicate.
- Retry with backoff (2–3 attempts) on `UrlFetchApp` failures; failures that still don't go through get
  logged to a dedicated "Sync Log" tab instead of vanishing — visible without popups bothering anyone,
  which was the contractor's actual (reasonable) goal.
- Fix the timestamp formatting to `Australia/Melbourne` (was `Asia/Kolkata`).
- Move the shared secret out of a hardcoded var into `ScriptProperties`, and issue a **fresh** token —
  the contractor's is already burned (it's sitting in this chat transcript now). **Documented residual
  risk:** because the sheet must be "anyone with the link: editor," any editor can still read Script
  Properties from the Apps Script UI, so this token is a low-trust integrity check, not a real secret
  boundary. The backend never treats it as authorization for anything beyond "this looks like it came
  from the sheet" — the ingest endpoint can *only* create shape-validated feedback rows, nothing else,
  so a leaked token's blast radius is "someone can inject fake feedback," which is low-severity and
  fully recoverable, not a data-exposure risk. This is called out explicitly in the decision memo's
  "what to flag before company-wide rollout" section.

### 3.6 Roster sync & secrets handling — **my call**

- Roster API key lives only in backend env vars, sent via the `X-Api-Key` header (confirmed working in
  §2.3), never a query param, never a `VITE_`-prefixed (client-bundled) variable.
- Synced into a Firestore `staff` collection by a Vercel cron job (hourly — 3 requests/run, far under
  the 60/hr budget) plus a manual-refresh endpoint for on-demand use during development.
- Frontend and Firestore security rules read roles/classes from `staff`; nothing ever calls the roster
  API directly from the client, and no role is ever hardcoded.
- Feedback rows whose `Class` doesn't match any known roster class string are still stored (visible to
  lead/coordinator, since they see everything) but flagged `unmatchedClass: true` and surfaced nowhere
  in a tutor's queue, since there's no tutor to scope them to — this keeps a roster typo from silently
  dropping a row instead of just leaving it unassigned.

### 3.7 Gemini summary — **my call**

- Key lives only in backend env vars, called from `/api/summary/generate`, never shipped to the client.
- On-demand, not run automatically per-row at ingest — keeps the ingestion path dependency-light (the
  actual "production-worthy" pipe never has to wait on or fail because of an LLM call), and avoids
  silently burning free-tier quota on every single form submission.
- Summarizes whatever is currently filtered/in view (e.g. "all unhandled," a specific class, a date
  range) rather than one fixed daily report — matches "so we don't have to read 200 entries" more
  directly than a single static digest would.

---

## 4. Data model (Firestore)

```
staff/{email}          { name, email, role: 'lead'|'coordinator'|'tutor', classes: string[], updatedAt }
feedback/{rowId}        { timestamp, parentName, studentName, class, tutorEmail | null, unmatchedClass: bool,
                          rating, continuing, contactRequested, comments,
                          priorityTier: 1|2|3, handled: bool, handledBy, handledAt,
                          sourceRow: number, createdAt }
summaries/{scopeKey}     { scope, text, generatedAt, basedOnCount }
config/rosterSync        { lastSyncedAt, lastPageCount }
```

`rowId` = deterministic (`row_<sheet row number>`) so ingestion writes are upserts, not appends —
duplicate delivery from the safety-net trigger can't create duplicate documents.

## 5. Security rules sketch

- `feedback` read: allowed if `request.auth.token.role in ['lead','coordinator']`, **or**
  (`role == 'tutor'` **and** `resource.data.class in request.auth.token.classes`).
- `feedback` update: same visibility scope, restricted to only the `handled` / `handledBy` / `handledAt`
  fields changing (`request.resource.data.diff(resource.data).affectedKeys()` check).
- `staff` read: any authenticated user (needed to render names); write: backend (Admin SDK) only.
- Custom claims (`role`, `classes`) set server-side by `/api/auth/sync-role` right after login, since
  there's no Cloud Functions auth-trigger available on a card-free plan.

## 6. Architecture (text diagram)

```
Google Form → Sheet (Dhruv's copy, tab "Form Responses 1")
   → Apps Script: onFormSubmit trigger (primary) + time-based safety net (every 5 min)
   → POST /api/feedback/ingest  [Vercel, validates shared secret, resolves tutor via cached roster]
   → Firestore: feedback/{row_N}   (upsert, idempotent)

Vercel Cron (hourly) → GET roster (X-Api-Key header, paginated) → Firestore: staff/{email}

React SPA (Firebase Hosting)
   → Firebase Auth (email/password, seeded test accounts)
   → POST /api/auth/sync-role  [sets custom claims from staff/{email}]
   → Firestore onSnapshot (live feedback list, scoped by security rules) + mark-handled writes
   → POST /api/summary/generate  [Vercel → Gemini, on demand] → Firestore: summaries/{scopeKey}
```

## 7. Things outside my ability to do — need Dhruv

- **Screen-recording the walkthrough video.** No capture tool available to me. I'll write a tight
  shot-list/script once the app is live; you record it (Loom/OBS/whatever you've got).
- **Uploading the final `.zip` to the assessment platform's Submit tab**, and **registering the sheet
  link on the "Resources" registration portal** — I don't have a URL for either; both are external to
  anything I can reach.
- **Any OAuth-based account creation/login** — Vercel account signup, Firebase project creation,
  AI Studio key generation. I can run the CLI locally (e.g. `firebase login`), which will open your real
  browser for the login step, but you complete the login yourself.
- **Confirming the sheet's sharing is actually "anyone with the link: editor."** I could only verify
  public *view* access via the CSV export in §2.1; edit-level access isn't remotely checkable without
  attempting a write, which I won't do unprompted against your live Drive file.

## 8. Open items — still need input

- Real submission deadline for this take-home (distinct from the fictional "next week" in Marcus's
  Slack message) — affects how I prioritize phases if time gets tight.
- Gemini API key handoff: recommend you drop it straight into a local `.env` once I scaffold
  `.env.example`, rather than pasting the value in chat.
- "Resources" registration-portal URL, once you have it / once you've registered the sheet link.
- Confirmation on grouping coordinators with lead for full-visibility access (§3.1) — my inference,
  not something Marcus stated directly.

## 9. Phased build plan

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 — Access & setup | Firebase project (Spark), Vercel account, AI Studio key, confirm sheet sharing | All accounts exist, keys in a local gitignored `.env` |
| 1 — Scaffold | Vite+React+TS app, `/api` Vercel functions skeleton, repo layout, first commit | `npm run dev` renders a blank branded shell |
| 2 — Ingestion pipe | Rewritten Apps Script, `/api/feedback/ingest`, roster sync + cron | Typing a test row into the sheet lands a doc in Firestore within the trigger interval |
| 3 — Auth & rules | Seeded test accounts, `/api/auth/sync-role`, Firestore security rules, priority-scoring + redaction logic (unit tested) | Each seeded role can log in and sees exactly the scoped/redacted data |
| 4 — Frontend | Login, live queue (sorted/filterable), mark-as-handled, AI summary panel, Contour-styled UI | Full flow works end-to-end locally against real Firestore |
| 5 — Deploy & verify | Firebase Hosting + Vercel deploy, env vars set on both, live smoke test per role | Deployed URL works cold, matches local behavior |
| 6 — Deliverables | README, decision memo, #ops-requests announcement draft, video shot-list, `.zip` | All 6 deliverables ready to submit |

## 10. Explicitly out of scope (draft — finalized in the decision memo)

Mobile app / native support; multi-organization support; email or push notifications on new feedback;
manual role-override UI (roles are strictly roster-driven, by design); offline/PWA support; CSV export
or historical trend analytics; automated test coverage beyond the handful of pure-logic functions that
are cheap to test (priority tiering, class matching, redaction) — no full E2E suite given the timebox.

## 11. Deliverables checklist

- [ ] Registered sheet copy — **Dhruv's action** (§7)
- [ ] Live URL + per-role test sign-ins documented in the memo
- [ ] Code `.zip` (incl. `.git`, excl. `node_modules`) with a cold-start README
- [ ] Decision memo (what/why, what was fixed, what was cut, rollout flags)
- [ ] #ops-requests announcement draft
- [ ] Walkthrough video ≤10 min — **Dhruv records**, from a script I prepare
