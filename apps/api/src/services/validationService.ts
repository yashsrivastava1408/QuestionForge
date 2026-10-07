import type { Question } from '@prisma/client';
import type {
  SandboxExecutionRequest,
  SandboxExecutionResult,
  TestCase,
  ValidationPipelineResult,
  ValidationStats,
} from '@question-forge/shared';
import pLimit from 'p-limit';
import { executeSandbox } from '@question-forge/sandbox';
import { logger } from '../utils/logger.js';
import { draftKindFor } from './questionDrafts.js';
import { z } from 'zod';
import { reviewDesign, reviewMcq, type Reviewer } from './reviewService.js';
import { completeJson, LlmOutputError } from './llmService.js';
import { buildBlindCodeSolvePrompt } from './prompts.js';

/**
 * The sandbox could not run code at all (down, unreachable, missing runtime).
 * Thrown instead of reported as a failed validation, so an outage retries the
 * job rather than telling the LLM its correct solution is wrong.
 */
export class SandboxUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxUnavailableError';
  }
}

export type SandboxExecutor = (req: SandboxExecutionRequest) => Promise<SandboxExecutionResult>;

/** Caps simultaneous sandbox calls so one validation cannot swamp a single Piston instance. */
const sandboxLimit = pLimit(Number(process.env.SANDBOX_CONCURRENCY ?? 10));

const envInt = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && process.env[name] !== undefined ? value : fallback;
};

/** Brute force must be at least this many times slower than optimal on the max-size input (or time out). */
const COMPLEXITY_GAP_RATIO = 3;
const MAX_REPORTED_PROBLEMS = 3;

/** Output comparison ignores trailing whitespace and blank lines at the ends — never content. */
export function normalizeOutput(output: string): string {
  return output.replace(/\r\n/g, '\n').split('\n').map((line) => line.trimEnd()).join('\n').trim();
}

