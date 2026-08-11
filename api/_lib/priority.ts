export type ContinuingStatus = 'Yes' | 'Not sure' | 'No';
export type YesNo = 'Yes' | 'No';

export interface PriorityInput {
  rating: number;
  continuing: string;
  contactRequested: string;
  comments: string;
}

export type PriorityTier = 1 | 2 | 3;

// Tiering rules per PLANNING.md section 3.2, formalized from Marcus's stated priorities.
export function computePriorityTier(input: PriorityInput): PriorityTier {
  const { rating, comments } = input;
  const continuing = input.continuing as ContinuingStatus;
  const contactRequested = input.contactRequested as YesNo;
  const hasComments = comments.trim().length > 0;

  if (rating <= 2 || (rating >= 4 && continuing === 'No') || contactRequested === 'Yes') {
    return 1;
  }
  if ((rating === 3 && hasComments) || (rating >= 4 && continuing === 'Not sure')) {
    return 2;
  }
  if ((rating === 3 && !hasComments) || (rating >= 4 && continuing === 'Yes')) {
    return 3;
  }
  // Unrecognized rating/continuing combination (bad upstream data) — surface it rather than
  // let it silently sit in the lowest-urgency tier.
  return 2;
}
