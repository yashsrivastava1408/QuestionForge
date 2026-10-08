import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Cpu, Pencil, RefreshCw, Save, Wand2, X, AlertCircle, ShieldCheck, ShieldAlert } from 'lucide-react';
import JobProgress, { useJobStatus } from './JobProgress';

/** Plain-language description of how a question was checked — never more than what actually happened. */
export function validationSummary(v: any): { label: string; executed: boolean } | null {
  if (!v) return null;
  if (v.method === 'sandbox_differential') {
    const s = v.stats;
    const independent =
      s?.blindSolver === 'agreed' ? '; an independent solver working from the statement alone got the same answers'
      : s?.blindSolver === 'disagreed' ? '; an independent solver working from the statement alone got different answers'
      : s?.blindSolver === 'inconclusive' ? '; the independent solver produced nothing runnable'
      : '';
    return {
      executed: true,
      label: s
        ? `Executed in sandbox: ${s.listedCases + s.generatedCases} inputs, ${s.sandboxRuns} runs, checked against a brute-force oracle${independent}`
        : 'Executed in sandbox against a brute-force oracle',
    };
  }
  if (v.method === 'sandbox_sql') return { executed: true, label: 'Executed in SQLite: two independent queries agree on every dataset' };
  if (v.method === 'sandbox_snippet') {
    return {
      executed: true,
      label: v.crossModel
        ? 'Code in the question was run and its output matches the answer key; also reviewed by a second LLM provider'
        : 'Code in the question was run and its output matches the answer key; also reviewed by the same provider that wrote it',
    };
  }
  if (v.method === 'llm_review') {
    return {
      executed: false,
      label: v.crossModel
        ? 'Reviewed by a second LLM provider (not executable, so not run)'
        : 'Reviewed by the same provider that wrote it (not run)',
    };
  }
  return { executed: false, label: 'Validated by an older version of the pipeline' };
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
  color: 'var(--text-muted)', marginBottom: 8,
};

/** Fields a reviewer can edit, and how each is shown in the form. */
const EDITABLE: { key: string; label: string; kind: 'text' | 'line' | 'json'; hint?: string }[] = [
  { key: 'statement', label: 'Statement', kind: 'text' },
  { key: 'options', label: 'Options', kind: 'json', hint: '[{ "id": "A", "text": "…" }]' },
  { key: 'answer', label: 'Answer', kind: 'line' },
  { key: 'explanation', label: 'Explanation', kind: 'text' },
  { key: 'optimalSolution', label: 'Optimal solution (per language)', kind: 'json', hint: '{ "python": "…" }' },
  { key: 'bruteForceSolution', label: 'Brute-force solution (per language)', kind: 'json' },
  { key: 'testCases', label: 'Test cases', kind: 'json', hint: '[{ "input": "…", "expectedOutput": "…" }]' },
];

function toFormValue(value: unknown, kind: string): string {
  if (value === null || value === undefined) return '';
  return kind === 'json' ? JSON.stringify(value, null, 2) : String(value);
}

