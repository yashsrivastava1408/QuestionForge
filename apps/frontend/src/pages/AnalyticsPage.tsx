import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { ShieldCheck, AlertOctagon, Database, BarChart3, PieChart as PieIcon, Layers } from 'lucide-react';

const COLORS = ['#f43f5e', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'];

export default function AnalyticsPage() {
  const { data: overview } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => axios.get('/api/analytics/overview').then(r => r.data.analytics),
  });
  const { data: validationData } = useQuery({
    queryKey: ['validation-rate'],
    queryFn: () => axios.get('/api/analytics/validation-rate').then(r => r.data),
  });

  const topicChartData = overview?.topTopics?.map((t: any) => ({ topic: t.topic.slice(0, 14), count: t.count })) ?? [];
  const difficultyData = overview ? [
    { name: 'Easy', value: overview.byDifficulty?.EASY ?? 0, color: '#10b981' },
    { name: 'Medium', value: overview.byDifficulty?.MEDIUM ?? 0, color: '#f59e0b' },
    { name: 'Hard', value: overview.byDifficulty?.HARD ?? 0, color: '#f43f5e' },
  ] : [];
  const typeData = overview ? Object.entries(overview.byType ?? {}).map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] })) : [];

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>Console</span> / <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Analytics</span>
          </div>
          <h1 style={{ margin: 0 }}>Telemetry & Validation Health</h1>
          <p style={{ margin: 0, marginTop: 4 }}>Domain topic saturation, difficulty distribution, and adversarial pass rates.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="badge-live">
            <span className="pulse-indicator" style={{ background: '#10b981', color: '#10b981' }} />
            REAL-TIME METRICS
          </span>
        </div>
      </div>

      <div className="page-body">
        {/* Validation Health Row */}
        <div className="stat-grid" style={{ marginBottom: 28 }}>
          
          <div className="stat-card animate-fade-in animate-delay-1">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="stat-label" style={{ margin: 0 }}>Validation Pass Rate</div>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#10b981'
              }}>
                <ShieldCheck size={16} />
              </div>
            </div>
            <div className="stat-value" style={{ color: '#10b981' }}>
              {validationData?.validationRate ?? 0}%
            </div>
            <div className="stat-label" style={{ marginTop: 4 }}>
              Passed Adversary debate & Piston Sandbox
            </div>
          </div>

          <div className="stat-card animate-fade-in animate-delay-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="stat-label" style={{ margin: 0 }}>Adversarial Failure Rate</div>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#f43f5e'
              }}>
                <AlertOctagon size={16} />
              </div>
            </div>
            <div className="stat-value" style={{ color: '#f43f5e' }}>
              {validationData?.failureRate ?? 0}%
            </div>
            <div className="stat-label" style={{ marginTop: 4 }}>
              Ambiguities caught before production
            </div>
          </div>

          <div className="stat-card animate-fade-in animate-delay-3">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="stat-label" style={{ margin: 0 }}>Total Evaluated Targets</div>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#a78bfa'
              }}>
                <Database size={16} />
              </div>
            </div>
            <div className="stat-value" style={{ color: 'var(--text-primary)' }}>
              {validationData?.total?.toLocaleString() ?? 0}
            </div>
            <div className="stat-label" style={{ marginTop: 4 }}>
              All-time questions processed
            </div>
          </div>

        </div>

        {/* Charts Split */}
        <div className="grid-2" style={{ marginBottom: 28 }}>
          
          {/* Topic Coverage Bar Chart */}
          <div className="card animate-fade-in animate-delay-4">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <BarChart3 size={16} color="var(--color-primary)" />
              <div className="card-title" style={{ margin: 0 }}>Topic Coverage Heatmap</div>
            </div>
            <div className="card-subtitle">Volume of questions generated per algorithmic topic</div>

            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topicChartData} margin={{ top: 10, right: 10, bottom: 40, left: 0 }}>
                <XAxis dataKey="topic" tick={{ fontSize: 11, fill: '#64748b' }} angle={-30} textAnchor="end" />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(13, 19, 34, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 10,
                    color: '#f8fafc',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                  }}
                />
                <Bar dataKey="count" fill="url(#topicBarGrad)" radius={[6, 6, 0, 0]} />
                <defs>
                  <linearGradient id="topicBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Difficulty Pie Chart */}
          <div className="card animate-fade-in animate-delay-5">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <PieIcon size={16} color="#06b6d4" />
              <div className="card-title" style={{ margin: 0 }}>Difficulty Distribution</div>
            </div>
            <div className="card-subtitle">Calibration balance across Easy, Medium, and Hard tiers</div>

            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={difficultyData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  innerRadius={50}
                  paddingAngle={4}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {difficultyData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="rgba(11, 16, 28, 0.8)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(13, 19, 34, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 10,
                    color: '#f8fafc',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

        </div>

        {/* Question Type Breakdown */}
        <div className="card animate-fade-in animate-delay-6">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Layers size={16} color="#a78bfa" />
            <div className="card-title" style={{ margin: 0 }}>Format & Modality Breakdown</div>
          </div>
          <div className="card-subtitle">Distribution across DSA, OOPS, SQL, System Design, and Conceptual formats</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginTop: 18 }}>
            {typeData.map((t: any) => (
              <div key={t.name} style={{
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: 'var(--radius-md)',
                padding: '18px 20px',
                border: '1px solid var(--border-light)',
                borderLeft: `4px solid ${t.color}`,
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
              }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: t.color, fontFamily: 'var(--font-display)' }}>
                  {t.value}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, fontWeight: 600 }}>
                  {t.name}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
