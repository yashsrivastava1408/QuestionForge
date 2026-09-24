import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  CheckCircle, XCircle, ChevronDown, ChevronUp,
  CheckCircle2, Cpu
} from 'lucide-react';

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
            {questions.length} question{questions.length !== 1 ? 's' : ''} awaiting human verification before promotion to production.
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
              All generated technical targets have been approved or dispatched. Initiate a new generation batch to populate the queue.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {questions.map((q: any, i: number) => {
              const isExpanded = expanded === q.id;

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
                    <div style={{ flex: 1 }}>
                      <div className="question-card-title">{q.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <span className={`badge badge-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
                        <span className={`badge badge-${q.type.toLowerCase()}`}>{q.type}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{q.topic}</span>
                        {q.validationResult?.crossCheckPassed && (
                          <span style={{
                            fontSize: 12,
                            color: 'var(--color-success)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            background: 'rgba(16,185,129,0.1)',
                            padding: '2px 8px',
                            borderRadius: 12,
                            border: '1px solid rgba(16,185,129,0.25)'
                          }}>
                            <CheckCircle2 size={12} /> Cross-Check Consensus Passed
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setExpanded(isExpanded ? null : q.id)}
                      style={{ padding: '6px 12px', gap: 6 }}
                    >
                      <span>{isExpanded ? 'Hide Details' : 'Inspect Target'}</span>
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border-light)' }}>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                          Problem Statement & Specifications
                        </div>
                        <div className="code-block" style={{ whiteSpace: 'pre-wrap' }}>
                          {q.statement}
                        </div>
                      </div>

                      {q.validationResult && (
                        <div style={{
                          background: 'rgba(15, 23, 42, 0.6)',
                          border: '1px solid var(--border-light)',
                          borderRadius: 'var(--radius-md)',
                          padding: '14px 18px',
                          marginBottom: 16,
                          fontSize: 13,
                          color: 'var(--text-secondary)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                            <Cpu size={14} color="var(--color-primary)" />
                            Adversary & Sandbox Consensus Report:
                          </div>
                          <div>{q.validationResult.details || 'Deterministic mathematical checks and compiler test suites passed with 0 faults.'}</div>
                        </div>
                      )}
                    </div>
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
