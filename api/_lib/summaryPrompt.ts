export interface SummaryItem {
  class: string;
  rating: number;
  continuing: string;
  contactRequested: string;
  comments: string;
  priorityTier: 1 | 2 | 3;
  handled: boolean;
}

// Firestore doc IDs can't contain '/', and keeping this short and stable means repeat calls for
// the same filter (e.g. "all unhandled") overwrite the same summaries/{scopeKey} doc rather than
// accumulating one per click — matches the data model in PLANNING.md section 4.
export function slugifyScope(scopeLabel: string): string {
  const slug = scopeLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'all';
}

const MAX_ITEMS_IN_PROMPT = 400;

// Pure so the prompt shape is unit-testable without a network call. Feeds the model exactly what
// the requesting staff member is already allowed to see (client sends only rule-scoped data it
// already fetched) — this endpoint never re-derives visibility, see PLANNING.md section 3.7.
export function buildSummaryPrompt(scopeLabel: string, items: SummaryItem[]): string {
  const truncated = items.slice(0, MAX_ITEMS_IN_PROMPT);
  const lines = truncated.map((item, i) => {
    const comment = item.comments.trim() || '(no comment)';
    return `${i + 1}. [Tier ${item.priorityTier}${item.handled ? ', handled' : ''}] ${item.class} — rating ${item.rating}/5, continuing: ${item.continuing}, contact requested: ${item.contactRequested}. Comment: "${comment}"`;
  });

  return [
    'You are helping a Contour Education staff member triage parent feedback after trial classes.',
    `Scope: ${scopeLabel} (${items.length} feedback item${items.length === 1 ? '' : 's'}).`,
    'Summarize the feedback below for a busy staff member who will not read every row individually.',
    'Cover: the overall sentiment, any recurring themes or complaints, which specific items need urgent',
    'human follow-up and why, and anything that stands out as good news worth celebrating.',
    'Keep it tight — a few short paragraphs or a plain list, not a restatement of every row.',
    'Output plain text only — this is rendered as-is with no markdown parser. Do not use asterisks,',
    '#, ---, backticks, or emoji for structure. For section labels just write the label followed by',
    'a colon on its own line. For a list, start each line with a dash and a space.',
    '',
    ...lines,
  ].join('\n');
}
