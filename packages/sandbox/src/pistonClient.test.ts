import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeSandbox } from './pistonClient.js';

describe('executeSandbox (Piston client)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns stdout/exitCode from a successful run', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ run: { stdout: '42\n', stderr: '', code: 0, signal: null } }),
    }) as any;

    const result = await executeSandbox({ language: 'python', version: 'latest', code: 'print(42)' });

    expect(result.stdout).toBe('42\n');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it('flags a SIGKILL run as timedOut', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ run: { stdout: '', stderr: '', code: 137, signal: 'SIGKILL' } }),
    }) as any;

    const result = await executeSandbox({ language: 'python', version: 'latest', code: 'while True: pass' });

    expect(result.timedOut).toBe(true);
  });

  it('resolves with a failure result instead of throwing when Piston is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await executeSandbox({ language: 'python', version: 'latest', code: 'print(1)' });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ECONNREFUSED');
  });

  it('caps run_timeout at 3000ms even when a longer timeout is requested', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ run: { stdout: '', stderr: '', code: 0, signal: null } }),
    });
    global.fetch = fetchMock as any;

    await executeSandbox({ language: 'python', version: 'latest', code: 'print(1)', timeoutMs: 60_000 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.run_timeout).toBe(3000);
  });
});
