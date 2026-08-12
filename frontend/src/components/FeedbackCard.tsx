import { useState } from 'react';
import type { FeedbackItem, FeedbackPiiItem } from '../types';
import PriorityBadge from './PriorityBadge';
import { formatMelbourne, starRating } from '../lib/format';

interface FeedbackCardProps {
  item: FeedbackItem;
  pii?: FeedbackPiiItem;
  tutorName: string | null;
  showTutor: boolean;
  onToggleHandled: (item: FeedbackItem) => Promise<void>;
}

export default function FeedbackCard({ item, pii, tutorName, showTutor, onToggleHandled }: FeedbackCardProps) {
  const [busy, setBusy] = useState(false);

  const familyLine = pii ? `${pii.parentName} · ${pii.studentName}` : `Family — ${item.class}`;

  async function handleToggle() {
    setBusy(true);
    try {
      await onToggleHandled(item);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`card feedback-card ${item.handled ? 'feedback-card-handled' : ''}`}>
      <div className="feedback-card-top">
        <div className="feedback-card-top-left">
          <PriorityBadge tier={item.priorityTier} />
          {item.unmatchedClass && <span className="pill pill-warning">Unmatched class</span>}
        </div>
        <time className="feedback-card-time" dateTime={item.timestamp}>
          {formatMelbourne(item.timestamp)}
        </time>
      </div>

      <h3 className="feedback-card-class">{item.class}</h3>
      {showTutor && <p className="feedback-card-tutor">{tutorName ?? 'No tutor matched'}</p>}
      <p className="feedback-card-family">{familyLine}</p>

      <div className="feedback-card-meta">
        <span className="feedback-card-stars" title={`${item.rating}/5`}>
          {starRating(item.rating)}
        </span>
        <span className="pill pill-neutral">Continuing: {item.continuing}</span>
        {item.contactRequested === 'Yes' && <span className="pill pill-contact">Contact requested</span>}
      </div>

      <p className="feedback-card-comments">
        {item.comments.trim() || <span className="feedback-card-no-comment">No comment left.</span>}
      </p>

      <div className="feedback-card-footer">
        {item.handled ? (
          <span className="feedback-card-handled-note">
            Handled{item.handledBy ? ` by ${item.handledBy}` : ''}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          className={`btn btn-sm ${item.handled ? 'btn-ghost' : 'btn-secondary'}`}
          onClick={handleToggle}
          disabled={busy}
        >
          {busy ? 'Saving…' : item.handled ? 'Mark unhandled' : 'Mark handled'}
        </button>
      </div>
    </article>
  );
}
