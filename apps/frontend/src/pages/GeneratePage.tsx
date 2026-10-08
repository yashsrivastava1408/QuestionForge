import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Wand2, AlertCircle, CheckCircle2, XCircle, Loader2, Check } from 'lucide-react';
import JobProgress, { useJobStatus } from '../components/JobProgress';
import JobHistory from '../components/JobHistory';

const TOPICS = [
  'Arrays', 'Linked Lists', 'Stacks & Queues', 'Trees', 'Graphs',
  'Dynamic Programming', 'Recursion', 'Binary Search', 'Sorting', 'Hashing',
  'OOP Concepts', 'Design Patterns', 'SOLID Principles', 'System Design', 'SQL',
];

const QUESTION_TYPES = ['DSA', 'OOPS', 'SQL', 'SYSTEM_DESIGN', 'CONCEPTUAL', 'MCQ'];
const LANGUAGES = ['python', 'java', 'cpp', 'javascript'];
const STYLES = [
  // Campus-placement patterns first: this is what a placement-training team assesses against.
  'TCS NQT', 'Infosys campus', 'Wipro NLTH', 'Cognizant GenC', 'Accenture campus', 'Capgemini campus',
  'Service-based', 'Product-based', 'Startup', 'Google-style', 'Amazon-style', 'Data Science',
];
const ROLE_LEVELS = ['intern', 'sde1', 'sde2', 'senior', 'lead'];
const ROLE_LABELS: Record<string, string> = {
  intern: 'Fresher / Intern — campus placement standard',
};
const LLM_PROVIDERS = ['gemini', 'anthropic', 'openai'];

/** Shown in the provider picker. The exact model is chosen server-side (see Admin → LLM Keys). */
const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI',
};

/** How each question type is checked — shown so nobody assumes more than is true. */
const VALIDATION_NOTES: Record<string, string> = {
  DSA: 'runs every solution in the sandbox against a brute-force oracle',
  SQL: 'runs two independent queries in SQLite on several datasets',
  MCQ: 'blind-solved by a second model, then adversarially reviewed',
  OOPS: 'code in the question is run to prove the answer, then blind-solved by a second model and adversarially reviewed',
  CONCEPTUAL: 'blind-solved by a second model, then adversarially reviewed',
  SYSTEM_DESIGN: 'rubric reviewed by a second model (not executable)',
};

