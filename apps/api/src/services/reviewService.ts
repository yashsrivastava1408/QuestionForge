import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { completeJson, LlmOutputError, type LLMClient, type UsageMeter } from './llmService.js';
import { buildAdversaryPrompt, buildBlindSolvePrompt, buildJudgePrompt } from './prompts.js';

export interface ReviewOutcome {
  passed: boolean;
  /** Written for the generator: says what to fix. Also stored on the question for human reviewers. */
  report: string;
  blindSolvePassed?: boolean;
  adversaryPassed: boolean;
}

export interface Reviewer {
  client: LLMClient;
  crossModel: boolean;
  meter?: UsageMeter;
}

const blindSolveSchema = z.object({
  answer: z.string().nullable(),
  confidence: z.string().optional(),
  reasoning: z.string().optional().default(''),
  alsoDefensible: z.array(z.string()).optional().default([]),
});

const adversarySchema = z.object({
  foundIssue: z.boolean(),
  severity: z.string().optional().default('minor'),
  issue: z.string().nullable().optional(),
});

const judgeSchema = z.object({
  decision: z.enum(['PASS', 'FAIL']),
  reasoning: z.string().optional().default(''),
});

/**
 * A reviewer call that could not produce a verdict. This is never converted
 * into a pass: one retry, then the error propagates so the job is retried and,
 * if the reviewer stays unusable, the question ends up FAILED — not approved
 * by default.
 */
async function reviewJson<T extends z.ZodTypeAny>(reviewer: Reviewer, prompt: string, schema: T): Promise<z.infer<T>> {
  try {
    return await completeJson(reviewer.client, prompt, schema, reviewer.meter, { maxTokens: 4000 });
  } catch (err) {
    if (!(err instanceof LlmOutputError)) throw err;
    logger.warn(`[Review] Unusable reviewer reply (${err.message}); retrying once.`);
    try {
      return await completeJson(reviewer.client, prompt, schema, reviewer.meter, { maxTokens: 4000 });
    } catch (retryErr: any) {
      throw new Error(`Reviewer model did not return a usable verdict: ${retryErr.message}`, { cause: retryErr });
    }
  }
}

const norm = (s: string) => s.trim().toUpperCase();

/** Adversary looks for a defect; if it reports one, a judge decides whether it is real and serious. */
async function adversarialReview(
  question: unknown,
  kind: 'mcq' | 'design',
  reviewer: Reviewer,
  extraConcern?: string
): Promise<{ passed: boolean; report: string }> {
  const adversary = await reviewJson(reviewer, buildAdversaryPrompt(question, kind), adversarySchema);
  const concern = adversary.foundIssue && adversary.issue ? adversary.issue : extraConcern;
  if (!concern) return { passed: true, report: 'Adversarial review found no defect.' };

  const severity = adversary.foundIssue && adversary.issue ? adversary.severity : 'major';
  const judge = await reviewJson(reviewer, buildJudgePrompt(question, concern, severity), judgeSchema);
  return {
    passed: judge.decision === 'PASS',
    report: `Reviewer concern (${severity}): ${concern} Judge: ${judge.decision} — ${judge.reasoning}`,
  };
}

/**
 * MCQ-style review. Three independent checks, all of which must hold:
 *  1. Structure — right number of distinct options, key points at one of them.
 *  2. Blind solve — the reviewer answers WITHOUT the key; it must land on the key.
 *     This is the check that catches a wrong or ambiguous answer key.
 *  3. Adversarial review — defects a correct key does not rule out.
 */
export async function reviewMcq(
  question: { statement: string; options: unknown; answer: string | null },
  reviewer: Reviewer,
  expectedOptions?: number
): Promise<ReviewOutcome> {
  const options = Array.isArray(question.options) ? (question.options as { id: string; text: string }[]) : [];
  const ids = options.map((o) => norm(String(o.id)));
  const key = norm(question.answer ?? '');

  const structural: string[] = [];
  if (options.length < 2) structural.push('The question has fewer than 2 options.');
  if (expectedOptions && options.length !== expectedOptions) {
    structural.push(`Expected exactly ${expectedOptions} options, got ${options.length}.`);
  }
  if (new Set(ids).size !== ids.length) structural.push('Option ids are not unique.');
  if (new Set(options.map((o) => String(o.text).trim().toLowerCase())).size !== options.length) {
    structural.push('Two options have identical text.');
  }
  if (!ids.includes(key)) structural.push(`The answer "${question.answer}" is not one of the option ids.`);
  if (structural.length > 0) {
    return { passed: false, report: structural.join(' '), blindSolvePassed: false, adversaryPassed: false };
  }

  const solved = await reviewJson(reviewer, buildBlindSolvePrompt(question.statement, options), blindSolveSchema);
  const solvedAnswer = solved.answer ? norm(solved.answer) : null;
  if (solvedAnswer !== key) {
    return {
      passed: false,
      blindSolvePassed: false,
      adversaryPassed: false,
      report: solvedAnswer
        ? `An independent solver that could not see the answer key chose ${solvedAnswer}, but the key says ${key}. Solver's reasoning: ${solved.reasoning} Either the key is wrong or the question is ambiguous.`
        : `An independent solver found no single correct option. Its reasoning: ${solved.reasoning}`,
    };
  }

  const others = solved.alsoDefensible.map(norm).filter((id) => id !== key && ids.includes(id));
  const extraConcern = others.length > 0
    ? `An independent solver agreed with the key (${key}) but said option(s) ${others.join(', ')} could also be defended. ${solved.reasoning}`
    : undefined;

  const review = await adversarialReview(
    { statement: question.statement, options, answer: question.answer },
    'mcq',
    reviewer,
    extraConcern
  );
  return {
    passed: review.passed,
    blindSolvePassed: true,
    adversaryPassed: review.passed,
    report: `Blind solve agreed with the key (${key}). ${review.report}`,
  };
}

/** Open-ended design questions cannot be executed or blind-solved; they get structure checks and LLM review only. */
export async function reviewDesign(
  question: { statement: string; answer: string | null; validationAssets: any },
  reviewer: Reviewer
): Promise<ReviewOutcome> {
  const rubric: { criterion: string; points: number }[] = question.validationAssets?.rubric ?? [];
  const total = rubric.reduce((sum, r) => sum + Number(r.points || 0), 0);
  if (rubric.length < 4 || Math.abs(total - 100) > 0.5) {
    return {
      passed: false,
      adversaryPassed: false,
      report: `The rubric must have at least 4 criteria whose points add up to 100 (got ${rubric.length} criteria totalling ${total}).`,
    };
  }

  const review = await adversarialReview(
    {
      statement: question.statement,
      requirements: question.validationAssets?.requirements,
      rubric,
      referenceOutline: question.answer,
    },
    'design',
    reviewer
  );
  return { passed: review.passed, adversaryPassed: review.passed, report: review.report };
}
