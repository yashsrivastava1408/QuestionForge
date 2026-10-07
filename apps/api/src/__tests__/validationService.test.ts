/**
 * These tests execute real programs through the local runner — nothing is
 * mocked. They are the proof that "validated" means the code actually ran.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { executeLocally } from '../../../../packages/sandbox/src/localRunner.js';
import { validateCodeQuestion, validateSqlQuestion, blindSolveCodeQuestion, normalizeOutput, SandboxUnavailableError } from '../services/validationService.js';
import { UsageMeter, type LLMClient } from '../services/llmService.js';
import { STATEMENT } from './fixtures/maxSubarray.js';
import { OPTIMAL, BRUTE, BUGGY_OPTIMAL_PYTHON, GENERATOR, WEAK_GENERATOR, TEST_CASES } from './fixtures/maxSubarray.js';

const has = (cmd: string, arg = '--version') => spawnSync(cmd, [arg]).status === 0;
const hasPython = has('python3');
const allLangs = ['python', 'javascript', 'cpp', 'java'].filter((l) =>
  l === 'python' ? hasPython : l === 'javascript' ? has('node') : l === 'cpp' ? has('g++') : has('javac', '-version')
);

const base = {
  optimalSolution: OPTIMAL,
  bruteForceSolution: BRUTE,
  testCases: TEST_CASES,
  inputGenerator: GENERATOR,
  languages: ['python'],
  difficulty: 'MEDIUM',
};

describe.runIf(hasPython)('validateCodeQuestion — real execution', () => {
  it('passes a correct problem and confirms the brute force is slower at max size', async () => {
    const stages: string[] = [];
    const out = await validateCodeQuestion(base, executeLocally, (s) => { stages.push(s); });

    expect(out.details).toMatch(/agree with the brute-force oracle/);
    expect(out.passed).toBe(true);
    expect(out.stages).toMatchObject({
      syntaxCheck: true, optimalSolutionPassed: true, bruteForcePassed: true,
      crossCheckPassed: true, edgeCasesPassed: true, complexityGapPassed: true,
    });
    expect(out.stats.generatedCases).toBeGreaterThan(5);
    expect(out.stats.complexityGap).toBe('confirmed');
    expect(out.stats.bruteLargeTimedOut).toBe(true);
    // Stored cases include generated ones, each with an executed (non-empty) expected output.
    expect(out.testCases.length).toBe(out.stats.listedCases + out.stats.generatedCases);
    expect(out.testCases.every((tc) => tc.expectedOutput !== '')).toBe(true);
    expect(stages.some((s) => /differential/i.test(s))).toBe(true);
  }, 60_000);

  it.runIf(allLangs.length > 1)(`cross-checks every language (${allLangs.join(', ')})`, async () => {
    const out = await validateCodeQuestion({ ...base, languages: allLangs }, executeLocally);
    expect(out.details).toMatch(/agree with the brute-force oracle/);
    expect(out.passed).toBe(true);
  }, 180_000);

  it('rejects an optimal solution with a real bug and names the failing input', async () => {
    const out = await validateCodeQuestion(
      { ...base, optimalSolution: { python: BUGGY_OPTIMAL_PYTHON } },
      executeLocally
    );
    expect(out.passed).toBe(false);
    expect(out.stages.optimalSolutionPassed).toBe(false);
    expect(out.stages.crossCheckPassed).toBe(false);
    expect(out.details).toMatch(/Optimal solution \(python\) printed "0"/);
  }, 60_000);

  it('catches a bug that the hand-written cases miss, using generated inputs', async () => {
    // Only positive listed cases: the buggy solution passes all of them.
    const out = await validateCodeQuestion(
      {
        ...base,
        optimalSolution: { python: BUGGY_OPTIMAL_PYTHON },
        testCases: TEST_CASES.filter((tc) => !/negative/.test(tc.label)),
      },
      executeLocally
    );
    expect(out.passed).toBe(false);
    expect(out.details).toMatch(/Generated (small|edge)/);
  }, 60_000);

  it('rejects a draft whose worked example is miscalculated', async () => {
    const wrongSample = TEST_CASES.map((tc) => (tc.isSample ? { ...tc, expectedOutput: '8' } : tc));
    const out = await validateCodeQuestion({ ...base, testCases: wrongSample }, executeLocally);
    expect(out.passed).toBe(false);
    expect(out.details).toMatch(/worked example in the statement disagrees/);
  }, 60_000);

  it('corrects a wrong non-example expected output from execution instead of trusting the LLM', async () => {
    const oneSlip = TEST_CASES.map((tc) => (tc.label === 'alternating' ? { ...tc, expectedOutput: '11' } : tc));
    const out = await validateCodeQuestion({ ...base, testCases: oneSlip }, executeLocally);
    expect(out.passed).toBe(true);
    expect(out.stats.expectedOutputCorrections).toBe(1);
    expect(out.testCases.find((tc) => tc.label === 'alternating')?.expectedOutput).toBe('10');
  }, 60_000);

  it('treats stated outputs as authoritative when re-validating a human edit', async () => {
    const edited = TEST_CASES.map((tc) => (tc.label === 'alternating' ? { ...tc, expectedOutput: '11' } : tc));
    const out = await validateCodeQuestion({ ...base, testCases: edited, trustStatedOutputs: true }, executeLocally);
    expect(out.passed).toBe(false);
    expect(out.details).toMatch(/expected output the solutions do not produce/);
  }, 60_000);

  it('fails the difficulty check when brute force is as fast as optimal at "max" size', async () => {
    const out = await validateCodeQuestion({ ...base, inputGenerator: WEAK_GENERATOR }, executeLocally);
    expect(out.passed).toBe(false);
    expect(out.stats.complexityGap).toBe('not_observed');
    expect(out.details).toMatch(/Difficulty check failed/);
  }, 60_000);

  it('does not enforce the speed gap for EASY problems', async () => {
    const out = await validateCodeQuestion({ ...base, inputGenerator: WEAK_GENERATOR, difficulty: 'EASY' }, executeLocally);
    expect(out.passed).toBe(true);
    expect(out.stats.complexityGap).toBe('not_observed');
  }, 60_000);

  it('rejects solutions that print nothing (bare functions with no I/O)', async () => {
    const bare = 'def solution(a):\n    return max(a)\n';
    const out = await validateCodeQuestion(
      { ...base, optimalSolution: { python: bare }, bruteForceSolution: { python: bare }, inputGenerator: null },
      executeLocally
    );
    expect(out.passed).toBe(false);
    expect(out.details).toMatch(/printed nothing/);
  }, 60_000);

  it('rejects a draft that lacks a solution for a requested language', async () => {
    const out = await validateCodeQuestion({ ...base, languages: ['python', 'rust'] }, executeLocally);
    expect(out.passed).toBe(false);
    expect(out.details).toMatch(/Missing an optimal or brute-force solution for: rust/);
  });

  it('retries a timed-out run once, so a momentarily busy sandbox does not fail a good draft', async () => {
    let hiccups = 0;
    const flaky: typeof executeLocally = async (req) => {
      // The very first execution "times out" once, as it would on an overloaded host.
      if (hiccups === 0) {
        hiccups++;
        return { stdout: '', stderr: '', exitCode: 137, timedOut: true, executionTimeMs: 3000 };
      }
      return executeLocally(req);
    };
    const out = await validateCodeQuestion({ ...base, difficulty: 'EASY' }, flaky);
    expect(hiccups).toBe(1);
    expect(out.passed).toBe(true);
  }, 60_000);

  it('still fails a solution that times out every time (a real infinite loop)', async () => {
    const out = await validateCodeQuestion(
      { ...base, bruteForceSolution: { python: 'while True:\n    pass\n' }, inputGenerator: null, testCases: TEST_CASES.slice(0, 1) },
      executeLocally
    );
    expect(out.passed).toBe(false);
    expect(out.details).toMatch(/timed out/);
  }, 60_000);

  it('raises SandboxUnavailableError on an outage instead of blaming the question', async () => {
    const down = async () => ({ stdout: '', stderr: 'Piston unreachable', exitCode: 1, timedOut: false, executionTimeMs: 1, infraError: true });
    await expect(validateCodeQuestion(base, down)).rejects.toBeInstanceOf(SandboxUnavailableError);
  });
});

describe.runIf(has('sqlite3'))('validateSqlQuestion — real SQLite execution', () => {
  const sql = {
    ddl: 'CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, dept TEXT, salary INTEGER);',
    datasets: [
      "INSERT INTO employees VALUES (1,'Ann','eng',120),(2,'Bob','eng',100),(3,'Cy','ops',90),(4,'Di','ops',95);",
      "INSERT INTO employees VALUES (1,'Ann','eng',100),(2,'Bob','eng',100),(3,'Cy','ops',NULL);",
      "INSERT INTO employees VALUES (1,'Solo','hr',50);",
    ],
    referenceQuery: 'SELECT dept, MAX(salary) FROM employees GROUP BY dept',
    alternativeQuery:
      'SELECT DISTINCT e.dept, e.salary FROM employees e WHERE NOT EXISTS (SELECT 1 FROM employees o WHERE o.dept = e.dept AND o.salary > e.salary) AND (e.salary IS NOT NULL OR NOT EXISTS (SELECT 1 FROM employees o WHERE o.dept = e.dept AND o.salary IS NOT NULL))',
    orderMatters: false,
  };

  it('passes when two differently-written queries agree on every dataset', async () => {
    const out = await validateSqlQuestion(sql, executeLocally);
    expect(out.details).toMatch(/identical rows on all 3 datasets/);
    expect(out.passed).toBe(true);
    expect(out.testCases[0].expectedOutput).toBe('eng|120\nops|95');
  });

  it('fails when the queries disagree on an edge-case dataset (ties)', async () => {
    const out = await validateSqlQuestion(
      { ...sql, alternativeQuery: 'SELECT dept, salary FROM employees e WHERE salary = (SELECT MAX(salary) FROM employees o WHERE o.dept = e.dept)' },
      executeLocally
    );
    expect(out.passed).toBe(false);
    expect(out.details).toMatch(/different rows on dataset 2/);
  });

  it('fails on a query with a syntax error', async () => {
    const out = await validateSqlQuestion({ ...sql, referenceQuery: 'SELEC dept FROM employees' }, executeLocally);
    expect(out.passed).toBe(false);
    expect(out.details).toMatch(/referenceQuery failed/);
  });

  it('refuses sqlite dot-commands before anything is executed', async () => {
    const out = await validateSqlQuestion({ ...sql, referenceQuery: '.shell echo pwned' }, executeLocally);
    expect(out.passed).toBe(false);
    expect(out.sandboxRuns).toBe(0);
    expect(out.details).toMatch(/dot-commands are not allowed/);
  });
});

describe.runIf(hasPython)('blindSolveCodeQuestion — independent solver, real execution', () => {
  const reviewerReturning = (text: string) => {
    const prompts: string[] = [];
    const client: LLMClient = {
      provider: 'openai',
      model: 'fake',
      async complete(prompt) {
        prompts.push(prompt);
        return { text, usage: { inputTokens: 10, outputTokens: 10 } };
      },
    };
    return { reviewer: { client, crossModel: true, meter: new UsageMeter() }, prompts };
  };
  const verified = TEST_CASES; // their expected outputs are correct
  const input = { statement: STATEMENT, language: 'python', testCases: verified };

  it('agrees when a solver working from the statement alone reproduces every output', async () => {
    const { reviewer, prompts } = reviewerReturning(JSON.stringify({ code: OPTIMAL.python }));
    const out = await blindSolveCodeQuestion(input, reviewer, executeLocally);
    expect(out.verdict).toBe('agreed');
    expect(out.sandboxRuns).toBe(verified.length);
    // The solver is shown the statement and nothing else.
    expect(prompts[0]).toContain('largest sum of any non-empty contiguous subarray');
    expect(prompts[0]).not.toContain('def main');
    expect(prompts[0]).not.toContain('expectedOutput');
  }, 60_000);

  it('disagrees — and says on which input — when the statement can be read another way', async () => {
    // A solver that read "subarray" as allowing the empty one: prints 0 for all-negative input.
    const { reviewer } = reviewerReturning(JSON.stringify({ code: BUGGY_OPTIMAL_PYTHON }));
    const out = await blindSolveCodeQuestion(input, reviewer, executeLocally);
    expect(out.verdict).toBe('disagreed');
    expect(out.details).toMatch(/saw ONLY the statement/);
    expect(out.details).toMatch(/yours: "-5", independent: "0"/);
  }, 60_000);

  it('is inconclusive, not a failure, when the solver returns no usable program', async () => {
    const { reviewer } = reviewerReturning('Sorry, I cannot help with that.');
    const out = await blindSolveCodeQuestion(input, reviewer, executeLocally);
    expect(out.verdict).toBe('inconclusive');
    expect(out.sandboxRuns).toBe(0);
  });

  it('is inconclusive when the solver\'s program does not even run', async () => {
    const { reviewer } = reviewerReturning(JSON.stringify({ code: 'this is not python at all (((' }));
    const out = await blindSolveCodeQuestion(input, reviewer, executeLocally);
    expect(out.verdict).toBe('inconclusive');
  }, 60_000);
});

describe('normalizeOutput', () => {
  it('ignores trailing whitespace but not content', () => {
    expect(normalizeOutput('1 2 \r\n3\n\n')).toBe('1 2\n3');
    expect(normalizeOutput('1  2')).not.toBe(normalizeOutput('1 2'));
  });
});