export default function GeneratePage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState({
    roleLevel: 'intern',
    topics: ['Arrays'],
    difficultyDistribution: { easy: 50, medium: 40, hard: 10 },
    totalQuestions: 10,
    questionTypes: ['DSA'],
    languages: ['python'],
    companyStyle: 'TCS NQT',
    llmProvider: 'gemini',
    mcqOptionsCount: 4,
  });
  const [jobId, setJobId] = useState<string | null>(null);
  // Bumped whenever the same job is re-run (retry), so the live subscription restarts.
  const [run, setRun] = useState(0);
  const job = useJobStatus(jobId ? `${jobId}` : null, undefined, run);
  const jobRunning = !!jobId && !job?.done;
  const [actionError, setActionError] = useState<string | null>(null);

  const jobAction = useMutation({
    mutationFn: (action: 'cancel' | 'retry-failed') => axios.post(`/api/generate/jobs/${jobId}/${action}`).then(r => r.data),
    onSuccess: (_data, action) => {
      setActionError(null);
      if (action === 'retry-failed') setRun(r => r + 1);
    },
    onError: (err: any) => setActionError(err?.response?.data?.error?.message ?? 'That did not work.'),
  });

  const mutation = useMutation({
    mutationFn: () => axios.post('/api/generate', config).then(r => r.data),
    onSuccess: (data) => setJobId(data.jobId),
  });

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
            ONE JOB PER QUESTION
          </span>
        </div>
      </div>

      <div className="page-body">

        {/* ---- Live job progress: one row per question ---- */}
        {jobId && (
          <div className="card animate-fade-in" style={{
            marginBottom: 32,
            borderColor: job?.done
              ? (job.counts.validated > 0 ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)')
              : 'rgba(244,63,94,0.4)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {!job?.done && <Loader2 size={20} color="var(--color-primary)" style={{ animation: 'spin 1s linear infinite' }} />}
                {job?.done && job.counts.validated > 0 && <CheckCircle2 size={22} color="var(--color-success)" />}
                {job?.done && job.counts.validated === 0 && <XCircle size={22} color="var(--color-error)" />}
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                    {!job ? 'Starting…'
                      : !job.done ? (job.state === 'waiting' ? 'Queued' : 'Generating and validating')
                      : job.counts.failed === 0 ? `All ${job.total} questions validated`
                      : job.counts.validated === 0 ? 'No question passed validation'
                      : `${job.counts.validated} of ${job.total} questions validated`}
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                    Job {jobId}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--color-primary)' }}>
                  {job?.progress ?? 0}%
                </span>
                {job && !job.done && job.kind === 'GENERATE' && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => jobAction.mutate('cancel')}
                    disabled={jobAction.isPending || !!job.cancelledAt}
                  >
                    {job.cancelledAt ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
                {job?.done && (
                  <>
                    {job.kind === 'GENERATE' && job.counts.failed > 0 && (
                      <button className="btn btn-secondary btn-sm" onClick={() => jobAction.mutate('retry-failed')} disabled={jobAction.isPending}>
                        Retry {job.counts.failed} failed
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={startNew}>New Batch</button>
                    {job.counts.validated > 0 && (
                      <button className="btn btn-primary btn-sm" onClick={() => navigate('/dashboard/review')}>
                        Open Review Queue →
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {actionError && (
              <div className="alert alert-error" style={{ marginBottom: 12 }}>
                <AlertCircle size={15} /> <span>{actionError}</span>
              </div>
            )}

            <JobProgress status={job} />

            {job?.done && job.counts.failed > 0 && (
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                Failed questions are kept in the Question Bank with status FAILED and the validator's full report.
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
                    <option key={r} value={r}>{ROLE_LABELS[r] ?? `${r.toUpperCase()} — Technical Interview Standard`}</option>
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
                <label className="form-label">LLM Provider</label>
                <select
                  className="form-select"
                  value={config.llmProvider}
                  onChange={e => setConfig(c => ({ ...c, llmProvider: e.target.value }))}
                >
                  {LLM_PROVIDERS.map(p => (
                    <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
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

              {config.questionTypes.length > 0 && (
                <ul style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                  {config.questionTypes.map(t => (
                    <li key={t}><strong style={{ color: 'var(--text-secondary)' }}>{t}</strong> — {VALIDATION_NOTES[t]}</li>
                  ))}
                </ul>
              )}

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
              <div className="card-title">Execution Languages (DSA only)</div>
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

            {/* Quantity */}
            <div className="card animate-fade-in animate-delay-4" style={{
              background: 'linear-gradient(180deg, rgba(244,63,94,0.06) 0%, rgba(15,22,38,0.9) 100%)',
              borderColor: 'rgba(244,63,94,0.3)'
            }}>
              <div className="card-title">Batch Size</div>
              
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

              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Each question is its own job and may take up to 3 drafting attempts. Actual token usage
                {' '}and cost are measured and shown live once the batch starts — no estimate is shown here
                {' '}because it would only be a guess.
              </div>

              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%', justifyContent: 'center', marginTop: 24, height: 48, fontSize: 15 }}
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !diffValid || config.topics.length === 0 || config.questionTypes.length === 0 || (config.questionTypes.includes('DSA') && config.languages.length === 0) || jobRunning}
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

        <JobHistory activeJobId={jobId} onSelect={(id) => { setActionError(null); setJobId(id); }} refreshKey={`${jobId}-${job?.done}-${run}`} />

      </div>
    </>
  );
}
