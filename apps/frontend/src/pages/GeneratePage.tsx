import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Wand2, AlertCircle, CheckCircle2, XCircle, Loader2,
  Cpu, ShieldAlert, Sparkles, Brain, Check
} from 'lucide-react';

const TOPICS = [
  'Arrays', 'Linked Lists', 'Stacks & Queues', 'Trees', 'Graphs',
  'Dynamic Programming', 'Recursion', 'Binary Search', 'Sorting', 'Hashing',
  'OOP Concepts', 'Design Patterns', 'SOLID Principles', 'System Design', 'SQL',
];

const QUESTION_TYPES = ['DSA', 'OOPS', 'SQL', 'SYSTEM_DESIGN', 'CONCEPTUAL', 'MCQ'];
const LANGUAGES = ['python', 'java', 'cpp', 'javascript'];
const STYLES = ['Google-style', 'Amazon-style', 'Service-based', 'Startup', 'Data Science'];
const ROLE_LEVELS = ['intern', 'sde1', 'sde2', 'senior', 'lead'];
const LLM_PROVIDERS = ['gemini', 'anthropic', 'openai'];

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
  const navigate = useNavigate();
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

    if (sseRef.current) sseRef.current.close();

    const token = localStorage.getItem('qf_token') ?? 'mock-token';
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
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>Console</span> / <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Generator</span>
          </div>
          <h1 style={{ margin: 0 }}>Generation Wizard</h1>
          <p style={{ margin: 0, marginTop: 4 }}>Configure role-level assessment parameters with zero prompting required.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="badge-live">
            <span className="pulse-indicator" style={{ background: '#10b981', color: '#10b981' }} />
            BULLMQ PERSISTENT
          </span>
        </div>
      </div>

      <div className="page-body">

        {/* ---- Job Progress Card / Stream Banner ---- */}
        {jobId && (
          <div className="animate-fade-in" style={{ marginBottom: 32 }}>
            {!jobProgress.done && jobProgress.state !== 'failed' && (
              <div className="card" style={{
                background: 'linear-gradient(180deg, rgba(244,63,94,0.1) 0%, rgba(13,19,34,0.85) 100%)',
                borderColor: 'rgba(244,63,94,0.4)',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 24px rgba(244,63,94,0.2)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: 'rgba(244,63,94,0.2)',
                      border: '1px solid rgba(244,63,94,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--color-primary)'
                    }}>
                      <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                        {jobProgress.state === 'waiting' ? 'Job Queued in BullMQ Cluster' :
                         jobProgress.state === 'active' ? `Multi-Agent Generation & Sandbox Active` :
                         jobProgress.state === 'delayed' ? 'Job Delayed — Will Retry Automatically' :
                         'Processing Technical Targets...'}
                      </h3>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                        Job Reference: {jobId}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--color-primary)' }}>
                      {jobProgress.percent}%
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>LIVE SSE STREAM</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 20 }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.max(jobProgress.percent, 5)}%`,
                    background: 'var(--gradient-rose)',
                    borderRadius: 6,
                    boxShadow: '0 0 16px rgba(244,63,94,0.6)',
                    transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
                  }} />
                </div>

                {/* 4 Pipeline Stage Badges */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: jobProgress.percent >= 20 ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${jobProgress.percent >= 20 ? 'rgba(16,185,129,0.3)' : 'var(--border-light)'}`,
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12
                  }}>
                    <Brain size={14} color={jobProgress.percent >= 20 ? '#10b981' : 'var(--text-muted)'} />
                    <span style={{ color: jobProgress.percent >= 20 ? '#ffffff' : 'var(--text-muted)' }}>1. LLM Drafting</span>
                  </div>

                  <div style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: jobProgress.percent >= 50 ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${jobProgress.percent >= 50 ? 'rgba(16,185,129,0.3)' : 'var(--border-light)'}`,
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12
                  }}>
                    <ShieldAlert size={14} color={jobProgress.percent >= 50 ? '#10b981' : 'var(--text-muted)'} />
                    <span style={{ color: jobProgress.percent >= 50 ? '#ffffff' : 'var(--text-muted)' }}>2. Adversary Debate</span>
                  </div>

                  <div style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: jobProgress.percent >= 80 ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${jobProgress.percent >= 80 ? 'rgba(16,185,129,0.3)' : 'var(--border-light)'}`,
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12
                  }}>
                    <Sparkles size={14} color={jobProgress.percent >= 80 ? '#10b981' : 'var(--text-muted)'} />
                    <span style={{ color: jobProgress.percent >= 80 ? '#ffffff' : 'var(--text-muted)' }}>3. Judge Scoring</span>
                  </div>

                  <div style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: jobProgress.percent >= 100 ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${jobProgress.percent >= 100 ? 'rgba(16,185,129,0.3)' : 'var(--border-light)'}`,
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12
                  }}>
                    <Cpu size={14} color={jobProgress.percent >= 100 ? '#10b981' : 'var(--text-muted)'} />
                    <span style={{ color: jobProgress.percent >= 100 ? '#ffffff' : 'var(--text-muted)' }}>4. Piston Sandbox</span>
                  </div>
                </div>

              </div>
            )}

            {/* Completed Banner */}
            {jobProgress.done && jobProgress.state === 'completed' && (
              <div className="card" style={{
                background: 'linear-gradient(180deg, rgba(16,185,129,0.12) 0%, rgba(13,19,34,0.85) 100%)',
                borderColor: 'rgba(16,185,129,0.4)',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 24px rgba(16,185,129,0.2)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: 'rgba(16,185,129,0.2)',
                      border: '1px solid rgba(16,185,129,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#10b981'
                    }}>
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', color: '#ffffff' }}>
                        Generation & Mathematical Validation Complete!
                      </h3>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                        All questions were verified by Piston sandboxes and are ready for inspection in your Review Queue.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <button className="btn btn-secondary" onClick={startNew}>
                      Configure Another Batch
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/dashboard/review')}>
                      Open Review Queue →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Failed Banner */}
            {jobProgress.done && jobProgress.state === 'failed' && (
              <div className="alert alert-error" style={{ padding: 20 }}>
                <XCircle size={20} />
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 15 }}>Generation Failed After Retries</strong>
                  <div style={{ marginTop: 4, fontSize: 13 }}>
                    {jobProgress.failedReason || 'Internal engine error during adversarial loop.'}
                  </div>
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={startNew}>
                    Try Again
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Wizard Split Configuration Form */}
        <div className="grid-2">
          
          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* Target Profile Card */}
            <div className="card animate-fade-in animate-delay-1">
              <div className="card-title">Target Profile</div>
              <div className="card-subtitle">Define candidate seniority and company rubric standards</div>

              <div className="form-group">
                <label className="form-label">Role Seniority</label>
                <select
                  className="form-select"
                  value={config.roleLevel}
                  onChange={e => setConfig(c => ({ ...c, roleLevel: e.target.value }))}
                >
                  {ROLE_LEVELS.map(r => (
                    <option key={r} value={r}>{r.toUpperCase()} — Technical Interview Standard</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Company Evaluation Style</label>
                <select
                  className="form-select"
                  value={config.companyStyle}
                  onChange={e => setConfig(c => ({ ...c, companyStyle: e.target.value }))}
                >
                  {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">LLM Provider (BYOK Model Routing)</label>
                <select
                  className="form-select"
                  value={config.llmProvider}
                  onChange={e => setConfig(c => ({ ...c, llmProvider: e.target.value }))}
                >
                  {LLM_PROVIDERS.map(p => (
                    <option key={p} value={p}>
                      {p === 'gemini' ? 'Google Gemini 1.5 Pro' : p === 'anthropic' ? 'Anthropic Claude 3.5 Sonnet' : 'OpenAI GPT-4o'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Difficulty Distribution Card */}
            <div className="card animate-fade-in animate-delay-2">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div className="card-title" style={{ margin: 0 }}>Difficulty Distribution</div>
                {diffValid ? (
                  <span className="badge badge-approved" style={{ fontSize: 11 }}>
                    <Check size={12} /> 100% Calibrated
                  </span>
                ) : (
                  <span className="badge badge-alert" style={{ fontSize: 11 }}>
                    Sum: {diffSum}% (Must be 100%)
                  </span>
                )}
              </div>
              <div className="card-subtitle">Adjust percentage balance between problem complexity</div>

              {(['easy', 'medium', 'hard'] as const).map(d => (
                <div key={d} className="slider-group">
                  <div className="slider-header">
                    <label className="form-label" style={{ margin: 0, textTransform: 'capitalize', fontWeight: 600 }}>
                      {d} Complexity
                    </label>
                    <span className="slider-value" style={{
                      color: d === 'easy' ? 'var(--color-success)' : d === 'medium' ? 'var(--color-warning)' : 'var(--color-error)'
                    }}>
                      {config.difficultyDistribution[d]}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={config.difficultyDistribution[d]}
                    onChange={e => setConfig(c => ({
                      ...c,
                      difficultyDistribution: { ...c.difficultyDistribution, [d]: Number(e.target.value) }
                    }))}
                  />
                </div>
              ))}

              {!diffValid && (
                <div className="alert alert-warning" style={{ marginTop: 12, marginBottom: 0 }}>
                  <AlertCircle size={15} />
                  <span>The sum of Easy, Medium, and Hard must total exactly 100%.</span>
                </div>
              )}
            </div>

          </div>

          {/* Right Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* Topics Card */}
            <div className="card animate-fade-in animate-delay-2">
              <div className="card-title">Technical Topics ({config.topics.length} Selected)</div>
              <div className="card-subtitle">Select algorithmic paradigms and software systems to test</div>

              <div className="checkbox-grid">
                {TOPICS.map(t => (
                  <label key={t} className={`checkbox-chip ${config.topics.includes(t) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={config.topics.includes(t)}
                      onChange={() => toggleItem('topics', t)}
                    />
                    {config.topics.includes(t) && <Check size={12} />}
                    <span>{t}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Question Types Card */}
            <div className="card animate-fade-in animate-delay-3">
              <div className="card-title">Assessment Target Format</div>
              <div className="card-subtitle">Select interview styles to generate</div>

              <div className="checkbox-grid">
                {QUESTION_TYPES.map(t => (
                  <label key={t} className={`checkbox-chip ${config.questionTypes.includes(t) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={config.questionTypes.includes(t)}
                      onChange={() => toggleItem('questionTypes', t)}
                    />
                    {config.questionTypes.includes(t) && <Check size={12} />}
                    <span>{t}</span>
                  </label>
                ))}
              </div>

              {config.questionTypes.includes('MCQ') && (
                <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-light)' }}>
                  <div className="slider-header">
                    <label className="form-label" style={{ margin: 0 }}>MCQ Option Choices</label>
                    <span className="slider-value">{config.mcqOptionsCount} Options</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={6}
                    step={1}
                    value={config.mcqOptionsCount}
                    onChange={e => setConfig(c => ({ ...c, mcqOptionsCount: Number(e.target.value) }))}
                    style={{ width: '100%', marginTop: 8 }}
                  />
                </div>
              )}
            </div>

            {/* Languages Card */}
            <div className="card animate-fade-in animate-delay-3">
              <div className="card-title">Execution Languages (Piston Sandbox)</div>
              <div className="checkbox-grid">
                {LANGUAGES.map(l => (
                  <label key={l} className={`checkbox-chip ${config.languages.includes(l) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={config.languages.includes(l)}
                      onChange={() => toggleItem('languages', l)}
                    />
                    {config.languages.includes(l) && <Check size={12} />}
                    <span style={{ textTransform: 'uppercase' }}>{l}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Quantity & Incurred Cost Estimator */}
            <div className="card animate-fade-in animate-delay-4" style={{
              background: 'linear-gradient(180deg, rgba(244,63,94,0.06) 0%, rgba(15,22,38,0.9) 100%)',
              borderColor: 'rgba(244,63,94,0.3)'
            }}>
              <div className="card-title">Batch Sizing & Incurred Cost</div>
              
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ margin: 0 }}>Total Number of Questions</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[5, 10, 20, 50].map(n => (
                      <button
                        key={n}
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => setConfig(c => ({ ...c, totalQuestions: n }))}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  className="form-input"
                  type="number"
                  min={1}
                  max={100}
                  value={config.totalQuestions}
                  onChange={e => setConfig(c => ({ ...c, totalQuestions: Number(e.target.value) }))}
                />
              </div>

              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.4)',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)'
                }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4, fontWeight: 700, letterSpacing: '0.05em' }}>
                    EST. LLM TOKENS
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 24, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                    ~{estimatedTokens.toLocaleString()}
                  </div>
                </div>

                <div style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.4)',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)'
                }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4, fontWeight: 700, letterSpacing: '0.05em' }}>
                    EST. COST (USD)
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 24, color: 'var(--color-success)', fontFamily: 'var(--font-display)' }}>
                    ${estimatedCost}
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%', justifyContent: 'center', marginTop: 24, height: 48, fontSize: 15 }}
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !diffValid || config.topics.length === 0 || config.questionTypes.length === 0 || (!!jobId && !jobProgress.done)}
              >
                {mutation.isPending ? (
                  <>
                    <span className="spinner" />
                    <span>Enqueuing Generation Job...</span>
                  </>
                ) : (
                  <>
                    <Wand2 size={18} />
                    <span>Generate {config.totalQuestions} Questions</span>
                  </>
                )}
              </button>

              {mutation.isError && (
                <div className="alert alert-error" style={{ marginTop: 16, marginBottom: 0 }}>
                  <AlertCircle size={16} />
                  <span>{(mutation.error as any).response?.data?.error?.message ?? 'Generation failed to enqueue.'}</span>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>
    </>
  );
}
