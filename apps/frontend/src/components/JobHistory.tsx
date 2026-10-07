import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { History } from 'lucide-react';

interface JobRow {
  id: string;
  kind: 'GENERATE' | 'COMPLETE_IMPORT' | 'REVALIDATE';
  total: number;
  validated: number;
  failed: number;
  createdAt: string;
  finishedAt: string | null;
  cancelledAt: string | null;
  inputTokens: number;
  outputTokens: number;
  llmProvider: string | null;
  questionTypes: string[] | null;
}

const KIND_LABEL: Record<JobRow['kind'], string> = {
  GENERATE: 'Generation',
  COMPLETE_IMPORT: 'Import completion',
  REVALIDATE: 'Re-validation',
};

function jobState(job: JobRow): { label: string; color: string } {
  if (!job.finishedAt) return { label: 'Running', color: 'var(--color-primary)' };
  if (job.cancelledAt) return { label: 'Cancelled', color: 'var(--text-muted)' };
  if (job.validated === 0) return { label: 'Failed', color: 'var(--color-error)' };
  if (job.failed > 0) return { label: 'Partly failed', color: 'var(--color-warning)' };
  return { label: 'Done', color: 'var(--color-success)' };
}

/** The organization's 20 most recent jobs. Selecting one opens its per-question view. */
export default function JobHistory({ activeJobId, onSelect, refreshKey }: { activeJobId: string | null; onSelect: (jobId: string) => void; refreshKey?: unknown }) {
  const { data } = useQuery({
    queryKey: ['generation-jobs', refreshKey],
    queryFn: () => axios.get('/api/generate/jobs').then((r) => r.data.jobs as JobRow[]),
    refetchInterval: 15000,
    staleTime: 0,
  });
  const jobs = data ?? [];

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="card-title">
        <History size={16} style={{ display: 'inline', marginRight: 8 }} />
        Recent Jobs
      </div>
      {jobs.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No jobs yet. Jobs you start will be listed here.</div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Started</th><th>Kind</th><th>Result</th><th>Validated</th><th>Tokens</th><th /></tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const state = jobState(job);
                return (
                  <tr key={job.id} style={{ background: job.id === activeJobId ? 'rgba(244,63,94,0.06)' : undefined }}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(job.createdAt).toLocaleString()}</td>
                    <td style={{ fontSize: 13 }}>
                      {KIND_LABEL[job.kind]}
                      {job.questionTypes && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · {job.questionTypes.join(', ')}</span>}
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: state.color }}>{state.label}</td>
                    <td style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{job.validated} / {job.total}</td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {(job.inputTokens + job.outputTokens).toLocaleString()}
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => onSelect(job.id)} disabled={job.id === activeJobId}>
                        {job.id === activeJobId ? 'Showing' : 'View'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
