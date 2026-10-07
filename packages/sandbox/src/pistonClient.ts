import type { SandboxExecutionRequest, SandboxExecutionResult } from '@question-forge/shared';

const PISTON_URL = process.env.PISTON_API_URL ?? 'http://localhost:2000';

// Languages not listed here (e.g. sqlite3, used for SQL questions) run on whatever
// version the Piston instance has installed ('*').
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

/** Hard ceiling for a single run; a test case must never stall a batch of parallel executions. */
export const MAX_RUN_TIMEOUT_MS = 3000;

function infraFailure(message: string, start: number): SandboxExecutionResult {
  return {
    stdout: '',
    stderr: message,
    exitCode: 1,
    timedOut: false,
    executionTimeMs: Date.now() - start,
    infraError: true,
  };
}

export async function executeWithPiston(req: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
  const version = !req.version || req.version === 'latest'
    ? (LANGUAGE_VERSIONS[req.language] ?? '*')
    : req.version;
  const start = Date.now();

  let data: any;
  try {
    const response = await fetch(`${PISTON_URL}/api/v2/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: req.language,
        version,
        files: [{ content: req.code }],
        stdin: req.stdin ?? '',
        run_timeout: Math.min(req.timeoutMs ?? MAX_RUN_TIMEOUT_MS, MAX_RUN_TIMEOUT_MS),
        compile_timeout: 10_000,
        run_memory_limit: 128_000_000,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      return infraFailure(`Piston API error: ${response.status} ${response.statusText}: ${errBody}`, start);
    }
    data = await response.json();
  } catch (err: any) {
    return infraFailure(`Piston unreachable: ${err.message}`, start);
  }

  // A failed compile never reaches the run stage — surface the compiler output
  // so the generator gets a useful error to fix instead of an empty stderr.
  if (data.compile && data.compile.code !== 0 && data.compile.code !== undefined) {
    return {
      stdout: '',
      stderr: `Compilation failed:\n${data.compile.stderr || data.compile.output || ''}`,
      exitCode: data.compile.code ?? 1,
      timedOut: false,
      executionTimeMs: Date.now() - start,
    };
  }

  return {
    stdout: data.run?.stdout ?? '',
    stderr: data.run?.stderr ?? '',
    exitCode: data.run?.code ?? 1,
    timedOut: data.run?.signal === 'SIGKILL',
    executionTimeMs: Date.now() - start,
  };
}