function clip(text: string, max = 300): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}… [${t.length} chars]` : t;
}

function describeFailure(run: SandboxExecutionResult): string {
  if (run.timedOut) return 'timed out (3s limit)';
  return `exited with code ${run.exitCode}${run.stderr ? `: ${clip(run.stderr, 400)}` : ''}`;
}

export interface CodeValidationInput {
  optimalSolution: Record<string, string>;
  bruteForceSolution: Record<string, string>;
  testCases: TestCase[];
  /** Python program: stdin "<seed> <mode>" → one valid input. Optional for legacy/manual questions. */
  inputGenerator?: string | null;
  languages: string[];
  difficulty: string;
  /**
   * Re-validation of a human edit: the stated expected outputs are the reviewer's
   * intent, so any disagreement with the executed result is a failure instead of
   * being auto-corrected.
   */
  trustStatedOutputs?: boolean;
}

export interface CodeValidationOutcome {
  passed: boolean;
  details: string;
  stages: ValidationPipelineResult['stages'];
  stats: ValidationStats;
  /** Listed + generated cases with expected outputs taken from actual execution. */
  testCases: TestCase[];
}

/**
 * Differential validation of a coding problem. Nothing the LLM *claims* is
 * trusted; every expected output comes from running code:
 *
 *  1. Build inputs: the draft's listed cases + random small/edge inputs from its generator.
 *  2. Run the brute force (reference language) on all of them → the oracle outputs.
 *  3. Run the optimal solution in every language, and the brute force in the other
 *     languages; each must reproduce the oracle exactly.
 *  4. Compare the LLM's stated expected outputs with the oracle. A wrong worked
 *     example in the statement fails the draft; other mismatches are corrected.
 *  5. Run on a maximum-size input: optimal must finish in time in every language,
 *     and (MEDIUM/HARD) the brute force must be clearly slower — evidence the
 *     problem is as hard as its label.
 */
export async function validateCodeQuestion(
  input: CodeValidationInput,
  exec: SandboxExecutor = executeSandbox,
  onStage: (stage: string) => void | Promise<void> = () => {}
): Promise<CodeValidationOutcome> {
  const stages: ValidationPipelineResult['stages'] = {
    syntaxCheck: false,
    optimalSolutionPassed: false,
    bruteForcePassed: false,
    crossCheckPassed: false,
    edgeCasesPassed: false,
    complexityGapPassed: false,
  };
  const stats: ValidationStats = {
    listedCases: input.testCases.length,
    generatedCases: 0,
    sandboxRuns: 0,
    expectedOutputCorrections: 0,
    complexityGap: 'not_checked',
  };
  const fail = (details: string): CodeValidationOutcome => ({ passed: false, details, stages, stats, testCases: input.testCases });

  /**
   * One sandbox execution. A timeout is retried once by default: on a busy
   * sandbox host a correct program can occasionally miss the limit, and one
   * extra run is far cheaper than rejecting a good draft. Pass
   * `retryTimeout: false` where a timeout is an expected, meaningful result.
   */
  const run = (language: string, code: string, stdin: string, retryTimeout = true) =>
    sandboxLimit(async () => {
      for (let attempt = 0; ; attempt++) {
        stats.sandboxRuns++;
        const result = await exec({ language, version: 'latest', code, stdin });
        if (result.infraError) throw new SandboxUnavailableError(result.stderr || 'Sandbox unavailable');
        if (!result.timedOut || !retryTimeout || attempt > 0) return result;
      }
    });

  const languages = input.languages;
  const missing = languages.filter((l) => !input.optimalSolution?.[l] || !input.bruteForceSolution?.[l]);
  if (languages.length === 0 || missing.length > 0) {
    return fail(
      languages.length === 0
        ? 'No languages configured for this question.'
        : `Missing an optimal or brute-force solution for: ${missing.join(', ')}. Every requested language needs both.`
    );
  }
  const refLang = languages[0];

  // ---- 1. Inputs ----
  type Case = { input: string; label: string; origin: 'listed' | 'small' | 'edge'; stated?: string; isSample?: boolean };
  const cases: Case[] = [];
  const seen = new Set<string>();
  for (const tc of input.testCases) {
    const key = normalizeOutput(tc.input);
    if (seen.has(key)) continue;
    seen.add(key);
    cases.push({ input: tc.input, label: tc.label ?? 'Listed case', origin: 'listed', stated: tc.expectedOutput, isSample: tc.isSample });
  }

  let largeInput: string | null = null;
  if (input.inputGenerator) {
    await onStage('Sandbox: generating random inputs');
    const smallCount = envInt('VALIDATION_RANDOM_CASES', 12);
    const edgeCount = envInt('VALIDATION_EDGE_CASES', 4);
    const requests = [
      ...Array.from({ length: smallCount }, (_, i) => ({ seed: i + 1, mode: 'small' as const })),
      ...Array.from({ length: edgeCount }, (_, i) => ({ seed: i + 1, mode: 'edge' as const })),
      { seed: 1, mode: 'large' as const },
    ];
    const generated = await Promise.all(
      requests.map((r) => run('python', input.inputGenerator!, `${r.seed} ${r.mode}\n`).then((result) => ({ ...r, result })))
    );
    for (const g of generated) {
      if (g.result.exitCode !== 0 || g.result.timedOut || !g.result.stdout.trim()) {
        return fail(
          `The input generator failed for "${g.seed} ${g.mode}": ${
            g.result.stdout.trim() || g.result.exitCode !== 0 || g.result.timedOut ? describeFailure(g.result) : 'it printed nothing'
          }. It must print exactly one valid input for every seed and mode.`
        );
      }
      if (g.mode === 'large') {
        largeInput = g.result.stdout;
        continue;
      }
      const key = normalizeOutput(g.result.stdout);
      if (seen.has(key)) continue;
      seen.add(key);
      cases.push({ input: g.result.stdout, label: `Generated ${g.mode} #${g.seed}`, origin: g.mode });
    }
    stats.generatedCases = cases.filter((c) => c.origin !== 'listed').length;
  }

  if (cases.length === 0) return fail('The question has no test inputs.');

  // ---- 2. Oracle: brute force in the reference language ----
  await onStage(`Sandbox: running brute force on ${cases.length} inputs`);
  const oracleRuns = await Promise.all(cases.map((c) => run(refLang, input.bruteForceSolution[refLang], c.input)));
  stages.syntaxCheck = true;

  const oracleProblems = oracleRuns
    .map((r, i) => ({ r, c: cases[i] }))
    .filter(({ r }) => r.exitCode !== 0 || r.timedOut);
  if (oracleProblems.length > 0) {
    return fail(
      `The brute-force solution (${refLang}) failed on ${oracleProblems.length} of ${cases.length} inputs. ` +
      oracleProblems.slice(0, MAX_REPORTED_PROBLEMS)
        .map(({ r, c }) => `[${c.label}] input: ${clip(c.input)} → ${describeFailure(r)}`).join(' | ') +
      ' The brute force must be correct and fast on small inputs; check the input parsing matches the stated format.'
    );
  }
  const oracle = oracleRuns.map((r) => normalizeOutput(r.stdout));
  const emptyOracle = oracle.findIndex((o) => o === '');
  if (emptyOracle !== -1) {
    return fail(`The brute-force solution (${refLang}) printed nothing for input: ${clip(cases[emptyOracle].input)}. Solutions must print the answer to stdout.`);
  }

  // ---- 3. Every other solution must reproduce the oracle ----
  await onStage(`Sandbox: differential testing across ${languages.length} language(s)`);
  const contenders = [
    ...languages.map((lang) => ({ lang, kind: 'optimal' as const, code: input.optimalSolution[lang] })),
    ...languages.filter((l) => l !== refLang).map((lang) => ({ lang, kind: 'brute' as const, code: input.bruteForceSolution[lang] })),
  ];
  const contenderRuns = await Promise.all(
    contenders.map((s) => Promise.all(cases.map((c) => run(s.lang, s.code, c.input))))
  );

  const disagreements: string[] = [];
  let optimalOk = true;
  let bruteOk = true;
  let edgeOk = true;
  contenders.forEach((s, si) => {
    contenderRuns[si].forEach((r, ci) => {
      const c = cases[ci];
      const crashed = r.exitCode !== 0 || r.timedOut;
      if (!crashed && normalizeOutput(r.stdout) === oracle[ci]) return;
      if (s.kind === 'optimal') optimalOk = false; else bruteOk = false;
      if (c.origin === 'edge' || /edge/i.test(c.label)) edgeOk = false;
      const name = `${s.kind === 'optimal' ? 'Optimal' : 'Brute-force'} solution (${s.lang})`;
      disagreements.push(
        crashed
          ? `${name} ${describeFailure(r)} on [${c.label}] input: ${clip(c.input)}`
          : `${name} printed "${clip(r.stdout, 120)}" but the brute force (${refLang}) printed "${clip(oracle[ci], 120)}" on [${c.label}] input: ${clip(c.input)}`
      );
    });
  });
  stages.optimalSolutionPassed = optimalOk;
  stages.bruteForcePassed = bruteOk;
  stages.crossCheckPassed = optimalOk && bruteOk;
  stages.edgeCasesPassed = edgeOk;

  if (disagreements.length > 0) {
    return fail(
      `Differential testing found ${disagreements.length} disagreement(s) between solutions. ` +
      disagreements.slice(0, MAX_REPORTED_PROBLEMS).join(' | ') +
      ' Work out by hand which output is right for that input, then fix whichever solution is wrong.'
    );
  }

  // ---- 4. Stated expected outputs vs what the code actually prints ----
  const stated = cases.map((c, i) => ({ c, i })).filter(({ c }) => c.origin === 'listed' && normalizeOutput(c.stated ?? '') !== '');
  const wrongStated = stated.filter(({ c, i }) => normalizeOutput(c.stated!) !== oracle[i]);
  const describeStated = ({ c, i }: { c: Case; i: number }) =>
    `[${c.label}] input: ${clip(c.input)} — stated "${clip(c.stated!, 120)}", solutions print "${clip(oracle[i], 120)}"`;

  if (input.trustStatedOutputs && wrongStated.length > 0) {
    return fail(
      `${wrongStated.length} test case(s) have an expected output the solutions do not produce. ` +
      wrongStated.slice(0, MAX_REPORTED_PROBLEMS).map(describeStated).join(' | ')
    );
  }
  const wrongSamples = wrongStated.filter(({ c }) => c.isSample);
  if (wrongSamples.length > 0) {
    return fail(
      'A worked example in the statement disagrees with what every solution prints. ' +
      wrongSamples.slice(0, MAX_REPORTED_PROBLEMS).map(describeStated).join(' | ') +
      ' Either the example is miscalculated or the solutions solve a different problem than the statement describes. Make them consistent.'
    );
  }
  if (stated.length > 0 && wrongStated.length / stated.length > 0.25) {
    return fail(
      `${wrongStated.length} of ${stated.length} hand-written expected outputs disagree with the solutions — too many to be slips, so the solutions probably do not implement the statement. ` +
      wrongStated.slice(0, MAX_REPORTED_PROBLEMS).map(describeStated).join(' | ')
    );
  }
  stats.expectedOutputCorrections = wrongStated.length;

  const finalCases: TestCase[] = cases.map((c, i) => ({
    input: c.input,
    expectedOutput: oracle[i],
    label: c.label,
    ...(c.isSample && { isSample: true }),
    ...((c.origin === 'edge' || /edge/i.test(c.label)) && { isEdgeCase: true }),
  }));

  // ---- 5. Maximum-size input: speed of optimal, and the gap to brute force ----
  if (largeInput) {
    await onStage('Sandbox: maximum-size performance check');
    const [optimalLarge, bruteLarge] = await Promise.all([
      Promise.all(languages.map((lang) => run(lang, input.optimalSolution[lang], largeInput!))),
      // Here a timeout IS the signal we are looking for — do not retry it.
      run(refLang, input.bruteForceSolution[refLang], largeInput, false),
    ]);

    const slow = optimalLarge.map((r, i) => ({ r, lang: languages[i] })).filter(({ r }) => r.exitCode !== 0 || r.timedOut);
    if (slow.length > 0) {
      stages.optimalSolutionPassed = false;
      return {
        ...fail(
          'On the maximum-size input from the generator: ' +
          slow.map(({ r, lang }) => `optimal solution (${lang}) ${describeFailure(r)}`).join(' | ') +
          '. The optimal solution must handle the stated maximum constraints within 3 seconds in every language — lower the constraints or fix the algorithm.'
        ),
        testCases: finalCases,
      };
    }
    const largeOutputs = optimalLarge.map((r) => normalizeOutput(r.stdout));
    const divergent = languages.filter((_, i) => largeOutputs[i] !== largeOutputs[0]);
    if (divergent.length > 0) {
      stages.crossCheckPassed = false;
      return {
        ...fail(`On the maximum-size input the optimal solutions disagree with each other (${refLang} vs ${divergent.join(', ')}). Look for integer overflow or size-dependent bugs.`),
        testCases: finalCases,
      };
    }

    stats.optimalLargeMs = optimalLarge[0].executionTimeMs;
    stats.bruteLargeMs = bruteLarge.executionTimeMs;
    stats.bruteLargeTimedOut = bruteLarge.timedOut;
    const gap = bruteLarge.timedOut || bruteLarge.executionTimeMs >= COMPLEXITY_GAP_RATIO * Math.max(optimalLarge[0].executionTimeMs, 1);
    stats.complexityGap = gap ? 'confirmed' : 'not_observed';

    const enforce = process.env.VALIDATION_ENFORCE_COMPLEXITY_GAP !== 'false' && input.difficulty !== 'EASY';
    stages.complexityGapPassed = gap || !enforce;
    if (!gap && enforce) {
      return {
        ...fail(
          `Difficulty check failed: on the maximum-size input the brute force finished in ${bruteLarge.executionTimeMs}ms against ${optimalLarge[0].executionTimeMs}ms for the optimal solution — no real gap. ` +
          `A ${input.difficulty} problem must not be solvable by brute force. Raise the constraints, make the generator's "large" mode a true worst case, or pick a problem where the naive approach is asymptotically slower.`
        ),
        testCases: finalCases,
      };
    }
  } else {
    stages.complexityGapPassed = true; // nothing to measure against; stats.complexityGap stays 'not_checked'
  }

  const gapNote =
    stats.complexityGap === 'confirmed' ? ' Brute force is measurably slower at maximum size.'
    : stats.complexityGap === 'not_observed' ? ' No brute-force/optimal speed gap observed at maximum size.'
    : ' Maximum-size performance not checked (no input generator).';
  return {
    passed: true,
    details:
      `${languages.length} language(s) agree with the brute-force oracle on ${cases.length} inputs ` +
      `(${stats.listedCases} listed, ${stats.generatedCases} generated; ${stats.sandboxRuns} sandbox runs).` +
      (stats.expectedOutputCorrections > 0 ? ` ${stats.expectedOutputCorrections} hand-written expected output(s) were corrected from execution.` : '') +
      gapNote,
    stages,
    stats,
    testCases: finalCases,
  };
}

