import type { Question } from '@prisma/client';
import type { GenerationWizardConfig, ValidationPipelineResult } from '@question-forge/shared';
import pLimit from 'p-limit';
import { logger } from '../utils/logger.js';
import { executeSandbox } from './sandboxService.js';
import { runAdversarialDebate } from './agentDebateService.js';
import { injectEdgeCases } from './edgeCaseService.js';

/**
 * Sandbox concurrency limiter.
 * Caps simultaneous Piston calls at 10 to avoid overloading a single Piston
 * instance while still running test cases in parallel (massive speedup vs
 * the old sequential for-loop approach).
 * Tune via SANDBOX_CONCURRENCY env var.
 */
const sandboxLimit = pLimit(Number(process.env.SANDBOX_CONCURRENCY ?? 10));

export async function runValidationPipeline(
  question: Question,
  config: GenerationWizardConfig
): Promise<ValidationPipelineResult> {
  const result: ValidationPipelineResult = {
    questionId: question.id,
    passed: false,
    stages: {
      syntaxCheck: false,
      optimalSolutionPassed: false,
      bruteForcePassed: false,
      crossCheckPassed: false,
      edgeCasesPassed: false,
    },
    details: '',
    retryCount: question.retryCount,
  };

  if (question.type === 'DSA') {
    return await _validateDSA(question, config, result);
  } else {
    return await _validateConceptual(question, config, result);
  }
}

async function _validateDSA(
  question: Question,
  config: GenerationWizardConfig,
  result: ValidationPipelineResult
): Promise<ValidationPipelineResult> {
  const testCases = (question.testCases as any[]) ?? [];
  const optimalSolution = (question.optimalSolution as any) ?? {};
  const bruteForceSolution = (question.bruteForceSolution as any) ?? {};
  const languages = (question.languages as string[]) ?? config.languages;

  // Inject edge cases
  const enrichedTestCases = injectEdgeCases(testCases, question.topic);
  logger.info(
    `[Validation] Running ${enrichedTestCases.length} test cases × ${languages.length} languages for Q: ${question.id} (parallel)`
  );

  // Build all execution tasks upfront for all language × testCase combinations
  // and run them in parallel, capped by sandboxLimit concurrency.
  type ExecutionTask = {
    lang: string;
    tc: (typeof enrichedTestCases)[number];
    kind: 'optimal' | 'brute';
    promise: Promise<Awaited<ReturnType<typeof executeSandbox>>>;
  };

  const tasks: ExecutionTask[] = [];

  for (const lang of languages) {
    const optCode = optimalSolution[lang];
    const bruteCode = bruteForceSolution[lang];
    if (!optCode || !bruteCode) continue;

    for (const tc of enrichedTestCases) {
      tasks.push({
        lang,
        tc,
        kind: 'optimal',
        promise: sandboxLimit(() =>
          executeSandbox({ language: lang, version: 'latest', code: optCode, stdin: tc.input })
        ),
      });
      tasks.push({
        lang,
        tc,
        kind: 'brute',
        promise: sandboxLimit(() =>
          executeSandbox({ language: lang, version: 'latest', code: bruteCode, stdin: tc.input })
        ),
      });
    }
  }

  // Wait for every execution task concurrently
  const results = await Promise.all(tasks.map((t) => t.promise));

  // Evaluate results
  let optAllPassed = true;
  let bruteAllPassed = true;
  let crossCheckPassed = true;

  for (let i = 0; i < tasks.length; i += 2) {
    const optResult = results[i];
    const bruteResult = results[i + 1];
    const tc = tasks[i].tc;

    if (optResult.exitCode !== 0 || optResult.stdout.trim() !== tc.expectedOutput.trim()) {
      optAllPassed = false;
    }
    if (bruteResult.exitCode !== 0 || bruteResult.stdout.trim() !== tc.expectedOutput.trim()) {
      bruteAllPassed = false;
    }
    if (optResult.stdout.trim() !== bruteResult.stdout.trim()) {
      crossCheckPassed = false;
    }
  }

  result.stages.syntaxCheck = true;
  result.stages.optimalSolutionPassed = optAllPassed;
  result.stages.bruteForcePassed = bruteAllPassed;
  result.stages.crossCheckPassed = crossCheckPassed;
  result.stages.edgeCasesPassed = optAllPassed;

  if (!optAllPassed || !crossCheckPassed) {
    result.passed = false;
    result.details = `Validation failed. Cross-check: ${crossCheckPassed}. Optimal passed: ${optAllPassed}.`;
    return result;
  }

  result.passed = true;
  result.details = 'All solutions validated across all languages with cross-checking.';
  return result;
}

async function _validateConceptual(
  question: Question,
  _config: GenerationWizardConfig,
  result: ValidationPipelineResult
): Promise<ValidationPipelineResult> {
  // Use Multi-Agent Debate for OOPS/Conceptual questions
  const debateResult = await runAdversarialDebate(question);
  result.stages.adversaryDebatePassed = debateResult.passed;
  result.stages.syntaxCheck = true;
  result.stages.optimalSolutionPassed = true;
  result.stages.bruteForcePassed = true;
  result.stages.crossCheckPassed = true;
  result.stages.edgeCasesPassed = true;
  result.passed = debateResult.passed;
  result.details = debateResult.report;
  return result;
}
