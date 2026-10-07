import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { FileDown, BookOpen, Plus, Download, Trash2, ArrowUp, ArrowDown, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

const TYPES = ['', 'DSA', 'SQL', 'MCQ', 'OOPS', 'CONCEPTUAL', 'SYSTEM_DESIGN'];
const DIFFICULTIES = ['', 'EASY', 'MEDIUM', 'HARD'];

/** The API's export formats, with the label shown on the button. */
const EXPORT_FORMATS = [
  { format: 'PDF_CANDIDATE', label: 'Candidate PDF', hint: 'Questions only' },
  { format: 'PDF_INTERNAL', label: 'Internal PDF', hint: 'With answers and solutions' },
  { format: 'JSON', label: 'JSON', hint: 'For import into another system' },
] as const;

interface BlueprintRow { type: string; difficulty: string; count: number }
interface Availability { type: string; difficulty: string; count: number }

const apiError = (err: any, fallback: string) => err?.response?.data?.error?.message ?? err?.message ?? fallback;

/** How many approved questions match a blueprint row (blank type/difficulty = any). */
function availableFor(row: BlueprintRow, available: Availability[]): number {
  return available
    .filter((a) => (!row.type || a.type === row.type) && (!row.difficulty || a.difficulty === row.difficulty))
    .reduce((sum, a) => sum + a.count, 0);
}

function PaperBuilder() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<BlueprintRow[]>([{ type: 'DSA', difficulty: '', count: 2 }]);
  const [error, setError] = useState<string | null>(null);

  const { data: available = [] } = useQuery({
    queryKey: ['paper-availability'],
    queryFn: () => axios.get('/api/papers/availability').then((r) => r.data.available as Availability[]),
    staleTime: 0,
  });

  const assemble = useMutation({
    mutationFn: () =>
      axios.post('/api/papers/assemble', {
        title,
        blueprint: rows.map((r) => ({ count: r.count, ...(r.type && { type: r.type }), ...(r.difficulty && { difficulty: r.difficulty }) })),
      }),
    onSuccess: () => {
      setError(null);
      setTitle('');
      qc.invalidateQueries({ queryKey: ['papers'] });
    },
    onError: (err) => setError(apiError(err, 'Could not assemble the paper.')),
  });

  const update = (i: number, patch: Partial<BlueprintRow>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const totalApproved = available.reduce((sum, a) => sum + a.count, 0);
  const total = rows.reduce((sum, r) => sum + (r.count || 0), 0);
  const short = rows.some((r) => r.count > availableFor(r, available));

  return (
    <div className="card animate-fade-in" style={{ marginBottom: 28 }}>
      <div className="card-title">Build a paper</div>
      <div className="card-subtitle">
        Say how many questions of each kind you want. They are drawn at random from your {totalApproved} approved
        question{totalApproved === 1 ? '' : 's'}, never the same one twice.
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="paper-title">Paper title</label>
        <input id="paper-title" className="form-input" placeholder="e.g. SDE-1 Screening, October" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {rows.map((row, i) => {
        const have = availableFor(row, available);
        return (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              className="form-input" type="number" min={1} max={100} aria-label={`Row ${i + 1} count`}
              style={{ width: 80 }} value={row.count}
              onChange={(e) => update(i, { count: Math.max(1, Number(e.target.value) || 1) })}
            />
            <select className="form-select" aria-label={`Row ${i + 1} difficulty`} style={{ width: 150 }} value={row.difficulty} onChange={(e) => update(i, { difficulty: e.target.value })}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d || 'Any difficulty'}</option>)}
            </select>
            <select className="form-select" aria-label={`Row ${i + 1} type`} style={{ width: 170 }} value={row.type} onChange={(e) => update(i, { type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t || 'Any type'}</option>)}
            </select>
            <span style={{ fontSize: 12, color: row.count > have ? 'var(--color-error)' : 'var(--text-muted)' }}>
              {have} approved available
            </span>
            {rows.length > 1 && (
              <button className="btn btn-secondary btn-sm" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setRows((rs) => [...rs, { type: '', difficulty: '', count: 1 }])}>
          <Plus size={13} /> Add row
        </button>
        <button className="btn btn-primary" disabled={!title.trim() || short || assemble.isPending} onClick={() => assemble.mutate()}>
          {assemble.isPending ? <span className="spinner" /> : <><Plus size={15} /> <span>Build paper ({total} questions)</span></>}
        </button>
        {short && <span style={{ fontSize: 12, color: 'var(--color-error)' }}>Not enough approved questions for a row above.</span>}
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginTop: 14, marginBottom: 0 }}>
          <AlertCircle size={15} /> <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/** The ordered question list of one paper, with move up / down / remove. */
function PaperContents({ paperId }: { paperId: string }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: paper } = useQuery({
    queryKey: ['paper', paperId],
    queryFn: () => axios.get(`/api/papers/${paperId}`).then((r) => r.data.paper),
    staleTime: 0,
  });

  const save = useMutation({
    mutationFn: (questionIds: string[]) => axios.patch(`/api/papers/${paperId}`, { questionIds }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['paper', paperId] });
      qc.invalidateQueries({ queryKey: ['papers'] });
    },
    onError: (err) => setError(apiError(err, 'Could not update the paper.')),
  });

  if (!paper) return <div className="skeleton" style={{ height: 60, borderRadius: 10, marginTop: 14 }} />;

  const ids: string[] = paper.questions.map((pq: any) => pq.questionId);
  const move = (from: number, to: number) => {
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    save.mutate(next);
  };

  return (
    <div style={{ marginTop: 14 }}>
      {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
      {paper.questions.map((pq: any, i: number) => (
        <div key={pq.questionId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border-light)', fontSize: 13 }}>
          <span style={{ width: 22, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{i + 1}.</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pq.question.title}</span>
          <span className={`badge badge-${pq.question.difficulty.toLowerCase()}`}>{pq.question.difficulty}</span>
          <span className={`badge badge-${pq.question.type.toLowerCase()}`}>{pq.question.type}</span>
          <button className="btn btn-secondary btn-sm" aria-label={`Move question ${i + 1} up`} disabled={i === 0 || save.isPending} onClick={() => move(i, i - 1)}><ArrowUp size={12} /></button>
          <button className="btn btn-secondary btn-sm" aria-label={`Move question ${i + 1} down`} disabled={i === ids.length - 1 || save.isPending} onClick={() => move(i, i + 1)}><ArrowDown size={12} /></button>
          <button className="btn btn-secondary btn-sm" aria-label={`Remove question ${i + 1}`} disabled={ids.length === 1 || save.isPending} onClick={() => save.mutate(ids.filter((id) => id !== pq.questionId))}><Trash2 size={12} /></button>
        </div>
      ))}
    </div>
  );
}

export default function PapersPage() {
  const [exporting, setExporting] = useState<string | null>(null);
  const [openPaper, setOpenPaper] = useState<string | null>(null);
  const [exportError, setExportError] = useState<Record<string, string>>({});
  const [downloadLinks, setDownloadLinks] = useState<Record<string, { url: string; expires: string; label: string }[]>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['papers'],
    queryFn: () => axios.get('/api/papers').then((r) => r.data.papers),
  });

  const handleExport = async (paperId: string, format: string, label: string) => {
    setExporting(paperId + format);
    setExportError((e) => ({ ...e, [paperId]: '' }));
    try {
      const res = await axios.post('/api/export', { paperId, format });
      setDownloadLinks((prev) => ({
        ...prev,
        [paperId]: [...(prev[paperId] ?? []), { url: res.data.downloadUrl, expires: res.data.expiresAt, label }],
      }));
    } catch (err) {
      setExportError((e) => ({ ...e, [paperId]: apiError(err, 'Export failed.') }));
    } finally {
      setExporting(null);
    }
  };

  const papers = data ?? [];

  return (
    <>
      <div className="page-header">
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 4 }}>
          <span>Console</span> / <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Assessments</span>
        </div>
        <h1 style={{ margin: 0 }}>Assessment Papers</h1>
        <p style={{ margin: 0, marginTop: 4 }}>Build papers from approved questions, arrange them, and export.</p>
      </div>

      <div className="page-body">
        <PaperBuilder />

        {isLoading ? (
          <div className="grid-2">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 160, borderRadius: 14 }} />)}
          </div>
        ) : papers.length === 0 ? (
          <div className="card empty-state" style={{ padding: '56px 24px' }}>
            <BookOpen size={32} color="var(--color-primary)" />
            <h3 style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 12 }}>No papers yet</h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: 440 }}>
              Approve questions in the Review Queue, then build a paper from them above.
            </p>
          </div>
        ) : (
          <div className="grid-2">
            {papers.map((paper: any) => {
              const links = downloadLinks[paper.id] ?? [];
              const isOpen = openPaper === paper.id;

              return (
                <div key={paper.id} className="card animate-fade-in">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)' }}>{paper.title}</h3>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        Created {new Date(paper.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="badge badge-dsa" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      {paper._count?.questions ?? 0} Questions
                    </span>
                  </div>

                  <button className="btn btn-secondary btn-sm" onClick={() => setOpenPaper(isOpen ? null : paper.id)} aria-expanded={isOpen}>
                    {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    <span>{isOpen ? 'Hide questions' : 'Arrange questions'}</span>
                  </button>
                  {isOpen && <PaperContents paperId={paper.id} />}

                  <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 16, marginTop: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10 }}>
                      Export
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {EXPORT_FORMATS.map(({ format, label, hint }) => (
                        <button
                          key={format}
                          className="btn btn-secondary btn-sm"
                          title={hint}
                          onClick={() => handleExport(paper.id, format, label)}
                          disabled={exporting === paper.id + format}
                          style={{ fontSize: 12, padding: '5px 12px' }}
                        >
                          {exporting === paper.id + format ? <span className="spinner" /> : <FileDown size={13} />}
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>

                    {exportError[paper.id] && (
                      <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>
                        <AlertCircle size={15} /> <span>{exportError[paper.id]}</span>
                      </div>
                    )}

                    {links.length > 0 && (
                      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {links.map((link, idx) => (
                          <a
                            key={idx}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                              background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)',
                              color: '#10b981', fontSize: 12, textDecoration: 'none',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                              <Download size={13} /> Download {link.label}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              Link expires {new Date(link.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
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
