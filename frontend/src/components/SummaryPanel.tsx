import { useState } from 'react';
import type { FeedbackItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { postJson } from '../lib/api';

interface SummaryPanelProps {
  scopeLabel: string;
  items: FeedbackItem[];
}

interface SummaryResponse {
  text: string;
  basedOnCount: number;
}

// On-demand only — summarizes whatever the caller currently has filtered into view, not a fixed
// daily digest. See PLANNING.md section 3.7. Sends only the fields the model needs, already
// scoped by Firestore rules on the client side (never re-widened server-side).
export default function SummaryPanel({ scopeLabel, items }: SummaryPanelProps) {
  const { getFreshIdToken } = useAuth();
  const [result, setResult] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const idToken = await getFreshIdToken();
      const payload = {
        scopeLabel,
        items: items.map((item) => ({
          class: item.class,
          rating: item.rating,
          continuing: item.continuing,
          contactRequested: item.contactRequested,
          comments: item.comments,
          priorityTier: item.priorityTier,
          handled: item.handled,
        })),
      };
      const res = await postJson<SummaryResponse>('/api/summary/generate', idToken, payload);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Summary generation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card summary-panel">
      <div className="summary-panel-header">
        <div>
          <h2>AI summary</h2>
          <p className="summary-panel-scope">Scope: {scopeLabel} ({items.length} item{items.length === 1 ? '' : 's'})</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={loading}>
          {loading ? 'Summarizing…' : 'Generate summary'}
        </button>
      </div>
      {error && <p className="summary-panel-error">{error}</p>}
      {result && (
        <div className="summary-panel-body">
          <p className="summary-panel-text">{result.text}</p>
          <p className="summary-panel-count">Based on {result.basedOnCount} item{result.basedOnCount === 1 ? '' : 's'}.</p>
        </div>
      )}
    </section>
  );
}
