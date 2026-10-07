import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { executeLocally } from './localRunner.js';

const has = (cmd: string, arg = '--version') => spawnSync(cmd, [arg]).status === 0;

describe('executeLocally (dev/test runner, real processes)', () => {
  it.runIf(has('python3'))('runs python with stdin and captures stdout', async () => {
    const r = await executeLocally({ language: 'python', version: 'latest', code: 'print(int(input()) * 2)', stdin: '21\n' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('42');
  });

  it.runIf(has('python3'))('reports a runtime error with a non-zero exit code', async () => {
    const r = await executeLocally({ language: 'python', version: 'latest', code: 'raise SystemExit(3)' });
    expect(r.exitCode).toBe(3);
    expect(r.infraError).toBeUndefined();
  });

  it.runIf(has('python3'))('kills and flags a program that exceeds the time limit', async () => {
    const r = await executeLocally({ language: 'python', version: 'latest', code: 'while True: pass', timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).not.toBe(0);
  });

  it.runIf(has('node'))('runs javascript', async () => {
    const code = "const n = Number(require('fs').readFileSync(0, 'utf8')); console.log(n + 1);";
    const r = await executeLocally({ language: 'javascript', version: 'latest', code, stdin: '41' });
    expect(r.stdout.trim()).toBe('42');
  });

  it.runIf(has('g++'))('compiles and runs C++, and reports compile errors', async () => {
    const ok = await executeLocally({
      language: 'cpp', version: 'latest', stdin: '40 2',
      code: '#include <iostream>\nint main(){long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}',
    });
    expect(ok.stdout.trim()).toBe('42');

    const bad = await executeLocally({ language: 'cpp', version: 'latest', code: 'int main(){ return 0 ' });
    expect(bad.exitCode).not.toBe(0);
    expect(bad.stderr).toContain('Compilation failed');
  }, 60_000);

  it.runIf(has('sqlite3'))('runs a SQL script through sqlite3', async () => {
    const r = await executeLocally({
      language: 'sqlite3', version: 'latest',
      code: 'CREATE TABLE t(x INT); INSERT INTO t VALUES (1),(2),(39); SELECT SUM(x) FROM t;',
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('42');
  });

  it('flags an unsupported language as an infra error', async () => {
    const r = await executeLocally({ language: 'cobol', version: 'latest', code: '' });
    expect(r.infraError).toBe(true);
  });
});
