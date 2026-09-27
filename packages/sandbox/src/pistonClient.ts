import type { SandboxExecutionRequest, SandboxExecutionResult } from '@question-forge/shared';

const PISTON_URL = process.env.PISTON_API_URL ?? 'http://localhost:2000';

const LANGUAGE_VERSIONS: Record<string, string> = {
  python: '3.10.0',
  java: '15.0.2',
  cpp: '10.2.0',
  javascript: '18.15.0',
  typescript: '5.0.3',
  go: '1.16.2',
  rust: '1.50.0',
  c: '10.2.0',
};

export async function executeSandbox(req: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
  const version = !req.version || req.version === 'latest'
    ? (LANGUAGE_VERSIONS[req.language] ?? '*')
    : req.version;
  const start = Date.now();

  try {
    const response = await fetch(`${PISTON_URL}/api/v2/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: req.language,
        version,
        files: [{ content: req.code }],
        stdin: req.stdin ?? '',
        // Capped at 3s regardless of the caller's request — a single test case should
        // never be allowed to stall a batch of otherwise-parallel sandbox executions.
        run_timeout: Math.min(req.timeoutMs ?? 3000, 3000),
        compile_timeout: 10_000,
        run_memory_limit: 128_000_000,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Piston API error: ${response.status} ${response.statusText}: ${errBody}`);
    }

    const data = await response.json() as any;

    return {
      stdout: data.run?.stdout ?? '',
      stderr: data.run?.stderr ?? '',
      exitCode: data.run?.code ?? 1,
      timedOut: data.run?.signal === 'SIGKILL',
      executionTimeMs: Date.now() - start,
    };
  } catch (err: any) {
    return { stdout: '', stderr: err.message, exitCode: 1, timedOut: false, executionTimeMs: Date.now() - start };
  }
}
