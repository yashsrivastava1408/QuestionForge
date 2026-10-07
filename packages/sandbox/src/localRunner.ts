/**
 * Local process runner — DEVELOPMENT AND TESTS ONLY.
 *
 * Runs code as a plain child process on this machine using whatever toolchains
 * are installed (python3, node, g++, java, sqlite3). There is NO isolation: the
 * code can read your files and use the network. It exists so the validation
 * engine can be exercised end-to-end without Docker/Piston. `executeSandbox`
 * refuses to select it when NODE_ENV=production.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SandboxExecutionRequest, SandboxExecutionResult } from '@question-forge/shared';
import { MAX_RUN_TIMEOUT_MS } from './pistonClient.js';

const WORK_ROOT = path.join(tmpdir(), 'question-forge-local-sandbox');
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const COMPILE_TIMEOUT_MS = 30_000;

interface ProcResult {
  stdout: string;
  stderr: string;
  code: number;
  timedOut: boolean;
  spawnError: boolean;
}

function run(cmd: string, args: string[], stdin: string, timeoutMs: number, cwd: string): Promise<ProcResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const finish = (result: ProcResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.stdout.on('data', (d) => { if (stdout.length < MAX_OUTPUT_BYTES) stdout += d; });
    child.stderr.on('data', (d) => { if (stderr.length < MAX_OUTPUT_BYTES) stderr += d; });
    child.on('error', (err) => finish({ stdout, stderr: err.message, code: 1, timedOut: false, spawnError: true }));
    child.on('close', (code) => finish({ stdout, stderr, code: code ?? 1, timedOut, spawnError: false }));

    child.stdin.on('error', () => {}); // program may exit before reading all of stdin
    child.stdin.end(stdin);
  });
}

/** Compiled artifacts are cached by source hash so N test cases compile once, not N times. */
const compileCache = new Map<string, Promise<ProcResult | null>>();
const sourceCache = new Map<string, Promise<void>>();

async function exists(p: string): Promise<boolean> {
  return access(p).then(() => true, () => false);
}

export async function executeLocally(req: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
  const start = Date.now();
  const timeoutMs = Math.min(req.timeoutMs ?? MAX_RUN_TIMEOUT_MS, MAX_RUN_TIMEOUT_MS);
  const hash = createHash('sha256').update(`${req.language}\n${req.code}`).digest('hex').slice(0, 24);
  const dir = path.join(WORK_ROOT, hash);
  await mkdir(dir, { recursive: true });
  const stdin = req.stdin ?? '';

  const done = (r: ProcResult, prefix = ''): SandboxExecutionResult => ({
    stdout: r.stdout,
    stderr: prefix + r.stderr,
    exitCode: r.timedOut ? 137 : r.code,
    timedOut: r.timedOut,
    executionTimeMs: Date.now() - start,
    ...(r.spawnError ? { infraError: true } : {}),
  });

  /** Runs `compile` once per source hash; resolves null on success or the failed compile result. */
  const compileOnce = (artifact: string, compile: () => Promise<ProcResult>) => {
    let pending = compileCache.get(hash);
    if (!pending) {
      pending = (async () => {
        if (await exists(artifact)) return null;
        const result = await compile();
        return result.code === 0 && !result.timedOut ? null : result;
      })();
      compileCache.set(hash, pending);
    }
    return pending;
  };

  /**
   * Parallel runs of the same source share one file. Writing it once per process
   * matters: a second writeFile would truncate the file while another run's
   * interpreter is reading it, which shows up as a program that "prints nothing".
   */
  const writeOnce = (file: string) => {
    let pending = sourceCache.get(file);
    if (!pending) {
      pending = writeFile(file, req.code);
      sourceCache.set(file, pending);
    }
    return pending;
  };

  switch (req.language) {
    case 'python': {
      const file = path.join(dir, 'main.py');
      await writeOnce(file);
      return done(await run('python3', [file], stdin, timeoutMs, dir));
    }
    case 'javascript': {
      const file = path.join(dir, 'main.js');
      await writeOnce(file);
      return done(await run('node', [file], stdin, timeoutMs, dir));
    }
    case 'cpp': {
      const src = path.join(dir, 'main.cpp');
      const bin = path.join(dir, 'main.out');
      const failed = await compileOnce(bin, async () => {
        await writeFile(src, req.code);
        return run('g++', ['-std=c++17', '-O2', '-o', bin, src], '', COMPILE_TIMEOUT_MS, dir);
      });
      if (failed) return done(failed, 'Compilation failed:\n');
      return done(await run(bin, [], stdin, timeoutMs, dir));
    }
    case 'java': {
      // Mirrors Piston: single-file source, any class name. Compile to a jar-less
      // class dir once, then find the class that declares main().
      const src = path.join(dir, 'Main.java');
      const marker = path.join(dir, '.compiled');
      const failed = await compileOnce(marker, async () => {
        await writeFile(src, req.code);
        const r = await run('javac', ['-d', dir, src], '', COMPILE_TIMEOUT_MS, dir);
        if (r.code === 0) await writeFile(marker, '');
        return r;
      });
      if (failed) return done(failed, 'Compilation failed:\n');
      const mainClass = /public\s+(?:final\s+)?class\s+(\w+)/.exec(req.code)?.[1]
        ?? /class\s+(\w+)[^{]*\{[\s\S]*?static\s+void\s+main/.exec(req.code)?.[1]
        ?? 'Main';
      // JVM startup is slow on a cold machine; give it headroom the real sandbox does not need.
      return done(await run('java', ['-cp', dir, '-Xss64m', mainClass], stdin, timeoutMs + 1500, dir));
    }
    case 'sqlite3': {
      // Piston's sqlite3 runtime executes the file as a script; stdin is unused.
      return done(await run('sqlite3', [':memory:'], req.code, timeoutMs, dir));
    }
    default:
      return {
        stdout: '',
        stderr: `Local runner has no toolchain for language '${req.language}'.`,
        exitCode: 1,
        timedOut: false,
        executionTimeMs: Date.now() - start,
        infraError: true,
      };
  }
}
