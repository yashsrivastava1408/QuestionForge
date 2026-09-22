import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { FileDown, BookOpen } from 'lucide-react';
export default function PapersPage() {
    const qc = useQueryClient();
    const [exporting, setExporting] = useState(null);
    const [downloadLinks, setDownloadLinks] = useState({});
    const { data, isLoading } = useQuery({
        queryKey: ['papers'],
        queryFn: () => axios.get('/api/papers').then(r => r.data.papers),
    });
    const handleExport = async (paperId, format) => {
        setExporting(paperId + format);
        try {
            const res = await axios.post('/api/export', { paperId, format });
            setDownloadLinks(prev => ({
                ...prev,
                [paperId]: [...(prev[paperId] ?? []), { url: res.data.downloadUrl, expires: res.data.expiresAt, format }],
            }));
        }
        finally {
            setExporting(null);
        }
    };
    const papers = data ?? [];
    return (<>
      <div className="page-header">
        <h1>📖 Papers</h1>
        <p>Manage and export approved assessment papers.</p>
      </div>
      <div className="page-body">
        {isLoading ? (<div className="grid-2">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 180, borderRadius: 12 }}/>)}
          </div>) : papers.length === 0 ? (<div className="empty-state">
            <BookOpen size={48}/>
            <h3>No papers yet</h3>
            <p>Create a paper by selecting approved questions from the Question Bank.</p>
          </div>) : (<div className="grid-2">
            {papers.map((paper) => (<div key={paper.id} className="card animate-fade-in">
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
                    { format: 'JSON', label: '📄 Export JSON', desc: 'Machine-readable' },
                    { format: 'PDF_CANDIDATE', label: '👤 Candidate PDF', desc: 'Questions only + watermark' },
                    { format: 'PDF_INTERNAL', label: '🔒 Internal PDF', desc: 'Includes answers + explanations' },
                ].map(e => (<button key={e.format} className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start', gap: 8 }} disabled={exporting === paper.id + e.format} onClick={() => handleExport(paper.id, e.format)}>
                      {exporting === paper.id + e.format ? <span className="spinner"/> : <FileDown size={14}/>}
                      <span>{e.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)' }}>{e.desc}</span>
                    </button>))}
                </div>

                {downloadLinks[paper.id]?.map((link, i) => (<div key={i} className="alert alert-success" style={{ marginTop: 12, padding: '10px 14px' }}>
                    <FileDown size={14}/>
                    <div style={{ fontSize: 12 }}>
                      <strong>{link.format}</strong> ready. &nbsp;
                      <a href={link.url} style={{ color: 'var(--color-success)', textDecoration: 'underline' }}>Download</a>
                      &nbsp;· Expires at {new Date(link.expires).toLocaleTimeString()}
                    </div>
                  </div>))}
              </div>))}
          </div>)}
      </div>
    </>);
}
//# sourceMappingURL=PapersPage.js.map