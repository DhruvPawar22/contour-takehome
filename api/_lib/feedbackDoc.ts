import type { PriorityTier } from './priority';

export interface IngestPayloadShape {
  submitted_at: string;
  parent_name: string;
  student_name: string;
  class_label: string;
  rating: number;
  continuing: string;
  contact_requested: string;
  comments: string;
  row_number: number;
}

export interface FeedbackDoc {
  timestamp: string;
  class: string;
  tutorEmail: string | null;
  unmatchedClass: boolean;
  rating: number;
  continuing: string;
  contactRequested: string;
  comments: string;
  priorityTier: PriorityTier;
  sourceRow: number;
}

export interface FeedbackPiiDoc {
  parentName: string;
  studentName: string;
}

// Splits one ingest payload into the two documents actually written to Firestore. Kept pure and
// separate from the Firestore-writing handler so the redaction guarantee is directly testable:
// parentName/studentName must never appear anywhere in FeedbackDoc, only in FeedbackPiiDoc. See
// PLANNING.md section 3.1/4 for why — Firestore rules can only allow-or-deny a whole document on
// read, so a tutor who's allowed to read a feedback doc would receive every field on it; the only
// way to keep PII from a tutor is to never put it in a document a tutor is allowed to read.
export function buildFeedbackDocs(
  payload: IngestPayloadShape,
  tutorEmail: string | null,
  unmatchedClass: boolean,
  priorityTier: PriorityTier,
): { feedbackDoc: FeedbackDoc; piiDoc: FeedbackPiiDoc } {
  return {
    feedbackDoc: {
      timestamp: payload.submitted_at,
      class: payload.class_label,
      tutorEmail,
      unmatchedClass,
      rating: payload.rating,
      continuing: payload.continuing,
      contactRequested: payload.contact_requested,
      comments: payload.comments,
      priorityTier,
      sourceRow: payload.row_number,
    },
    piiDoc: {
      parentName: payload.parent_name,
      studentName: payload.student_name,
    },
  };
}
