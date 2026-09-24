import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Database, ClipboardList, CreditCard, Wand2, BookOpen,
  ChevronRight, ChevronLeft, Bell, Search, Clock, ArrowUpRight,
  CheckCircle2
} from 'lucide-react';

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
  const estimatedCost = (totalQuestions * 0.001).toFixed(2);
  const recentQuestions = recent ?? [];

  return (
    <>
      {/* Top Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Console</span>
            <span>/</span>
            <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Overview</span>
          </div>
          <h1 style={{ margin: 0 }}>Engineering Status</h1>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 14, top: 11, color: 'var(--text-muted)' }} size={16} />
            <input
              className="form-input"
              placeholder="Search questions, papers..."
              style={{ width: 280, paddingLeft: 40, height: 38 }}
            />
          </div>
          <button className="btn btn-secondary" style={{ padding: '9px 12px' }} title="Notifications">
            <Bell size={16} />
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard/generate')}>
            <Wand2 size={16} />
            <span>Generate Batch</span>
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Top Metrics Row */}
        <div className="dashboard-metric-grid">
          
          {/* Card 1: Total Questions */}
          <div className="stat-card animate-fade-in animate-delay-1">
            <div className="metric-card-header">
              <span>Total Questions Generated</span>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)'
              }}>
                <Database size={16} />
              </div>
            </div>
            
            <div className="metric-value">{totalQuestions.toLocaleString()}</div>
            
            <div className="metric-subtext">
              <span className="positive" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <ArrowUpRight size={13} />
                +14.2%
              </span>
              <span>vs previous 7 days</span>
            </div>

            {/* Sparkline with translucent area fill */}
            <svg className="sparkline-svg" viewBox="0 0 100 32" preserveAspectRatio="none">
              <defs>
                <linearGradient id="roseSparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d="M0,24 L15,20 L30,22 L45,14 L60,18 L75,6 L90,10 L100,4 L100,32 L0,32 Z" fill="url(#roseSparkGrad)" />
              <path d="M0,24 L15,20 L30,22 L45,14 L60,18 L75,6 L90,10 L100,4" fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Card 2: Pending Review */}
          <div className="stat-card animate-fade-in animate-delay-2">
            <div className="metric-card-header">
              <span>Awaiting Moderator Review</span>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f59e0b'
              }}>
                <ClipboardList size={16} />
              </div>
            </div>

            <div className="metric-value">{pendingReview}</div>

            <div className="metric-subtext" style={{ justifyContent: 'space-between', width: '100%' }}>
              <span>Questions in queue</span>
              {pendingReview > 0 ? (
                <span className="badge-alert">ACTION REQUIRED</span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={12} /> Clear
                </span>
              )}
            </div>

            {/* Sparkline */}
            <svg className="sparkline-svg" viewBox="0 0 100 32" preserveAspectRatio="none">
              <defs>
                <linearGradient id="amberSparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d="M0,15 L20,18 L40,12 L60,20 L80,14 L100,10 L100,32 L0,32 Z" fill="url(#amberSparkGrad)" />
              <path d="M0,15 L20,18 L40,12 L60,20 L80,14 L100,10" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Card 3: API Cost Estimator */}
          <div className="stat-card animate-fade-in animate-delay-3">
            <div className="metric-card-header">
              <span>Estimated LLM Incurred Cost</span>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#a78bfa'
              }}>
                <CreditCard size={16} />
              </div>
            </div>

            <div className="metric-value">${estimatedCost}</div>

            <div className="metric-subtext" style={{ justifyContent: 'space-between', width: '100%' }}>
              <span>Accumulated BYOK tokens</span>
              <span style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)' }}>
                ~2.5k tokens/question
              </span>
            </div>

            {/* Sparkline */}
            <svg className="sparkline-svg" viewBox="0 0 100 32" preserveAspectRatio="none">
              <defs>
                <linearGradient id="violetSparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d="M0,28 L25,24 L50,18 L75,12 L100,8 L100,32 L0,32 Z" fill="url(#violetSparkGrad)" />
              <path d="M0,28 L25,24 L50,18 L75,12 L100,8" fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

        </div>

        {/* Bottom Split: Recent Stream & Operations */}
        <div className="dashboard-layout">
          
          {/* Left Column: Recent Generations Stream */}
          <div className="card animate-fade-in animate-delay-4" style={{ padding: 0 }}>
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock size={16} color="var(--color-primary)" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                  Recent Generations
                </h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="badge-live">
                  <span className="pulse-indicator" style={{ background: '#10b981', color: '#10b981' }} />
                  LIVE STREAM
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate('/dashboard/questions')}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  View All →
                </button>
              </div>
            </div>

            <div className="table-wrapper" style={{ border: 'none', borderRadius: 0, background: 'transparent' }}>
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Difficulty</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLoading ? (
                    <tr>
                      <td colSpan={4} style={{ padding: 24 }}>
                        <div className="skeleton" style={{ height: 48, marginBottom: 8 }} />
                        <div className="skeleton" style={{ height: 48 }} />
                      </td>
                    </tr>
                  ) : recentQuestions.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                        <Wand2 size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                        <div>No questions generated yet. Start your first batch below.</div>
                      </td>
                    </tr>
                  ) : recentQuestions.map((q: any) => (
                    <tr key={q.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {q.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {q.topic || 'General'} • Generated {new Date(q.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${q.difficulty.toLowerCase()}`}>
                          {q.difficulty}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${q.type.toLowerCase()}`}>
                          {q.type}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${q.status.toLowerCase()}`}>
                          {q.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{
              padding: '16px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid var(--border-light)',
              background: 'rgba(255, 255, 255, 0.01)'
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Showing recent {recentQuestions.length} of {totalQuestions.toLocaleString()} items
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary" style={{ padding: '6px 10px', minWidth: 32 }} disabled>
                  <ChevronLeft size={14} />
                </button>
                <button className="btn btn-primary" style={{ padding: '6px 12px', minWidth: 32 }}>1</button>
                <button className="btn btn-secondary" style={{ padding: '6px 10px', minWidth: 32 }} onClick={() => navigate('/dashboard/questions')}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Quick Operations */}
          <div className="animate-fade-in animate-delay-3" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Quick Operations
            </h3>

            {/* Operation 1 */}
            <div
              className="quick-op-card primary"
              onClick={() => navigate('/dashboard/generate')}
            >
              <div className="icon-box">
                <Wand2 size={20} />
              </div>
              <h3>Generate New Batch</h3>
              <p>Configure role-level assessment parameters, topic distributions, and run real-time Piston sandbox validation.</p>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                Open Generation Wizard →
              </button>
            </div>

            {/* Operation 2 */}
            <div
              className="quick-op-card secondary"
              onClick={() => navigate('/dashboard/papers')}
            >
              <div className="icon-box">
                <BookOpen size={20} />
              </div>
              <h3>Assemble Assessment Paper</h3>
              <p>Curate approved questions into calibrated papers and export to JSON, Markdown, or PDF bundles.</p>
              <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                Curate Assessment Paper →
              </button>
            </div>

          </div>

        </div>
      </div>
    </>
  );
}
