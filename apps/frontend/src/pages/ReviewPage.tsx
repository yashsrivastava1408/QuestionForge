import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

export default function ReviewPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['questions-review'],
    queryFn: () => axios.get('/api/questions?status=VALIDATED&limit=50').then(r => r.data),
    refetchInterval: 10000, // Poll for new validated questions every 10s
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: string; note?: string }) =>
      axios.post(`/api/questions/${id}/review`, { decision, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions-review'] }),
  });

  const questions = data?.questions ?? [];

  if (isLoading) return (
    <div className="page-body">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
      </div>
    </div>
  );

  return (
    <>
      <div className="page-header">
        <h1>Review Queue</h1>
        <p>{questions.length} question{questions.length !== 1 ? 's' : ''} awaiting your review.</p>
      </div>
      <div className="page-body">
        {questions.length === 0 ? (
          <div className="empty-state">
            <CheckCircle size={48} />
            <h3>Queue is clear!</h3>
            <p>No validated questions awaiting review. Generate more to get started.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {questions.map((q: any, i: number) => (
              <div key={q.id} className={`question-card animate-fade-in animate-delay-${Math.min(i + 1, 4)}`}>
                <div className="question-card-header">
                  <div className="question-card-title">{q.title}</div>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                    onClick={() => setExpanded(expanded === q.id ? null : q.id)}
                  >
                    {expanded === q.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                <div className="question-card-meta">
                  <span className={`badge badge-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
                  <span className={`badge badge-${q.type.toLowerCase()}`}>{q.type}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{q.topic}</span>
                  {q.validationResult?.crossCheckPassed && (
                    <span style={{ fontSize: 12, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={12} /> Cross-check passed
                    </span>
                  )}
                </div>

                {expanded === q.id && (
                  <div style={{ marginTop: 16, animation: 'fadeIn 0.2s ease' }}>
                    <div className="code-block" style={{ marginBottom: 12 }}>
                      <strong style={{ display: 'block', marginBottom: 8, color: 'var(--color-primary)' }}>Problem Statement</strong>
                      {q.statement}
                    </div>
                    {q.validationResult && (
                      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                        <strong>Validation:</strong> {q.validationResult.details}
                      </div>
                    )}
                  </div>
                )}

                <div className="question-card-actions">
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => reviewMutation.mutate({ id: q.id, decision: 'APPROVED' })}
                    disabled={reviewMutation.isPending}
                  >
                    <CheckCircle size={14} /> Approve
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => reviewMutation.mutate({ id: q.id, decision: 'REJECTED' })}
                    disabled={reviewMutation.isPending}
                  >
                    <XCircle size={14} /> Reject
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'auto', alignSelf: 'center' }}>
                    v{q.version} · {new Date(q.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
