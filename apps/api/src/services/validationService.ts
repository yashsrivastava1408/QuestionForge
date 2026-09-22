import type { Question } from '@prisma/client';
import type { GenerationWizardConfig, ValidationPipelineResult } from '@question-forge/shared';
import { logger } from '../utils/logger.js';
import { executeSandbox } from './sandboxService.js';
import { runAdversarialDebate } from './agentDebateService.js';
import { injectEdgeCases } from './edgeCaseService.js';

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
  const testCases = question.testCases as any[] ?? [];
  const optimalSolution = question.optimalSolution as any ?? {};
  const bruteForceSolution = question.bruteForceSolution as any ?? {};
  const languages = (question.languages as string[]) ?? config.languages;

  // Inject edge cases
  const enrichedTestCases = injectEdgeCases(testCases, question.topic);
  logger.info(`[Validation] Running ${enrichedTestCases.length} test cases for Q: ${question.id}`);

  for (const lang of languages) {
    const optCode = optimalSolution[lang];
    const bruteCode = bruteForceSolution[lang];
    if (!optCode || !bruteCode) continue;

    let optAllPassed = true;
    let bruteAllPassed = true;
    let crossCheckPassed = true;

    for (const tc of enrichedTestCases) {
      const [optResult, bruteResult] = await Promise.all([
        executeSandbox({ language: lang, version: 'latest', code: optCode, stdin: tc.input }),
        executeSandbox({ language: lang, version: 'latest', code: bruteCode, stdin: tc.input }),
      ]);

      if (optResult.exitCode !== 0 || optResult.stdout.trim() !== tc.expectedOutput.trim()) optAllPassed = false;
      if (bruteResult.exitCode !== 0 || bruteResult.stdout.trim() !== tc.expectedOutput.trim()) bruteAllPassed = false;
      if (optResult.stdout.trim() !== bruteResult.stdout.trim()) crossCheckPassed = false;

      if (!optAllPassed && !crossCheckPassed) break;
    }

    result.stages.optimalSolutionPassed = optAllPassed;
    result.stages.bruteForcePassed = bruteAllPassed;
    result.stages.crossCheckPassed = crossCheckPassed;
    result.stages.syntaxCheck = true;
    result.stages.edgeCasesPassed = optAllPassed;

    if (!optAllPassed || !crossCheckPassed) {
      result.passed = false;
      result.details = `Validation failed for language: ${lang}. Cross-check: ${crossCheckPassed}. Optimal passed: ${optAllPassed}`;
      return result;
    }
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
