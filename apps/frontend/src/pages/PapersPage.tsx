import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { FileDown, BookOpen, Plus, Download } from 'lucide-react';

export default function PapersPage() {
  const qc = useQueryClient();
  const [exporting, setExporting] = useState<string | null>(null);
  const [downloadLinks, setDownloadLinks] = useState<Record<string, { url: string; expires: string; format: string }[]>>({});
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['papers'],
    queryFn: () => axios.get('/api/papers').then(r => r.data.papers),
  });

  const handleExport = async (paperId: string, format: string) => {
    setExporting(paperId + format);
    try {
      const res = await axios.post('/api/export', { paperId, format });
      setDownloadLinks(prev => ({
        ...prev,
        [paperId]: [...(prev[paperId] ?? []), { url: res.data.downloadUrl, expires: res.data.expiresAt, format }],
      }));
    } finally {
      setExporting(null);
    }
  };

  const handleGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setGenerating(true);
    setGenerateError('');
    try {
      const formData = new FormData(e.currentTarget);
      const title = formData.get('title') as string;
      const count = Number(formData.get('count'));

      const qRes = await axios.get(`/api/questions?status=APPROVED&limit=${count}`);
      const questions = qRes.data.questions;
      if (questions.length === 0) {
        throw new Error('No approved questions found. Please approve questions in the Review Queue first.');
      }
      
      await axios.post('/api/papers', {
        title,
        questionIds: questions.map((q: any) => q.id)
      });
      
      qc.invalidateQueries({ queryKey: ['papers'] });
      (e.target as HTMLFormElement).reset();
    } catch (err: any) {
      setGenerateError(err.response?.data?.error?.message || err.message || 'Failed to assemble assessment paper');
    } finally {
      setGenerating(false);
    }
  };

  const papers = data ?? [];

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>Console</span> / <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Assessments</span>
          </div>
          <h1 style={{ margin: 0 }}>Assessment Papers</h1>
          <p style={{ margin: 0, marginTop: 4 }}>Curate, compile, and securely export calibrated technical evaluations.</p>
        </div>

        {/* Paper Assembly Form */}
        <form
          onSubmit={handleGenerate}
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            background: 'var(--bg-glass-card)',
            backdropFilter: 'blur(16px)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-light)',
            boxShadow: 'var(--shadow-card)'
          }}
        >
          <input
            name="title"
            className="form-input"
            placeholder="e.g. SDE-2 Systems Evaluation"
            required
            style={{ width: 220, height: 36 }}
          />
          <input
            name="count"
            className="form-input"
            type="number"
            min={1}
            max={100}
            placeholder="Count"
            required
            style={{ width: 80, height: 36 }}
            defaultValue={10}
          />
          <button type="submit" className="btn btn-primary" disabled={generating} style={{ height: 36 }}>
            {generating ? <span className="spinner" /> : (
              <>
                <Plus size={15} />
                <span>Compile Paper</span>
              </>
            )}
          </button>
        </form>
      </div>

      {generateError && (
        <div className="alert alert-error" style={{ margin: '24px 40px 0' }}>
          {generateError}
        </div>
      )}

      <div className="page-body">
        {isLoading ? (
          <div className="grid-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 160, borderRadius: 14 }} />
            ))}
          </div>
        ) : papers.length === 0 ? (
          <div className="card empty-state" style={{ padding: '72px 24px' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-primary)',
              boxShadow: '0 0 32px rgba(244, 63, 94, 0.2)'
            }}>
              <BookOpen size={32} />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 12 }}>
              No Assessment Papers Created Yet
            </h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: 440 }}>
              Use the compiler above to bundle approved questions from your bank into a comprehensive assessment paper.
            </p>
          </div>
        ) : (
          <div className="grid-2">
            {papers.map((paper: any, i: number) => {
              const links = downloadLinks[paper.id] ?? [];

              return (
                <div key={paper.id} className={`card animate-fade-in animate-delay-${Math.min(i + 1, 4)}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
                        {paper.title}
                      </h3>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        Created on {new Date(paper.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="badge badge-dsa" style={{ fontSize: 11 }}>
                      {paper.questionCount ?? paper.questions?.length ?? 0} Questions
                    </span>
                  </div>

                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
                    Calibrated evaluation bundle ready for LMS export, offline printing, or ATS dispatch.
                  </p>

                  {/* Export Options */}
                  <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10 }}>
                      Export Assessment Artifact
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['pdf', 'markdown', 'json'].map(fmt => (
                        <button
                          key={fmt}
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleExport(paper.id, fmt)}
                          disabled={exporting === paper.id + fmt}
                          style={{ textTransform: 'uppercase', fontSize: 11, padding: '5px 12px' }}
                        >
                          {exporting === paper.id + fmt ? (
                            <span className="spinner" />
                          ) : (
                            <FileDown size={13} />
                          )}
                          <span>{fmt}</span>
                        </button>
                      ))}
                    </div>

                    {/* Active Download Links */}
                    {links.length > 0 && (
                      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {links.map((link, idx) => (
                          <a
                            key={idx}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'rgba(16, 185, 129, 0.1)',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                              color: '#10b981',
                              fontSize: 12,
                              textDecoration: 'none'
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                              <Download size={13} />
                              Download {link.format.toUpperCase()} Bundle
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              Expires {new Date(link.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
