import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { followJob, type JobItem, type JobStatus } from '../lib/jobStream';

/** Subscribes to a job and returns its latest status (null until the first update). */
export function useJobStatus(jobId: string | null, onDone?: (status: JobStatus) => void, restartKey: unknown = 0): JobStatus | null {
  const { token } = useAuth();
  const [status, setStatus] = useState<JobStatus | null>(null);

  useEffect(() => {
    setStatus(null);
    if (!jobId) return;
    return followJob(jobId, token, (next) => {
      setStatus(next);
      if (next.done) onDone?.(next);
    });
    // onDone is intentionally not a dependency: callers pass inline functions.
  }, [jobId, token, restartKey]);

  return status;
}

const STATUS_COLOR: Record<JobItem['status'], string> = {
  QUEUED: 'var(--text-muted)',
  GENERATING: 'var(--color-warning)',
  VALIDATING: 'var(--color-primary)',
  VALIDATED: 'var(--color-success)',
  FAILED: 'var(--color-error)',
};

function ItemIcon({ status }: { status: JobItem['status'] }) {
  if (status === 'VALIDATED') return <CheckCircle2 size={16} color={STATUS_COLOR.VALIDATED} />;
  if (status === 'FAILED') return <XCircle size={16} color={STATUS_COLOR.FAILED} />;
  if (status === 'QUEUED') return <Clock size={16} color={STATUS_COLOR.QUEUED} />;
  return <Loader2 size={16} color={STATUS_COLOR[status]} style={{ animation: 'spin 1s linear infinite' }} />;
}

function itemLabel(item: JobItem): string {
  if (item.status === 'QUEUED') return 'Waiting in queue';
  if (item.status === 'VALIDATED') return 'Validated';
  if (item.status === 'FAILED') return 'Failed';
  return item.stage ?? (item.status === 'GENERATING' ? 'Drafting' : 'Validating');
}

/**
 * Live view of one job: overall progress, then one row per question showing
 * the step it is on right now and — if it failed — the validator's reason.
 */
export default function JobProgress({ status, compact = false }: { status: JobStatus | null; compact?: boolean }) {
  if (!status) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Connecting to job…
      </div>
    );
  }

  const { counts, usage } = status;
  const tokens = usage.inputTokens + usage.outputTokens;

  return (
    <div>
      {!compact && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--color-success)' }}>{counts.validated}</strong> validated
              {' · '}
              <strong style={{ color: counts.failed ? 'var(--color-error)' : 'inherit' }}>{counts.failed}</strong> failed
              {' · '}
              {counts.running} in progress · {counts.queued} queued
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {tokens.toLocaleString()} tokens used
              {usage.costUsd !== null ? ` · $${usage.costUsd.toFixed(4)}` : ''}
            </div>
          </div>
          <div style={{ height: 8, borderRadius: 6, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 16 }}>
            <div
              role="progressbar"
              aria-valuenow={status.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                height: '100%',
                width: `${status.progress}%`,
                background: 'var(--gradient-rose)',
                borderRadius: 6,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: compact ? undefined : 360, overflowY: 'auto' }}>
        {status.items.map((item) => (
          <div
            key={item.index}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-light)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ItemIcon status={item.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title ?? `Question ${item.index + 1}`}
                </div>
                <div style={{ fontSize: 12, color: STATUS_COLOR[item.status], marginTop: 2 }}>
                  {itemLabel(item)}
                </div>
              </div>
              <span className={`badge badge-${item.difficulty.toLowerCase()}`}>{item.difficulty}</span>
              <span className={`badge badge-${item.type.toLowerCase()}`}>{item.type}</span>
            </div>
            {item.status === 'FAILED' && item.failureReason && (
              <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                <strong style={{ color: 'var(--color-error)' }}>Why: </strong>
                {item.failureReason}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
