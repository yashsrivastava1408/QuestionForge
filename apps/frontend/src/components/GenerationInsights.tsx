import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Activity } from 'lucide-react';

interface Insights {
  days: number;
  totals: { requested: number; validated: number; failed: number; passRate: number | null; costUsd: number | null; costPerValidatedUsd: number | null };
  byType: { type: string; total: number; validated: number; failed: number; passRate: number; avgAttempts: number }[];
  byProvider: { provider: string; inputTokens: number; outputTokens: number; costUsd: number | null }[];
  failureReasons: { reason: string; count: number }[];
  humanReview: { approved: number; rejected: number };
}

const money = (value: number | null) => (value === null ? 'unknown' : `$${value.toFixed(value < 1 ? 4 : 2)}`);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ flex: '1 1 150px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)', marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/**
 * How generation is actually going: pass rate and attempts per question type,
 * measured spend, and the reasons questions fail. Everything here is counted
 * from finished jobs — nothing is estimated.
 */
export default function GenerationInsights() {
  const [days, setDays] = useState(30);
  const { data } = useQuery({
    queryKey: ['generation-insights', days],
    queryFn: () => axios.get(`/api/analytics/generation?days=${days}`).then((r) => r.data as Insights),
  });

  const failures = data?.failureReasons ?? [];
  const maxFailures = Math.max(1, ...failures.map((f) => f.count));
  const reviewed = (data?.humanReview.approved ?? 0) + (data?.humanReview.rejected ?? 0);

  return (
    <div className="card animate-fade-in" style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div className="card-title" style={{ margin: 0 }}>
          <Activity size={16} style={{ display: 'inline', marginRight: 8 }} />
          Generation Results
        </div>
        <select className="form-select" aria-label="Period" style={{ width: 150 }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {!data || data.totals.requested === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No finished generation jobs in this period.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <Stat label="Pass rate" value={`${data.totals.passRate}%`} hint={`${data.totals.validated} of ${data.totals.requested} requested`} />
            <Stat label="Spend" value={money(data.totals.costUsd)} hint="measured tokens × price" />
            <Stat label="Cost per validated question" value={money(data.totals.costPerValidatedUsd)} hint="includes the failed attempts" />
            <Stat
              label="Human approval"
              value={reviewed ? `${Math.round((data.humanReview.approved / reviewed) * 100)}%` : '—'}
              hint={`${data.humanReview.approved} approved · ${data.humanReview.rejected} rejected`}
            />
          </div>

          <div className="table-wrapper" style={{ marginBottom: 20 }}>
            <table>
              <thead><tr><th>Type</th><th>Requested</th><th>Validated</th><th>Failed</th><th>Pass rate</th><th>Avg. attempts</th></tr></thead>
              <tbody>
                {data.byType.map((row) => (
                  <tr key={row.type}>
                    <td><span className={`badge badge-${row.type.toLowerCase()}`}>{row.type}</span></td>
                    <td>{row.total}</td>
                    <td style={{ color: 'var(--color-success)' }}>{row.validated}</td>
                    <td style={{ color: row.failed ? 'var(--color-error)' : undefined }}>{row.failed}</td>
                    <td style={{ fontWeight: 600 }}>{row.passRate}%</td>
                    <td>{row.avgAttempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {failures.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
                Why questions failed
              </div>
              {failures.map((f) => (
                <div key={f.reason} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                    <span>{f.reason}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{f.count}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ height: '100%', width: `${(f.count / maxFailures) * 100}%`, borderRadius: 4, background: 'var(--color-error)', opacity: 0.7 }} />
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
