import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#ec4899'];
export default function AnalyticsPage() {
    const { data: overview } = useQuery({
        queryKey: ['analytics-overview'],
        queryFn: () => axios.get('/api/analytics/overview').then(r => r.data.analytics),
    });
    const { data: validationData } = useQuery({
        queryKey: ['validation-rate'],
        queryFn: () => axios.get('/api/analytics/validation-rate').then(r => r.data),
    });
    const topicChartData = overview?.topTopics?.map((t) => ({ topic: t.topic.slice(0, 12), count: t.count })) ?? [];
    const difficultyData = overview ? [
        { name: 'Easy', value: overview.byDifficulty?.EASY ?? 0, color: '#22c55e' },
        { name: 'Medium', value: overview.byDifficulty?.MEDIUM ?? 0, color: '#f59e0b' },
        { name: 'Hard', value: overview.byDifficulty?.HARD ?? 0, color: '#ef4444' },
    ] : [];
    const typeData = overview ? Object.entries(overview.byType ?? {}).map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] })) : [];
    return (<>
      <div className="page-header">
        <h1>📈 Analytics</h1>
        <p>Topic coverage, difficulty distribution, and validation health.</p>
      </div>
      <div className="page-body">
        {/* Validation Health */}
        <div className="stat-grid" style={{ marginBottom: 28 }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: 'var(--color-success)' }}>✅</div>
            <div className="stat-value" style={{ color: 'var(--color-success)' }}>{validationData?.validationRate ?? 0}%</div>
            <div className="stat-label">Validation Pass Rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: 'var(--color-error)' }}>❌</div>
            <div className="stat-value" style={{ color: 'var(--color-error)' }}>{validationData?.failureRate ?? 0}%</div>
            <div className="stat-label">Failure Rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: 'var(--color-primary)' }}>📊</div>
            <div className="stat-value" style={{ color: 'var(--color-primary)' }}>{validationData?.total ?? 0}</div>
            <div className="stat-label">Total Processed</div>
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 20 }}>
          {/* Topic Coverage */}
          <div className="card">
            <div className="card-title">📚 Topic Coverage Heatmap</div>
            <div className="card-subtitle">Questions per topic (top 10)</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topicChartData} margin={{ top: 5, right: 5, bottom: 40, left: 0 }}>
                <XAxis dataKey="topic" tick={{ fontSize: 10, fill: '#94a3b8' }} angle={-35} textAnchor="end"/>
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }}/>
                <Tooltip contentStyle={{ background: '#12122a', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, color: '#f1f5f9' }}/>
                <Bar dataKey="count" fill="url(#barGrad)" radius={[4, 4, 0, 0]}/>
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1"/>
                    <stop offset="100%" stopColor="#8b5cf6"/>
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Difficulty Pie */}
          <div className="card">
            <div className="card-title">🎯 Difficulty Distribution</div>
            <div className="card-subtitle">Across all questions</div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={difficultyData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {difficultyData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                </Pie>
                <Tooltip contentStyle={{ background: '#12122a', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, color: '#f1f5f9' }}/>
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Question Type Breakdown */}
        <div className="card">
          <div className="card-title">📝 Question Type Breakdown</div>
          <div className="card-subtitle">Distribution across DSA, OOPS, SQL, etc.</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
            {typeData.map((t) => (<div key={t.name} style={{
                flex: '1 1 120px',
                background: 'var(--color-bg-elevated)',
                borderRadius: 10,
                padding: '16px 20px',
                borderLeft: `3px solid ${t.color}`,
            }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: t.color }}>{t.value}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{t.name}</div>
              </div>))}
          </div>
        </div>
      </div>
    </>);
}
//# sourceMappingURL=AnalyticsPage.js.map