export interface BlindSolveOutcome {
  verdict: 'agreed' | 'disagreed' | 'inconclusive';
  details: string;
  sandboxRuns: number;
}

const BLIND_SOLVE_MAX_CASES = 20;

/**
 * The gap differential testing cannot close: the optimal and brute-force
 * solutions were written by the same model, so they can agree with each other
 * and still both misread the statement. Here a second model writes its own
 * solution from the STATEMENT ALONE, and that program is run on the verified
 * test cases.
 *
 *  - It reproduces every expected output → the statement really does pin down
 *    the answer the solutions compute.
 *  - It runs but prints something else → the statement and the solutions
 *    disagree, or the statement is ambiguous. The draft is rejected.
 *  - It produces nothing runnable (no code, compile error, crashes on most
 *    inputs) → that says something about the solver, not the question. The
 *    result is "inconclusive" and the draft is NOT rejected for it.
 */
export async function blindSolveCodeQuestion(
  input: { statement: string; language: string; testCases: TestCase[] },
  reviewer: Reviewer,
  exec: SandboxExecutor = executeSandbox
): Promise<BlindSolveOutcome> {
  let code: string;
  try {
    const reply = await completeJson(
      reviewer.client,
      buildBlindCodeSolvePrompt(input.statement, input.language),
      z.object({ code: z.string().min(10) }),
      reviewer.meter
    );
    code = reply.code;
  } catch (err) {
    if (!(err instanceof LlmOutputError)) throw err;
    return { verdict: 'inconclusive', details: `The independent solver did not return a program (${err.message}).`, sandboxRuns: 0 };
  }

  const cases = input.testCases.slice(0, BLIND_SOLVE_MAX_CASES);
  const runs = await Promise.all(
    cases.map((tc) =>
      sandboxLimit(async () => {
        const result = await exec({ language: input.language, version: 'latest', code, stdin: tc.input });
        if (result.infraError) throw new SandboxUnavailableError(result.stderr || 'Sandbox unavailable');
        return result;
      })
    )
  );

  const crashed = runs.filter((r) => r.exitCode !== 0 || r.timedOut).length;
  if (crashed > cases.length / 2) {
    return {
      verdict: 'inconclusive',
      details: `The independent solver's program failed to run on ${crashed} of ${cases.length} inputs, so it proves nothing either way.`,
      sandboxRuns: runs.length,
    };
  }

  const wrong = runs
    .map((r, i) => ({ r, tc: cases[i] }))
    .filter(({ r, tc }) => r.exitCode === 0 && !r.timedOut && normalizeOutput(r.stdout) !== normalizeOutput(tc.expectedOutput));
  if (wrong.length === 0) {
    return {
      verdict: 'agreed',
      details: `An independent solver given only the statement reproduced the expected output on ${cases.length - crashed} of ${cases.length} inputs.`,
      sandboxRuns: runs.length,
    };
  }
  return {
    verdict: 'disagreed',
    details:
      `An independent solver that saw ONLY the statement wrote a program that disagrees with your solutions on ${wrong.length} of ${cases.length} inputs. ` +
      wrong.slice(0, MAX_REPORTED_PROBLEMS)
        .map(({ r, tc }) => `[${tc.label ?? 'case'}] input: ${clip(tc.input)} — yours: "${clip(tc.expectedOutput, 120)}", independent: "${clip(r.stdout, 120)}"`)
        .join(' | ') +
      ' Either the statement does not fully determine the answer (state tie-breaking, indexing, output format and edge-case behaviour explicitly), or your solutions solve a different problem than the statement describes.',
    sandboxRuns: runs.length,
  };
}

