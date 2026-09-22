import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { FileQuestion, CheckCircle, XCircle, Clock, TrendingUp, Zap, BookOpen } from 'lucide-react';
export default function DashboardPage() {
    const { user } = useAuth();
    const { data: overview, isLoading } = useQuery({
        queryKey: ['analytics-overview'],
        queryFn: () => axios.get('/api/analytics/overview').then(r => r.data.analytics),
    });
    const { data: validationRate } = useQuery({
        queryKey: ['validation-rate'],
        queryFn: () => axios.get('/api/analytics/validation-rate').then(r => r.data),
    });
    const stats = [
        { label: 'Total Questions', value: overview?.totalQuestions ?? 0, icon: <FileQuestion size={20}/>, color: 'var(--color-primary)' },
        { label: 'Generated Today', value: overview?.generatedToday ?? 0, icon: <Zap size={20}/>, color: 'var(--color-accent)' },
        { label: 'Approved', value: overview?.byStatus?.APPROVED ?? 0, icon: <CheckCircle size={20}/>, color: 'var(--color-success)' },
        { label: 'Validation Rate', value: `${validationRate?.validationRate ?? 0}%`, icon: <TrendingUp size={20}/>, color: 'var(--color-secondary)' },
        { label: 'In Review', value: overview?.byStatus?.IN_REVIEW ?? 0, icon: <Clock size={20}/>, color: 'var(--color-warning)' },
        { label: 'Rejected', value: overview?.byStatus?.REJECTED ?? 0, icon: <XCircle size={20}/>, color: 'var(--color-error)' },
    ];
    return (<>
      <div className="page-header">
        <h1>Welcome back, {user?.name?.split(' ')[0]} 👋</h1>
        <p>Here's your question bank overview for today.</p>
      </div>
      <div className="page-body">
        {isLoading ? (<div className="stat-grid">
            {[...Array(6)].map((_, i) => (<div key={i} className="stat-card"><div className="skeleton" style={{ height: 80 }}/></div>))}
          </div>) : (<div className="stat-grid animate-fade-in">
            {stats.map(s => (<div key={s.label} className="stat-card">
                <div className="stat-icon" style={{ color: s.color }}>{s.icon}</div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>))}
          </div>)}

        <div className="grid-2" style={{ gap: 20 }}>
          <div className="card animate-fade-in">
            <div className="card-title">📊 Questions by Topic</div>
            <div className="card-subtitle">Top 10 most covered topics in your bank</div>
            {overview?.topTopics?.length ? (<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {overview.topTopics.map((t) => (<div key={t.topic} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, fontSize: 13 }}>{t.topic}</div>
                    <div style={{ width: 120, height: 6, background: 'var(--color-bg-elevated)', borderRadius: 3 }}>
                      <div style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
                    borderRadius: 3,
                    width: `${Math.min((t.count / (overview?.totalQuestions || 1)) * 100 * 3, 100)}%`,
                    transition: 'width 0.6s ease',
                }}/>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', width: 24, textAlign: 'right' }}>{t.count}</div>
                  </div>))}
              </div>) : (<div className="empty-state">
                <BookOpen size={32}/>
                <h3>No questions yet</h3>
                <p>Start by generating your first batch of questions.</p>
              </div>)}
          </div>

          <div className="card animate-fade-in">
            <div className="card-title">🎯 Difficulty Distribution</div>
            <div className="card-subtitle">Balance across your question bank</div>
            {overview ? (<div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
                {[
                { label: 'Easy', value: overview.byDifficulty?.EASY ?? 0, color: 'var(--color-easy)' },
                { label: 'Medium', value: overview.byDifficulty?.MEDIUM ?? 0, color: 'var(--color-medium)' },
                { label: 'Hard', value: overview.byDifficulty?.HARD ?? 0, color: 'var(--color-hard)' },
            ].map(d => {
                const pct = overview.totalQuestions > 0 ? ((d.value / overview.totalQuestions) * 100).toFixed(0) : 0;
                return (<div key={d.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: d.color }}>{d.label}</span>
                        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{d.value} ({pct}%)</span>
                      </div>
                      <div style={{ height: 8, background: 'var(--color-bg-elevated)', borderRadius: 4 }}>
                        <div style={{
                        height: '100%', background: d.color, borderRadius: 4,
                        width: `${pct}%`, transition: 'width 0.6s ease',
                    }}/>
                      </div>
                    </div>);
            })}
              </div>) : null}
          </div>
        </div>
      </div>
    </>);
}
//# sourceMappingURL=DashboardPage.js.map