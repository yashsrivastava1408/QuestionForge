/**
 * Sandbox Package
 *
 * `executeSandbox` runs untrusted, LLM-written code and returns its stdout/exit code.
 *
 * Drivers (SANDBOX_DRIVER):
 *  - `piston` (default): the Piston engine in its own Docker container, on a network
 *    with no route to Postgres. Memory limited to 128MB per run, 3s run timeout.
 *  - `local`: plain child processes on this machine — NO isolation. For development
 *    and tests only; refused when NODE_ENV=production.
 */
import type { SandboxExecutionRequest, SandboxExecutionResult } from '@question-forge/shared';
import { executeWithPiston } from './pistonClient.js';
import { executeLocally } from './localRunner.js';

export const SUPPORTED_LANGUAGES = ['python', 'java', 'cpp', 'javascript', 'typescript', 'go', 'rust', 'c'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export { MAX_RUN_TIMEOUT_MS } from './pistonClient.js';

export function sandboxDriver(): 'piston' | 'local' {
  if (process.env.SANDBOX_DRIVER !== 'local') return 'piston';
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SANDBOX_DRIVER=local runs untrusted code without isolation and is not allowed in production.');
  }
  return 'local';
}

export async function executeSandbox(req: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
  return sandboxDriver() === 'local' ? executeLocally(req) : executeWithPiston(req);
}
