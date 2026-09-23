import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { Wand2, AlertCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const TOPICS = [
  'Arrays', 'Linked Lists', 'Stacks & Queues', 'Trees', 'Graphs',
  'Dynamic Programming', 'Recursion', 'Binary Search', 'Sorting', 'Hashing',
  'OOP Concepts', 'Design Patterns', 'SOLID Principles', 'System Design', 'SQL',
];

const QUESTION_TYPES = ['DSA', 'OOPS', 'SQL', 'SYSTEM_DESIGN', 'CONCEPTUAL', 'MCQ'];
const LANGUAGES = ['python', 'java', 'cpp', 'javascript'];
const STYLES = ['Google-style', 'Amazon-style', 'Service-based', 'Startup', 'Data Science'];
const ROLE_LEVELS = ['intern', 'sde1', 'sde2', 'senior', 'lead'];
const LLM_PROVIDERS = ['anthropic', 'openai', 'gemini'];

const TOKENS_PER_Q = 2500;
const COST_PER_1M = 3.0;

type JobState = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | null;

interface JobProgress {
  state: JobState;
  percent: number;
  done: boolean;
  failedReason?: string;
}

export default function GeneratePage() {
  const [config, setConfig] = useState({
    roleLevel: 'sde1',
    topics: ['Arrays', 'Dynamic Programming'],
    difficultyDistribution: { easy: 30, medium: 50, hard: 20 },
    totalQuestions: 10,
    questionTypes: ['DSA'],
    languages: ['python', 'java'],
    companyStyle: 'Google-style',
    llmProvider: 'gemini',
    mcqOptionsCount: 4,
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<JobProgress>({ state: null, percent: 0, done: false });
  const sseRef = useRef<EventSource | null>(null);

  const estimatedTokens = config.totalQuestions * TOKENS_PER_Q;
  const estimatedCost = ((estimatedTokens / 1_000_000) * COST_PER_1M).toFixed(4);

  const mutation = useMutation({
    mutationFn: () => axios.post('/api/generate', config).then(r => r.data),
    onSuccess: (data) => {
      setJobId(data.jobId);
      setJobProgress({ state: 'waiting', percent: 0, done: false });
    },
  });

  // Subscribe to SSE stream whenever a new jobId is set
  useEffect(() => {
    if (!jobId) return;

    // Close any previous stream
    if (sseRef.current) sseRef.current.close();

    const token = localStorage.getItem('token') ?? 'mock-token';
    // EventSource doesn't support custom headers — use fetch-based SSE via URL param as workaround
    const url = `/api/generate/status/${jobId}/stream?token=${token}`;
    const es = new EventSource(url);
    sseRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { state: JobState; progress: number; done?: boolean; failedReason?: string };
        setJobProgress({
          state: data.state,
          percent: typeof data.progress === 'number' ? data.progress : 0,
          done: !!data.done,
          failedReason: data.failedReason,
        });
        if (data.done) es.close();
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      // Reconnect is handled by browser; only close on final states
      if (jobProgress.done) es.close();
    };

    return () => es.close();
  }, [jobId]);

  const toggleItem = (field: 'topics' | 'questionTypes' | 'languages', value: string) => {
    setConfig(c => {
      const arr = c[field] as string[];
      return { ...c, [field]: arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value] };
    });
  };

  const diffSum = config.difficultyDistribution.easy + config.difficultyDistribution.medium + config.difficultyDistribution.hard;
  const diffValid = diffSum === 100;

  const startNew = () => {
    setJobId(null);
    setJobProgress({ state: null, percent: 0, done: false });
    mutation.reset();
  };

  return (
    <>
      <div className="page-header">
        <h1>Generation Wizard</h1>
        <p>Configure your assessment parameters — no prompting required.</p>
      </div>
      <div className="page-body">

        {/* ---- Job Progress Banner ---- */}
        {jobId && (
          <div style={{ marginBottom: 24 }}>
            {/* State banner */}
            {!jobProgress.done && jobProgress.state !== 'failed' && (
              <div className="alert alert-success" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  <strong>
                    {jobProgress.state === 'waiting' ? 'Job queued — waiting for worker...' :
                     jobProgress.state === 'active' ? `Generating questions...` :
                     jobProgress.state === 'delayed' ? 'Job delayed — will retry shortly...' :
                     'Processing...'}
                  </strong>
                </div>
                {/* Progress bar */}
                <div style={{ width: '100%' }}>
                  <div style={{
                    height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.2)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${jobProgress.percent}%`,
                      background: 'var(--color-success)',
                      borderRadius: 4,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                    <span>Job ID: <code>{jobId.slice(0, 8)}…</code></span>
                    <span>{jobProgress.percent}% complete</span>
                  </div>
                </div>
              </div>
            )}

            {jobProgress.done && jobProgress.state === 'completed' && (
              <div className="alert alert-success">
                <CheckCircle2 size={16} />
                <div>
                  <strong>Generation complete!</strong> All questions have been validated and are ready in the Review Queue.
                  <br />
                  <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={startNew}>Generate another batch</button>
                </div>
              </div>
            )}

            {(jobProgress.done && jobProgress.state === 'failed') && (
              <div className="alert alert-error">
                <XCircle size={16} />
                <div>
                  <strong>Generation failed</strong> after all retry attempts.{' '}
                  {jobProgress.failedReason && <span>Reason: {jobProgress.failedReason}</span>}
                  <br />
                  <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={startNew}>Try again</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid-2">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Role & Style */}
            <div className="card animate-fade-in animate-delay-1">
              <div className="card-title">Target Profile</div>
              <div className="card-subtitle">Who is this assessment for?</div>
              <div className="form-group">
                <label className="form-label">Role Level</label>
                <select className="form-select" value={config.roleLevel}
                  onChange={e => setConfig(c => ({ ...c, roleLevel: e.target.value }))}>
                  {ROLE_LEVELS.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Company Style</label>
                <select className="form-select" value={config.companyStyle}
                  onChange={e => setConfig(c => ({ ...c, companyStyle: e.target.value }))}>
                  {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">LLM Provider (BYOK)</label>
                <select className="form-select" value={config.llmProvider}
                  onChange={e => setConfig(c => ({ ...c, llmProvider: e.target.value }))}>
                  {LLM_PROVIDERS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>

            {/* Difficulty */}
            <div className="card animate-fade-in animate-delay-2">
              <div className="card-title">Difficulty Distribution</div>
              <div className="card-subtitle">Must total exactly 100%</div>
              {(['easy', 'medium', 'hard'] as const).map(d => (
                <div key={d} className="slider-group">
                  <div className="slider-header">
                    <label className="form-label" style={{ margin: 0, textTransform: 'capitalize' }}>{d}</label>
                    <span className="slider-value">{config.difficultyDistribution[d]}%</span>
                  </div>
                  <input type="range" min={0} max={100} step={5}
                    value={config.difficultyDistribution[d]}
                    onChange={e => setConfig(c => ({
                      ...c,
                      difficultyDistribution: { ...c.difficultyDistribution, [d]: Number(e.target.value) }
                    }))} />
                </div>
              ))}
              {!diffValid && (
                <div className="alert alert-warning" style={{ marginTop: 12 }}>
                  <AlertCircle size={14} /> Distribution must sum to 100. Current: {diffSum}%
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Topics */}
            <div className="card animate-fade-in animate-delay-2">
              <div className="card-title">Topics</div>
              <div className="card-subtitle">Select the topics to cover</div>
              <div className="checkbox-grid">
                {TOPICS.map(t => (
                  <label key={t} className={`checkbox-chip ${config.topics.includes(t) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={config.topics.includes(t)} onChange={() => toggleItem('topics', t)} />
                    {t}
                  </label>
                ))}
              </div>
            </div>

            {/* Question Types */}
            <div className="card animate-fade-in animate-delay-3">
              <div className="card-title">Question Types</div>
              <div className="checkbox-grid">
                {QUESTION_TYPES.map(t => (
                  <label key={t} className={`checkbox-chip ${config.questionTypes.includes(t) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={config.questionTypes.includes(t)} onChange={() => toggleItem('questionTypes', t)} />
                    {t}
                  </label>
                ))}
              </div>
              {config.questionTypes.includes('MCQ') && (
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-light)' }}>
                  <div className="slider-header">
                    <label className="form-label" style={{ margin: 0 }}>Number of MCQ Options</label>
                    <span className="slider-value">{config.mcqOptionsCount}</span>
                  </div>
                  <input type="range" min={2} max={6} step={1}
                    value={config.mcqOptionsCount}
                    onChange={e => setConfig(c => ({ ...c, mcqOptionsCount: Number(e.target.value) }))}
                    style={{ width: '100%', marginTop: 8 }} />
                </div>
              )}
            </div>

            {/* Languages */}
            <div className="card animate-fade-in animate-delay-3">
              <div className="card-title">Languages (DSA)</div>
              <div className="checkbox-grid">
                {LANGUAGES.map(l => (
                  <label key={l} className={`checkbox-chip ${config.languages.includes(l) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={config.languages.includes(l)} onChange={() => toggleItem('languages', l)} />
                    {l}
                  </label>
                ))}
              </div>
            </div>

            {/* Quantity & Cost Estimator */}
            <div className="card animate-fade-in animate-delay-4" style={{ borderColor: 'var(--text-primary)', background: 'var(--bg-secondary)' }}>
              <div className="card-title">Cost Estimator</div>
              <div className="form-group">
                <label className="form-label">Total Questions</label>
                <input className="form-input" type="number" min={1} max={100}
                  value={config.totalQuestions}
                  onChange={e => setConfig(c => ({ ...c, totalQuestions: Number(e.target.value) }))} />
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
                <div style={{ flex: 1, background: 'hsla(0,0%,0%,0.3)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4, fontWeight: 700, letterSpacing: '0.05em' }}>EST. TOKENS</div>
                  <div style={{ fontWeight: 800, fontSize: 24, color: 'var(--text-primary)' }}>~{estimatedTokens.toLocaleString()}</div>
                </div>
                <div style={{ flex: 1, background: 'hsla(0,0%,0%,0.3)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4, fontWeight: 700, letterSpacing: '0.05em' }}>EST. COST (USD)</div>
                  <div style={{ fontWeight: 800, fontSize: 24, color: 'var(--color-success)' }}>${estimatedCost}</div>
                </div>
              </div>

              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%', justifyContent: 'center', marginTop: 24 }}
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !diffValid || config.topics.length === 0 || config.questionTypes.length === 0 || (!!jobId && !jobProgress.done)}
              >
                {mutation.isPending
                  ? <><span className="spinner" /> Queuing generation...</>
                  : <><Wand2 size={18} /> Generate {config.totalQuestions} Questions</>
                }
              </button>

              {mutation.isError && (
                <div className="alert alert-error" style={{ marginTop: 16 }}>
                  {(mutation.error as any).response?.data?.error?.message ?? 'Generation failed.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