export default function QuestionDetail({ id, canEdit = true, onChanged }: { id: string; canEdit?: boolean; onChanged?: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [lang, setLang] = useState<string | null>(null);

  const { data: q, isLoading, refetch } = useQuery({
    queryKey: ['question', id],
    queryFn: () => axios.get(`/api/questions/${id}`).then((r) => r.data.question),
  });

  const refreshAll = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ['questions'] });
    qc.invalidateQueries({ queryKey: ['questions-review'] });
    onChanged?.();
  };
  const job = useJobStatus(jobId, refreshAll);

  const apiError = (err: any) => err?.response?.data?.error?.message ?? 'Request failed.';

  const saveMutation = useMutation({
    mutationFn: (changes: Record<string, unknown>) => axios.patch(`/api/questions/${id}`, changes).then((r) => r.data),
    onSuccess: (data) => {
      setEditing(false);
      setFormError(null);
      if (data.revalidationJobId) setJobId(data.revalidationJobId);
      refreshAll();
    },
    onError: (err) => setFormError(apiError(err)),
  });

  const actionMutation = useMutation({
    mutationFn: (action: 'revalidate' | 'complete') => axios.post(`/api/questions/${id}/${action}`, {}).then((r) => r.data),
    onSuccess: (data) => { setFormError(null); setJobId(data.jobId); refreshAll(); },
    onError: (err) => setFormError(apiError(err)),
  });

  if (isLoading || !q) return <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />;

  const fields = EDITABLE.filter((f) => f.key === 'statement' || f.key === 'explanation' || q[f.key] !== null);
  const startEditing = () => {
    setForm(Object.fromEntries(fields.map((f) => [f.key, toFormValue(q[f.key], f.kind)])));
    setFormError(null);
    setEditing(true);
  };

  const save = () => {
    const changes: Record<string, unknown> = {};
    for (const f of fields) {
      const before = toFormValue(q[f.key], f.kind);
      if (form[f.key] === before) continue;
      if (f.kind === 'json') {
        try {
          changes[f.key] = JSON.parse(form[f.key]);
        } catch {
          setFormError(`"${f.label}" is not valid JSON.`);
          return;
        }
      } else {
        changes[f.key] = form[f.key];
      }
    }
    if (Object.keys(changes).length === 0) { setEditing(false); return; }
    saveMutation.mutate(changes);
  };

  const summary = validationSummary(q.validationResult);
  const solutions = (q.optimalSolution ?? {}) as Record<string, string>;
  const brute = (q.bruteForceSolution ?? {}) as Record<string, string>;
  const languages = Object.keys(solutions);
  const activeLang = lang && languages.includes(lang) ? lang : languages[0];
  const testCases = (q.testCases ?? []) as any[];
  const rubric = (q.validationAssets?.rubric ?? []) as any[];
  const busy = q.status === 'VALIDATING' || (!!jobId && !job?.done);
  const isCode = q.type === 'DSA';

  return (
    <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border-light)' }}>
      {jobId && (
        <div style={{ marginBottom: 16 }}>
          <JobProgress status={job} compact />
        </div>
      )}

      {formError && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={15} /> <span>{formError}</span>
        </div>
      )}

      {editing ? (
        <div>
          {fields.map((f) => (
            <div className="form-group" key={f.key}>
              <label className="form-label">
                {f.label}
                {f.hint && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>{f.hint}</span>}
              </label>
              {f.kind === 'line' ? (
                <input className="form-input" value={form[f.key] ?? ''} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))} />
              ) : (
                <textarea
                  className="form-input"
                  rows={f.kind === 'json' ? 10 : 6}
                  spellCheck={f.kind !== 'json'}
                  style={{ fontFamily: f.kind === 'json' ? 'var(--font-mono)' : undefined, fontSize: 13, width: '100%' }}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Changing the statement, answer, options, solutions or test cases sends the question back through validation.
            It cannot be approved again until it passes.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saveMutation.isPending}>
              <Save size={14} /> {saveMutation.isPending ? 'Saving…' : 'Save changes'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={sectionTitle}>Statement</div>
            <div className="code-block" style={{ whiteSpace: 'pre-wrap' }}>{q.statement}</div>
          </div>

          {Array.isArray(q.options) && (
            <div style={{ marginBottom: 16 }}>
              <div style={sectionTitle}>Options</div>
              {q.options.map((o: any) => {
                const correct = String(o.id).toUpperCase() === String(q.answer ?? '').toUpperCase();
                return (
                  <div key={o.id} style={{
                    padding: '8px 12px', borderRadius: 8, marginBottom: 6, fontSize: 13,
                    border: `1px solid ${correct ? 'rgba(16,185,129,0.4)' : 'var(--border-light)'}`,
                    background: correct ? 'rgba(16,185,129,0.08)' : 'transparent',
                  }}>
                    <strong>{o.id})</strong> {o.text}
                    {correct && <span style={{ color: 'var(--color-success)', marginLeft: 8, fontSize: 12 }}>correct answer</span>}
                  </div>
                );
              })}
            </div>
          )}

          {!Array.isArray(q.options) && q.answer && (
            <div style={{ marginBottom: 16 }}>
              <div style={sectionTitle}>{q.type === 'SQL' ? 'Reference query' : 'Reference answer'}</div>
              <div className="code-block" style={{ whiteSpace: 'pre-wrap' }}>{q.answer}</div>
            </div>
          )}

          {languages.length > 0 && isCode && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Solutions</span>
                {languages.map((l) => (
                  <button
                    key={l}
                    className={`btn btn-sm ${l === activeLang ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '2px 10px', fontSize: 11 }}
                    onClick={() => setLang(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Optimal</div>
              <pre className="code-block" style={{ overflowX: 'auto', margin: 0 }}>{solutions[activeLang]}</pre>
              {brute[activeLang] && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 4px' }}>Brute force (the oracle)</div>
                  <pre className="code-block" style={{ overflowX: 'auto', margin: 0 }}>{brute[activeLang]}</pre>
                </>
              )}
            </div>
          )}

          {testCases.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={sectionTitle}>Test cases ({testCases.length})</div>
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Case</th><th>Input</th><th>Expected output</th></tr></thead>
                  <tbody>
                    {testCases.slice(0, 6).map((tc, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{tc.label ?? `#${i + 1}`}</td>
                        <td><pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto' }}>{tc.input}</pre></td>
                        <td><pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto' }}>{tc.expectedOutput}</pre></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {testCases.length > 6 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>…and {testCases.length - 6} more.</div>
              )}
            </div>
          )}

          {rubric.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={sectionTitle}>Grading rubric</div>
              {rubric.map((r, i) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 6 }}>
                  <strong>{r.criterion}</strong> <span style={{ color: 'var(--text-muted)' }}>({r.points} pts)</span> — {r.lookFor}
                </div>
              ))}
            </div>
          )}

          {q.explanation && (
            <div style={{ marginBottom: 16 }}>
              <div style={sectionTitle}>Explanation</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{q.explanation}</div>
            </div>
          )}

          {q.sourcePlatform && q.sourcePlatform !== 'generated' && (
            <div className="alert alert-warning" style={{ marginBottom: 16 }}>
              <AlertCircle size={15} />
              <span>
                Imported from {q.sourcePlatform}. The statement belongs to that platform — check you have the right to
                reuse it before putting it in an assessment.
              </span>
            </div>
          )}

          {q.validationResult && summary && (
            <div style={{
              background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)', padding: '14px 18px', marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                {q.validationResult.passed
                  ? (summary.executed ? <ShieldCheck size={15} color="var(--color-success)" /> : <Cpu size={15} color="var(--color-warning)" />)
                  : <ShieldAlert size={15} color="var(--color-error)" />}
                {q.validationResult.passed ? 'Passed' : 'Failed'} — {summary.label}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{q.validationResult.details}</div>
            </div>
          )}

          {canEdit && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={startEditing} disabled={busy}>
                <Pencil size={14} /> Edit
              </button>
              {q.status === 'DRAFT' && isCode && !q.optimalSolution ? (
                <button className="btn btn-primary btn-sm" onClick={() => actionMutation.mutate('complete')} disabled={busy || actionMutation.isPending}>
                  <Wand2 size={14} /> Generate & validate solutions
                </button>
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={() => actionMutation.mutate('revalidate')} disabled={busy || actionMutation.isPending}>
                  <RefreshCw size={14} /> Re-validate
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
