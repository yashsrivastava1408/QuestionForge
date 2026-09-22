import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Database, ClipboardList, CreditCard, Wand2, BookOpen, ChevronRight, ChevronLeft, Bell } from 'lucide-react';

export default function DashboardPage() {
  const navigate = useNavigate();

  const { data: overview } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => axios.get('/api/analytics/overview').then(r => r.data.analytics),
  });

  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ['recent-questions'],
    queryFn: () => axios.get('/api/questions?limit=5').then(r => r.data.questions),
  });

  const totalQuestions = overview?.totalQuestions ?? 0;
  const pendingReview = overview?.byStatus?.IN_REVIEW ?? 0;
  // Mock API cost estimator based on total questions (e.g., $0.001 per question generated)
  const estimatedCost = (totalQuestions * 0.001).toFixed(2);
  const recentQuestions = recent ?? [];

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Dashboard / <span style={{ color: 'var(--color-primary)' }}>Overview</span></div>
          <h1>Engineering Engine Status</h1>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <SearchIcon style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-muted)' }} size={16} />
            <input className="form-input" placeholder="Search questions, papers..." style={{ width: 280, paddingLeft: 36, background: 'var(--bg-secondary)' }} />
          </div>
          <button className="btn btn-secondary" style={{ padding: 10 }}><Bell size={16} /></button>
          <button className="btn btn-primary">Export Report</button>
        </div>
      </div>

      <div className="page-body">
        {/* Top Metrics Row */}
        <div className="dashboard-metric-grid">
          <div className="stat-card animate-fade-in animate-delay-1">
            <div className="metric-card-header">
              <span>Questions Generated</span>
              <Database size={16} color="var(--color-primary)" />
            </div>
            <div className="metric-value">{totalQuestions.toLocaleString()}</div>
            <div className="metric-subtext"><span className="positive">+14.2%</span> weekly growth</div>
            
            {/* Sparkline SVG Mock */}
            <svg className="sparkline-svg" viewBox="0 0 100 30" preserveAspectRatio="none">
              <path d="M0,20 L20,25 L40,15 L60,18 L80,5 L100,10" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="stat-card animate-fade-in animate-delay-2">
            <div className="metric-card-header">
              <span>Pending Review</span>
              <ClipboardList size={16} color="#facc15" />
            </div>
            <div className="metric-value">{pendingReview}</div>
            <div className="metric-subtext" style={{ justifyContent: 'space-between', width: '100%' }}>
              Requires moderator review
              {pendingReview > 0 && <span className="badge-alert">ACTION REQ</span>}
            </div>
          </div>

          <div className="stat-card animate-fade-in animate-delay-3">
            <div className="metric-card-header">
              <span>API Cost Estimator</span>
              <CreditCard size={16} color="var(--color-primary)" />
            </div>
            <div className="metric-value">${estimatedCost}</div>
            <div className="metric-subtext" style={{ justifyContent: 'space-between', width: '100%' }}>
              accumulated token cost
              <span style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--text-primary)' }}>6.4k/req avg</div>
                <div style={{ fontSize: 10 }}>Model: Claude 3.5 Sonnet</div>
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Layout Split */}
        <div className="dashboard-layout">
          {/* Left: Recent Generations */}
          <div className="card animate-fade-in animate-delay-4" style={{ padding: 0 }}>
            <div className="card-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClockIcon size={16} color="var(--color-primary)" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Recent Generations</h3>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--color-success)' }} /> LIVE</span>
                <span>ENGINE</span>
                <span>STREAM</span>
              </div>
            </div>

            <div className="table-wrapper" style={{ border: 'none' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead style={{ background: 'transparent' }}>
                  <tr>
                    <th style={{ padding: '12px 24px', fontSize: 11, borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>TITLE</th>
                    <th style={{ padding: '12px 24px', fontSize: 11, borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>DIFFICULTY</th>
                    <th style={{ padding: '12px 24px', fontSize: 11, borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>QUESTION TYPE</th>
                    <th style={{ padding: '12px 24px', fontSize: 11, borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLoading ? (
                    <tr><td colSpan={4} style={{ padding: 24 }}><div className="skeleton" style={{ height: 40 }} /></td></tr>
                  ) : recentQuestions.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No questions generated yet.</td></tr>
                  ) : recentQuestions.map((q: any) => (
                    <tr key={q.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '16px 24px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{q.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Generated {new Date(q.createdAt).toLocaleDateString()}</div>
                      </td>
                      <td style={{ padding: '16px 24px' }}><span className={`badge badge-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span></td>
                      <td style={{ padding: '16px 24px' }}><span className={`badge badge-${q.type.toLowerCase()}`}>{q.type}</span></td>
                      <td style={{ padding: '16px 24px' }}><span className={`badge badge-${q.status.toLowerCase()}`}>{q.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Showing {recentQuestions.length} of {totalQuestions.toLocaleString()} technical targets</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-secondary" style={{ padding: 6, borderRadius: 4, minWidth: 28 }}><ChevronLeft size={16} /></button>
                <button className="btn btn-primary" style={{ padding: 6, borderRadius: 4, minWidth: 28 }}>1</button>
                <button className="btn btn-secondary" style={{ padding: 6, borderRadius: 4, minWidth: 28 }}><ChevronRight size={16} /></button>
              </div>
            </div>
          </div>

          {/* Right: Quick Operations */}
          <div className="animate-fade-in animate-delay-3">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>Quick Operations</h3>
            
            <div className="quick-op-card primary" style={{ marginBottom: 16 }} onClick={() => navigate('/dashboard/generate')}>
              <div className="icon-box"><Wand2 size={20} /></div>
              <h3>Generate New Batch</h3>
              <p>Activate the AI Assessment engine with specific topic prompts, difficulty counts, and syntax checks.</p>
              <button className="btn" style={{ width: '100%', justifyContent: 'center' }}>Open Generation Wizard</button>
            </div>

            <div className="quick-op-card secondary" onClick={() => navigate('/dashboard/papers')}>
              <div className="icon-box"><BookOpen size={20} /></div>
              <h3>Create Assessment Paper</h3>
              <p>Curate verified questions into balanced online assessments for backend, frontend, or systems developers.</p>
              <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>Assemble New Paper</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const ClockIcon = ({ size, color }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const SearchIcon = ({ size, style }: any) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
