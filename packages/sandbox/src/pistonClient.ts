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
  const version = req.version === 'latest'
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
        run_timeout: req.timeoutMs ?? 10_000,
        compile_timeout: 15_000,
        run_memory_limit: 128_000_000,
      }),
    });

    if (!response.ok) throw new Error(`Piston error: ${response.status}`);
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
