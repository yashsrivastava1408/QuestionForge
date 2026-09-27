import type { GenerationWizardConfig, ValidationPipelineResult } from '@question-forge/shared';
import type { Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { runDsaGenerationGraph, runOopsDebateGraph } from '@question-forge/ai-orchestration';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { runValidationPipeline } from './validationService.js';
import { checkDuplicate, storeEmbedding } from './deduplicationService.js';
import { getLLMClient } from './llmService.js';
import { triggerWebhook } from '../routes/webhooks.js';
import { generationQueue } from '../queues/generationQueue.js';

const MAX_ATTEMPTS = 3;

/** Marker returned by the `generate` node when the LLM call itself throws, so `validate`
 * can short-circuit without touching the database — mirrors the pre-LangGraph behavior of
 * never persisting a row for a pure API failure, only for a drafted-but-invalid question. */
interface GenerationError {
  __generationError: string;
}

function isGenerationError(draft: unknown): draft is GenerationError {
  return !!draft && typeof draft === 'object' && '__generationError' in (draft as Record<string, unknown>);
}

/**
 * Enqueues a generation job into BullMQ.
 * Returns immediately with a jobId — the work happens in the background worker.
 * Jobs are persisted in Redis and survive server restarts.
 */
export async function runGenerationPipeline(config: GenerationWizardConfig): Promise<string> {
  const jobId = uuidv4();
  await generationQueue.add(
    'generate',
    { jobId, config },
    {
      jobId, // Use our own jobId so the status endpoint can look it up directly
    }
  );
  logger.info(`[Queue] Enqueued generation job ${jobId} for org ${config.organizationId}`);
  return jobId;
}

/** Extracts the Prisma `Question` columns out of a raw LLM draft. Pure and reusable across attempts. */
export function buildQuestionData(
  rawQuestion: any,
  type: string,
  difficulty: string,
  config: GenerationWizardConfig
) {
  const {
    title,
    statement,
    options,
    answer,
    explanation,
    optimalSolution,
    bruteForceSolution,
    testCases,
    languages,
    tags,
    timeComplexity,
    spaceComplexity,
  } = rawQuestion ?? {};

  const combinedExplanation = [
    explanation,
    timeComplexity ? `Time Complexity: ${timeComplexity}` : '',
    spaceComplexity ? `Space Complexity: ${spaceComplexity}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    title: title ?? `${type} Question (${difficulty})`,
    statement: statement ?? '',
    type: type as any,
    difficulty: difficulty as any,
    topic: rawQuestion?.topic ?? config.topics[0] ?? 'General',
    options: options ?? null,
    answer: answer ?? null,
    explanation: combinedExplanation || null,
    optimalSolution: optimalSolution ?? null,
    bruteForceSolution: bruteForceSolution ?? null,
    testCases: testCases ?? null,
    languages: Array.isArray(languages) ? languages : config.languages,
    tags: Array.isArray(tags) ? tags : [],
  };
}

/**
 * Generates and validates a single question, driven by the real LangGraph
 * `generate -> validate -> retry` state machine in `@question-forge/ai-orchestration`
 * (`runDsaGenerationGraph` for DSA, `runOopsDebateGraph` for everything else — both
 * are the same engine, specialized per question type).
 *
 * Only one Prisma row is ever created per (difficulty, type) slot: retries update
 * that same row instead of leaving earlier failed drafts behind as orphaned
 * `VALIDATING` rows.
 */
async function generateAndValidateQuestion(
  jobId: string,
  config: GenerationWizardConfig,
  difficulty: string,
  type: string,
  llm: ReturnType<typeof getLLMClient>
): Promise<boolean> {
  let questionId: string | null = null;
  const runGraph = type === 'DSA' ? runDsaGenerationGraph : runOopsDebateGraph;

  const result = await runGraph<any, ValidationPipelineResult | null>(
    {
      generate: async ({ attempt, previousDraft, feedback }) => {
        try {
          logger.info(`[Job ${jobId}] Generating ${type} / ${difficulty} (attempt ${attempt + 1})`);
          return await llm.generateQuestion(
            { ...config, difficulty, questionType: type },
            previousDraft ?? undefined,
            feedback ?? undefined
          );
        } catch (err: any) {
          logger.error(`[Job ${jobId}] Generation attempt ${attempt + 1} threw`, { error: err.message });
          const waitMs = (attempt + 1) * 5000;
          await new Promise((r) => setTimeout(r, waitMs));
          return { __generationError: err.message } satisfies GenerationError;
        }
      },
      validate: async (rawQuestion) => {
        if (isGenerationError(rawQuestion)) {
          return { passed: false, feedback: rawQuestion.__generationError, validation: null };
        }

        const isDuplicate = await checkDuplicate(rawQuestion.statement ?? '', config.organizationId);
        if (isDuplicate) {
          logger.warn(`[Job ${jobId}] Duplicate detected for ${type}/${difficulty}, retrying with feedback.`);
          return {
            passed: false,
            feedback:
              'Question generated was too similar to an existing question in the bank. You must generate a completely novel question.',
            validation: null,
          };
        }

        const questionData = buildQuestionData(rawQuestion, type, difficulty, config);

        if (!questionId) {
          const created = await prisma.question.create({
            data: { ...questionData, status: 'VALIDATING', organizationId: config.organizationId, retryCount: 0 },
          });
          questionId = created.id;
        } else {
          await prisma.question.update({
            where: { id: questionId },
            data: { ...questionData, status: 'VALIDATING', retryCount: { increment: 1 } },
          });
        }

        const savedQuestion = await prisma.question.findUniqueOrThrow({ where: { id: questionId } });
        const validationResult = await runValidationPipeline(savedQuestion, config);

        return {
          passed: validationResult.passed,
          feedback: validationResult.details || 'Question failed internal validation suite.',
          validation: validationResult,
        };
      },
    },
    { maxAttempts: MAX_ATTEMPTS }
  );

  if (!questionId) {
    logger.warn(`[Job ${jobId}] Every attempt for ${type}/${difficulty} was a duplicate; nothing persisted.`);
    return false;
  }

  if (result.passed && result.validation) {
    await prisma.question.update({
      where: { id: questionId },
      data: { status: 'VALIDATED', validationResult: result.validation as any },
    });
    await storeEmbedding(questionId, result.draft?.statement ?? '');
    await triggerWebhook(config.organizationId, {
      event: 'question.validated',
      timestamp: new Date().toISOString(),
      organizationId: config.organizationId,
      data: { questionId, type, difficulty },
    });
    return true;
  }

  await prisma.question.update({
    where: { id: questionId },
    data: { status: 'FAILED', validationResult: (result.validation as any) ?? undefined },
  });
  logger.warn(`[Job ${jobId}] ${type}/${difficulty} marked FAILED after ${result.attempts} attempt(s).`);
  return false;
}

/**
 * The actual pipeline logic — called by the BullMQ worker.
 * Exported so the worker can import and invoke it.
 * The optional `job` parameter allows us to update BullMQ job progress.
 */
export async function _runPipelineAsync(
  jobId: string,
  config: GenerationWizardConfig,
  job?: Job
): Promise<void> {
  logger.info(`[Job ${jobId}] Starting generation for org ${config.organizationId}`);
  const llm = getLLMClient(config.llmProvider, config.organizationId);
  const difficultyPlan = buildDifficultyPlan(config);
  const total = difficultyPlan.length;
  let completed = 0;

  for (const { difficulty, type } of difficultyPlan) {
    await generateAndValidateQuestion(jobId, config, difficulty, type, llm);

    completed++;
    if (job) {
      await job.updateProgress(Math.round((completed / total) * 100));
    }
  }

  logger.info(`[Job ${jobId}] Pipeline complete.`);
}

export function buildDifficultyPlan(config: GenerationWizardConfig) {
  const plan: { difficulty: string; type: string }[] = [];
  const { easy, medium } = config.difficultyDistribution;
  const easyCount = Math.round(config.totalQuestions * (easy / 100));
  const mediumCount = Math.round(config.totalQuestions * (medium / 100));
  const hardCount = config.totalQuestions - easyCount - mediumCount;
  const typeCycle = [...config.questionTypes];

  const addItems = (count: number, difficulty: string) => {
    for (let i = 0; i < count; i++) {
      plan.push({ difficulty, type: typeCycle[i % typeCycle.length] });
    }
  };

  addItems(easyCount, 'EASY');
  addItems(mediumCount, 'MEDIUM');
  addItems(hardCount, 'HARD');
  return plan;
}