export interface SqlValidationInput {
  ddl: string;
  datasets: string[];
  referenceQuery: string;
  alternativeQuery: string;
  orderMatters: boolean;
}

const terminated = (sql: string) => (sql.trim().endsWith(';') ? sql.trim() : `${sql.trim()};`);

/** sqlite3 CLI dot-commands (.shell, .system, .read…) and file access have no place in a quiz query. */
function unsafeSql(sql: string): string | null {
  if (/^\s*\./m.test(sql)) return 'sqlite dot-commands are not allowed';
  if (/\b(attach|detach)\s+database\b|\bload_extension\s*\(|\b(readfile|writefile)\s*\(/i.test(sql)) return 'file/extension access is not allowed';
  return null;
}

/**
 * SQL problems are checked by execution: both queries run against every dataset
 * in a fresh SQLite database and must return the same rows. The second,
 * differently-written query plays the role the brute force plays for code.
 */
export async function validateSqlQuestion(
  input: SqlValidationInput,
  exec: SandboxExecutor = executeSandbox,
  onStage: (stage: string) => void | Promise<void> = () => {}
): Promise<{ passed: boolean; details: string; stages: ValidationPipelineResult['stages']; sandboxRuns: number; testCases: TestCase[] }> {
  const stages: ValidationPipelineResult['stages'] = {
    syntaxCheck: false, optimalSolutionPassed: false, bruteForcePassed: false, crossCheckPassed: false, edgeCasesPassed: false,
  };
  let sandboxRuns = 0;
  const fail = (details: string) => ({ passed: false, details, stages, sandboxRuns, testCases: [] as TestCase[] });

  for (const [name, sql] of [['ddl', input.ddl], ['referenceQuery', input.referenceQuery], ['alternativeQuery', input.alternativeQuery], ...input.datasets.map((d, i) => [`datasets[${i}]`, d])] as [string, string][]) {
    const problem = unsafeSql(sql);
    if (problem) return fail(`${name}: ${problem}.`);
  }
  if (input.datasets.length < 2) return fail('At least 2 datasets are required to cross-check the queries.');

  await onStage(`Sandbox: running both queries on ${input.datasets.length} datasets`);
  const runQuery = async (dataset: string, query: string) => {
    sandboxRuns++;
    const code = [terminated(input.ddl), terminated(dataset), terminated(query)].join('\n');
    const result = await sandboxLimit(() => exec({ language: 'sqlite3', version: 'latest', code }));
    if (result.infraError) throw new SandboxUnavailableError(result.stderr || 'Sandbox unavailable');
    return result;
  };
  const results = await Promise.all(
    input.datasets.map(async (dataset) => ({
      reference: await runQuery(dataset, input.referenceQuery),
      alternative: await runQuery(dataset, input.alternativeQuery),
    }))
  );

  // sqlite3 prints errors to stderr and may still exit 0 — treat any stderr as a failure.
  const errored = (r: SandboxExecutionResult) => r.exitCode !== 0 || r.timedOut || r.stderr.trim() !== '';
  const canon = (out: string) => {
    const lines = normalizeOutput(out).split('\n');
    return (input.orderMatters ? lines : [...lines].sort()).join('\n');
  };

  const problems: string[] = [];
  let referenceOk = true;
  let alternativeOk = true;
  let agree = true;
  results.forEach(({ reference, alternative }, i) => {
    if (errored(reference)) { referenceOk = false; problems.push(`referenceQuery failed on dataset ${i + 1}: ${clip(reference.stderr || describeFailure(reference))}`); }
    if (errored(alternative)) { alternativeOk = false; problems.push(`alternativeQuery failed on dataset ${i + 1}: ${clip(alternative.stderr || describeFailure(alternative))}`); }
    if (!errored(reference) && !errored(alternative) && canon(reference.stdout) !== canon(alternative.stdout)) {
      agree = false;
      problems.push(`The two queries return different rows on dataset ${i + 1}: referenceQuery → "${clip(reference.stdout, 160)}", alternativeQuery → "${clip(alternative.stdout, 160)}"`);
    }
  });
  stages.syntaxCheck = referenceOk && alternativeOk;
  stages.optimalSolutionPassed = referenceOk;
  stages.bruteForcePassed = alternativeOk;
  stages.crossCheckPassed = referenceOk && alternativeOk && agree;
  stages.edgeCasesPassed = stages.crossCheckPassed;

  if (problems.length > 0) {
    return fail(problems.slice(0, MAX_REPORTED_PROBLEMS).join(' | ') + ' Decide which result the statement actually asks for and fix the other query (or the statement).');
  }
  if (normalizeOutput(results[0].reference.stdout) === '') {
    stages.edgeCasesPassed = false;
    return fail('The reference query returns no rows on the example dataset. The example must produce a visible result.');
  }

  return {
    passed: true,
    details: `Both queries return identical rows on all ${input.datasets.length} datasets (${sandboxRuns} SQLite runs).`,
    stages,
    sandboxRuns,
    testCases: input.datasets.map((dataset, i) => ({
      input: dataset,
      expectedOutput: normalizeOutput(results[i].reference.stdout),
      label: i === 0 ? 'Example dataset' : `Dataset ${i + 1}`,
      ...(i === 0 && { isSample: true }),
    })),
  };
}

export interface ValidationContext {
  /** Languages to execute for coding questions. */
  languages: string[];
  /** Required for MCQ-style and system-design questions. */
  reviewer?: Reviewer;
  mcqOptionsCount?: number;
  /** Coding questions: also have the reviewer model solve the problem from the statement alone. */
  blindSolve?: boolean;
  trustStatedOutputs?: boolean;
  onStage?: (stage: string) => void | Promise<void>;
}

/**
 * Validates a persisted question with the method its type allows, and reports
 * honestly which method that was (`method`). Returns verified test cases for
 * the executed types so the caller can store outputs that came from real runs.
 */
export async function runValidationPipeline(
  question: Question,
  ctx: ValidationContext
): Promise<{ result: ValidationPipelineResult; testCases?: TestCase[] }> {
  const kind = draftKindFor(question.type);
  const assets = (question.validationAssets ?? {}) as Record<string, any>;
  const onStage = ctx.onStage ?? (() => {});
  const base = { questionId: question.id, retryCount: question.retryCount };

  if (kind === 'code') {
    logger.info(`[Validation] Differential sandbox validation for Q ${question.id} (${ctx.languages.join(', ')})`);
    const outcome = await validateCodeQuestion(
      {
        optimalSolution: (question.optimalSolution ?? {}) as Record<string, string>,
        bruteForceSolution: (question.bruteForceSolution ?? {}) as Record<string, string>,
        testCases: ((question.testCases ?? []) as unknown) as TestCase[],
        inputGenerator: assets.inputGenerator,
        languages: ctx.languages,
        difficulty: question.difficulty,
        trustStatedOutputs: ctx.trustStatedOutputs,
      },
      executeSandbox,
      onStage
    );
    let passed = outcome.passed;
    let details = outcome.details;
    outcome.stats.blindSolver = 'skipped';
    if (passed && ctx.blindSolve && ctx.reviewer) {
      await onStage('Independent solver: solving from the statement alone');
      const blind = await blindSolveCodeQuestion(
        { statement: question.statement, language: ctx.languages[0], testCases: outcome.testCases },
        ctx.reviewer
      );
      outcome.stats.blindSolver = blind.verdict;
      outcome.stats.sandboxRuns += blind.sandboxRuns;
      outcome.stages.blindSolvePassed = blind.verdict !== 'disagreed';
      if (blind.verdict === 'disagreed') {
        passed = false;
        details = blind.details;
      } else {
        details = `${details} ${blind.details}`;
      }
    }
    return {
      result: {
        ...base,
        passed,
        method: 'sandbox_differential',
        stages: outcome.stages,
        crossCheckPassed: outcome.stages.crossCheckPassed,
        ...(outcome.stats.blindSolver !== 'skipped' && { crossModel: ctx.reviewer?.crossModel }),
        stats: outcome.stats,
        details,
      },
      testCases: passed ? outcome.testCases : undefined,
    };
  }

  if (kind === 'sql') {
    const outcome = await validateSqlQuestion(
      {
        ddl: assets.sqlDdl ?? '',
        datasets: assets.sqlDatasets ?? [],
        referenceQuery: (question.optimalSolution as any)?.sql ?? question.answer ?? '',
        alternativeQuery: (question.bruteForceSolution as any)?.sql ?? '',
        orderMatters: !!assets.orderMatters,
      },
      executeSandbox,
      onStage
    );
    return {
      result: {
        ...base,
        passed: outcome.passed,
        method: 'sandbox_sql',
        stages: outcome.stages,
        crossCheckPassed: outcome.stages.crossCheckPassed,
        details: outcome.details,
      },
      testCases: outcome.passed ? outcome.testCases : undefined,
    };
  }

  if (!ctx.reviewer) throw new Error(`A reviewer model is required to validate ${question.type} questions.`);
  await onStage(kind === 'mcq' ? 'Review: blind solve + adversarial review' : 'Review: adversarial rubric review');
  const review = kind === 'mcq'
    ? await reviewMcq(question, ctx.reviewer, ctx.mcqOptionsCount)
    : await reviewDesign(question, ctx.reviewer);

  // No code is executed for these types. The execution stages stay false rather
  // than being reported as passed.
  return {
    result: {
      ...base,
      passed: review.passed,
      method: 'llm_review',
      stages: {
        syntaxCheck: false,
        optimalSolutionPassed: false,
        bruteForcePassed: false,
        crossCheckPassed: false,
        edgeCasesPassed: false,
        blindSolvePassed: review.blindSolvePassed,
        adversaryDebatePassed: review.adversaryPassed,
      },
      crossCheckPassed: false,
      crossModel: ctx.reviewer.crossModel,
      details: `${ctx.reviewer.crossModel ? '[Cross-model review]' : '[Same-model review — only one LLM provider is configured]'} ${review.report}`,
    },
  };
}
