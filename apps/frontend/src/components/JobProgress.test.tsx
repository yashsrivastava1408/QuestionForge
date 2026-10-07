import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import JobProgress from './JobProgress';
import { followJob, type JobStatus } from '../lib/jobStream';

const status = (overrides: Partial<JobStatus> = {}): JobStatus => ({
  jobId: 'job-1',
  kind: 'GENERATE',
  state: 'active',
  progress: 50,
  done: false,
  total: 2,
  counts: { queued: 0, running: 1, validated: 0, failed: 1 },
  items: [
    { index: 0, type: 'DSA', difficulty: 'MEDIUM', topic: 'Arrays', status: 'VALIDATING', stage: 'Sandbox: differential testing across 2 language(s)', attempts: 1, failureReason: null, questionId: 'q1', title: 'Maximum Subarray Sum' },
    { index: 1, type: 'MCQ', difficulty: 'EASY', topic: 'OOP', status: 'FAILED', stage: 'Failed validation', attempts: 3, failureReason: 'An independent solver chose B, but the key says A.', questionId: null, title: null },
  ],
  usage: { inputTokens: 1200, outputTokens: 800, costUsd: 0.0208 },
  createdAt: new Date().toISOString(),
  finishedAt: null,
  ...overrides,
});

describe('JobProgress', () => {
  it('shows each question with the step it is on and why a failed one failed', () => {
    render(<JobProgress status={status()} />);
    expect(screen.getByText('Maximum Subarray Sum')).toBeInTheDocument();
    expect(screen.getByText('Sandbox: differential testing across 2 language(s)')).toBeInTheDocument();
    expect(screen.getByText('Question 2')).toBeInTheDocument(); // no title yet → positional name
    expect(screen.getByText(/An independent solver chose B, but the key says A\./)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('shows measured tokens and cost, and omits the cost when it is unknown', () => {
    const { rerender } = render(<JobProgress status={status()} />);
    expect(screen.getByText(/2,000 tokens used · \$0\.0208/)).toBeInTheDocument();
    rerender(<JobProgress status={status({ usage: { inputTokens: 1200, outputTokens: 800, costUsd: null } })} />);
    expect(screen.getByText('2,000 tokens used')).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('shows a connecting state before the first update', () => {
    render(<JobProgress status={null} />);
    expect(screen.getByText(/Connecting to job/)).toBeInTheDocument();
  });
});

describe('followJob', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const sseResponse = (frames: object[]) => {
    const encoder = new TextEncoder();
    // Split mid-frame to prove the parser reassembles chunks.
    const text = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('');
    const cut = Math.floor(text.length / 2);
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text.slice(0, cut)));
        controller.enqueue(encoder.encode(text.slice(cut)));
        controller.close();
      },
    });
    return { ok: true, status: 200, body } as unknown as Response;
  };

  it('reads SSE frames with the token in the Authorization header, never in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([status(), status({ done: true, progress: 100, state: 'completed' })]));
    vi.stubGlobal('fetch', fetchMock);

    const seen: JobStatus[] = [];
    await new Promise<void>((resolve) => {
      followJob('job-1', 'secret-jwt', (s) => { seen.push(s); if (s.done) resolve(); });
    });

    expect(seen.map((s) => s.progress)).toEqual([50, 100]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/generate/status/job-1/stream');
    expect(url).not.toContain('secret-jwt');
    expect(init.headers.Authorization).toBe('Bearer secret-jwt');
    expect(fetchMock).toHaveBeenCalledTimes(1); // job finished on the stream → no polling
  });

  it('falls back to polling when the stream is unavailable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 502, body: null })
      .mockResolvedValueOnce({ ok: true, json: async () => status({ done: true, progress: 100, state: 'completed' }) });
    vi.stubGlobal('fetch', fetchMock);

    const final = await new Promise<JobStatus>((resolve) => {
      followJob('job-1', 't', (s) => { if (s.done) resolve(s); });
    });

    expect(final.progress).toBe(100);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/generate/status/job-1');
  });
});
