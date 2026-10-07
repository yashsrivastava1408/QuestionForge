import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  CheckCircle, XCircle, ChevronDown, ChevronUp,
  CheckCircle2, Cpu
} from 'lucide-react';
import QuestionDetail, { validationSummary } from '../components/QuestionDetail';

export default function ReviewPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['questions-review'],
    queryFn: () => axios.get('/api/questions?status=VALIDATED&limit=50').then(r => r.data),
    refetchInterval: 10000,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: string; note?: string }) =>
      axios.post(`/api/questions/${id}/review`, { decision, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions-review'] }),
  });

  const questions = data?.questions ?? [];

  // Bulk selection. Only ids still in the queue count, so a question that was
  // reviewed elsewhere silently drops out of the selection.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const selectedIds = questions.map((q: any) => q.id).filter((id: string) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const bulkMutation = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') =>
      axios.post('/api/questions/review-bulk', { ids: selectedIds, decision }).then((r) => r.data),
    onSuccess: (result, decision) => {
      setSelected(new Set());
      setBulkResult(
        `${result.updated} question${result.updated === 1 ? '' : 's'} ${decision === 'APPROVED' ? 'approved' : 'rejected'}` +
        (result.skipped.length ? `; ${result.skipped.length} skipped because they were no longer awaiting review.` : '.')
      );
      qc.invalidateQueries({ queryKey: ['questions-review'] });
    },
    onError: (err: any) => setBulkResult(err?.response?.data?.error?.message ?? 'Bulk review failed.'),
  });

  if (isLoading) {
    return (
      <div className="page-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: 14 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>Console</span> / <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Moderation</span>
          </div>
          <h1 style={{ margin: 0 }}>Review Queue</h1>
          <p style={{ margin: 0, marginTop: 4 }}>
            {questions.length} question{questions.length !== 1 ? 's' : ''} passed automated validation and now need a human decision.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="badge-live">
            <span className="pulse-indicator" style={{ background: '#10b981', color: '#10b981' }} />
            LIVE POLLING (10s)
          </span>
        </div>
      </div>

      <div className="page-body">
        {questions.length === 0 ? (
          <div className="card empty-state" style={{ padding: '72px 24px' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
              boxShadow: '0 0 32px rgba(16, 185, 129, 0.2)'
            }}>
              <CheckCircle size={32} />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 12 }}>
              The Review Queue is Fully Clear!
            </h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: 460 }}>
              Nothing is waiting for review. Start a new generation batch to fill the queue.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.length === questions.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(questions.map((q: any) => q.id)) : new Set())}
                />
                Select all ({questions.length})
              </label>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{selectedIds.length} selected</span>
              <button className="btn btn-success btn-sm" disabled={selectedIds.length === 0 || bulkMutation.isPending} onClick={() => bulkMutation.mutate('APPROVED')}>
                <CheckCircle size={14} /> Approve selected
              </button>
              <button className="btn btn-danger btn-sm" disabled={selectedIds.length === 0 || bulkMutation.isPending} onClick={() => bulkMutation.mutate('REJECTED')}>
                <XCircle size={14} /> Reject selected
              </button>
              {bulkResult && <span role="status" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{bulkResult}</span>}
            </div>

            {questions.map((q: any, i: number) => {
              const isExpanded = expanded === q.id;
              const summary = validationSummary(q.validationResult);

              return (
                <div
                  key={q.id}
                  className={`question-card animate-fade-in animate-delay-${Math.min(i + 1, 4)}`}
                  style={{
                    borderColor: isExpanded ? 'rgba(244, 63, 94, 0.4)' : undefined,
                    background: isExpanded ? 'rgba(18, 26, 44, 0.8)' : undefined
                  }}
                >
                  <div className="question-card-header">
                    <input
                      type="checkbox"
                      aria-label={`Select ${q.title}`}
                      checked={selected.has(q.id)}
                      onChange={() => toggle(q.id)}
                      style={{ marginTop: 4, marginRight: 12 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div className="question-card-title">{q.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <span className={`badge badge-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
                        <span className={`badge badge-${q.type.toLowerCase()}`}>{q.type}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{q.topic}</span>
                        {summary && (
                          <span
                            title={summary.label}
                            style={{
                              fontSize: 12,
                              color: summary.executed ? 'var(--color-success)' : 'var(--color-warning)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              background: summary.executed ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                              padding: '2px 8px',
                              borderRadius: 12,
                              border: `1px solid ${summary.executed ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`
                            }}
                          >
                            {summary.executed ? <CheckCircle2 size={12} /> : <Cpu size={12} />}
                            {summary.executed ? 'Verified by execution' : 'LLM-reviewed (not executed)'}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setExpanded(isExpanded ? null : q.id)}
                      style={{ padding: '6px 12px', gap: 6 }}
                    >
                      <span>{isExpanded ? 'Hide Details' : 'Inspect & Edit'}</span>
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </div>

                  {isExpanded && (
                    <QuestionDetail id={q.id} onChanged={() => qc.invalidateQueries({ queryKey: ['questions-review'] })} />
                  )}

                  <div className="question-card-actions">
                    <button
                      className="btn btn-success"
                      onClick={() => reviewMutation.mutate({ id: q.id, decision: 'APPROVED' })}
                      disabled={reviewMutation.isPending}
                    >
                      <CheckCircle size={15} />
                      <span>Approve Question</span>
                    </button>

                    <button
                      className="btn btn-danger"
                      onClick={() => reviewMutation.mutate({ id: q.id, decision: 'REJECTED' })}
                      disabled={reviewMutation.isPending}
                    >
                      <XCircle size={15} />
                      <span>Reject & Discard</span>
                    </button>

                    <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Revision v{q.version} • {new Date(q.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
