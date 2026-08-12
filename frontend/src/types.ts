import type { Timestamp } from 'firebase/firestore';

export type StaffRole = 'lead' | 'coordinator' | 'tutor';
export type PriorityTier = 1 | 2 | 3;

export interface FeedbackItem {
  id: string;
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
  handled: boolean;
  handledBy: string | null;
  handledAt: Timestamp | null;
  createdAt: Timestamp | null;
}

export interface FeedbackPiiItem {
  parentName: string;
  studentName: string;
}

export interface StaffMember {
  name: string;
  email: string;
  role: StaffRole;
  classes: string[];
}
