import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { FileDown, BookOpen, Plus } from 'lucide-react';

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
        throw new Error('No approved questions available in the bank.');
      }
      
      await axios.post('/api/papers', {
        title,
        questionIds: questions.map((q: any) => q.id)
      });
      
      qc.invalidateQueries({ queryKey: ['papers'] });
      (e.target as HTMLFormElement).reset();
    } catch (err: any) {
      setGenerateError(err.response?.data?.error?.message || err.message || 'Failed to generate paper');
    } finally {
      setGenerating(false);
    }
  };

  const papers = data ?? [];

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Papers</h1>
          <p>Draft and export full assessment papers.</p>
        </div>
        <form onSubmit={handleGenerate} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-secondary)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
          <input name="title" className="form-input" placeholder="Paper Title" required style={{ width: 200, padding: '8px 12px' }} />
          <input name="count" className="form-input" type="number" min={1} max={100} placeholder="Questions" required style={{ width: 100, padding: '8px 12px' }} defaultValue={10} />
          <button type="submit" className="btn btn-primary" disabled={generating}>
            {generating ? <span className="spinner" /> : <><Plus size={16} /> Auto-Generate</>}
          </button>
        </form>
      </div>
      {generateError && <div className="alert alert-error" style={{ margin: '24px 40px 0' }}>{generateError}</div>}
      <div className="page-body">
        {isLoading ? (
          <div className="grid-2">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 180, borderRadius: 12 }} />)}
          </div>
        ) : papers.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={48} />
            <h3>No papers yet</h3>
            <p>Use the Auto-Generate button above to create a paper from approved questions.</p>
          </div>
        ) : (
          <div className="grid-2">
            {papers.map((paper: any, i: number) => (
              <div key={paper.id} className={`card animate-fade-in animate-delay-${Math.min(i + 1, 4)}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div className="card-title">{paper.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      Paper ID: <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--color-bg-elevated)', padding: '1px 6px', borderRadius: 4 }}>
                        {paper.id.slice(0, 8).toUpperCase()}
                      </code>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{paper._count?.questions ?? 0} questions</span>
                </div>

                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
                  Created {new Date(paper.createdAt).toLocaleDateString()}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { format: 'JSON', label: 'Export JSON', desc: 'Machine-readable' },
                    { format: 'PDF_CANDIDATE', label: 'Candidate PDF', desc: 'Questions only + watermark' },
                    { format: 'PDF_INTERNAL', label: 'Internal PDF', desc: 'Includes answers + explanations' },
                  ].map(e => (
                    <button
                      key={e.format}
                      className="btn btn-secondary btn-sm"
                      style={{ justifyContent: 'flex-start', gap: 8 }}
                      disabled={exporting === paper.id + e.format}
                      onClick={() => handleExport(paper.id, e.format)}
                    >
                      {exporting === paper.id + e.format ? <span className="spinner" /> : <FileDown size={14} />}
                      <span>{e.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)' }}>{e.desc}</span>
                    </button>
                  ))}
                </div>

                {downloadLinks[paper.id]?.map((link, i) => (
                  <div key={i} className="alert alert-success" style={{ marginTop: 12, padding: '10px 14px' }}>
                    <FileDown size={14} />
                    <div style={{ fontSize: 12 }}>
                      <strong>{link.format}</strong> ready. &nbsp;
                      <a href={link.url} style={{ color: 'var(--color-success)', textDecoration: 'underline' }}>Download</a>
                      &nbsp;· Expires at {new Date(link.expires).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
