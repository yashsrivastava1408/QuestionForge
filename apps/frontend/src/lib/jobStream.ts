export type ItemStatus = 'QUEUED' | 'GENERATING' | 'VALIDATING' | 'VALIDATED' | 'FAILED';

export interface JobItem {
  index: number;
  type: string;
  difficulty: string;
  topic: string | null;
  status: ItemStatus;
  stage: string | null;
  attempts: number;
  failureReason: string | null;
  questionId: string | null;
  title: string | null;
}

export interface JobStatus {
  jobId: string;
  kind: 'GENERATE' | 'COMPLETE_IMPORT' | 'REVALIDATE';
  state: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  done: boolean;
  total: number;
  counts: { queued: number; running: number; validated: number; failed: number };
  items: JobItem[];
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null };
  createdAt: string;
  finishedAt: string | null;
  cancelledAt?: string | null;
}

/**
 * Follows a generation job over Server-Sent Events.
 *
 * Uses fetch() instead of EventSource because EventSource cannot send an
 * Authorization header — and the alternative, putting the JWT in the URL,
 * leaks it into server logs and browser history. If the stream drops before
 * the job is done, it falls back to polling the status endpoint.
 *
 * Returns a function that stops following the job.
 */
export function followJob(jobId: string, token: string | null, onStatus: (status: JobStatus) => void): () => void {
  const controller = new AbortController();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  let finished = false;

  const handle = (status: JobStatus) => {
    if (status.done) finished = true;
    onStatus(status);
  };

  const poll = async () => {
    while (!finished && !controller.signal.aborted) {
      try {
        const res = await fetch(`/api/generate/status/${jobId}`, { headers, signal: controller.signal });
        if (res.ok) handle(await res.json());
      } catch {
        // network blip — keep trying until aborted
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  };

  (async () => {
    try {
      const res = await fetch(`/api/generate/status/${jobId}/stream`, { headers, signal: controller.signal });
      if (!res.ok || !res.body) throw new Error(`stream unavailable (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('');
          if (data) handle(JSON.parse(data));
        }
      }
    } catch {
      // fall through to polling
    }
    if (!finished && !controller.signal.aborted) await poll();
  })();

  return () => controller.abort();
}
