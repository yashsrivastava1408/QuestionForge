import type { SandboxExecutionRequest, SandboxExecutionResult } from '@question-forge/shared';
import { logger } from '../utils/logger.js';

const PISTON_URL = process.env.PISTON_API_URL ?? 'http://localhost:2000';

// Language version map for Piston
const LANGUAGE_VERSION_MAP: Record<string, string> = {
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
  const version = (!req.version || req.version === 'latest')
    ? (LANGUAGE_VERSION_MAP[req.language] ?? '*')
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
        run_timeout: Math.min(req.timeoutMs ?? 3000, 3000),
        compile_timeout: 10_000,
        run_memory_limit: 128_000_000, // 128MB
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Piston API error: ${response.status} ${response.statusText}: ${errBody}`);
    }


    const data = await response.json() as any;
    const executionTimeMs = Date.now() - start;

    return {
      stdout: data.run?.stdout ?? '',
      stderr: data.run?.stderr ?? '',
      exitCode: data.run?.code ?? 1,
      timedOut: data.run?.signal === 'SIGKILL',
      executionTimeMs,
    };
  } catch (err: any) {
    logger.error('Sandbox execution failed', { error: err.message, language: req.language });
    return {
      stdout: '',
      stderr: err.message,
      exitCode: 1,
      timedOut: false,
      executionTimeMs: Date.now() - start,
    };
  }
}
