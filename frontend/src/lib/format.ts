const melbourneFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Australia/Melbourne',
});

export function formatMelbourne(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return isoTimestamp;
  return melbourneFormatter.format(parsed);
}

export function starRating(rating: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}
