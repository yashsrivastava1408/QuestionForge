import type { GenerationWizardConfig } from '@question-forge/shared';
import type { Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { runValidationPipeline } from './validationService.js';
import { checkDuplicate, storeEmbedding } from './deduplicationService.js';
import { getLLMClient } from './llmService.js';
import { triggerWebhook } from '../routes/webhooks.js';
import { generationQueue } from '../queues/generationQueue.js';

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
    let retries = 0;
    let success = false;
    let previousDraft: any = null;
    let criticism = '';

    while (retries < 3 && !success) {
      try {
        logger.info(`[Job ${jobId}] Generating ${type} / ${difficulty} (attempt ${retries + 1})`);
        const rawQuestion = await llm.generateQuestion(
          { ...config, difficulty, questionType: type },
          previousDraft,
          criticism
        );

        // Deduplication check
        const isDuplicate = await checkDuplicate(rawQuestion.statement, config.organizationId);
        if (isDuplicate) {
          logger.warn(`[Job ${jobId}] Duplicate detected, skipping.`);
          retries++;
          criticism =
            'Question generated was too similar to an existing question in the bank. You must generate a completely novel question.';
          previousDraft = rawQuestion;
          continue;
        }

        // Sanitize LLM payload — extract only defined Question model columns
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
        } = rawQuestion;

        const combinedExplanation = [
          explanation,
          timeComplexity ? `Time Complexity: ${timeComplexity}` : '',
          spaceComplexity ? `Space Complexity: ${spaceComplexity}` : '',
        ]
          .filter(Boolean)
          .join('\n\n');

        // Save as VALIDATING
        const saved = await prisma.question.create({
          data: {
            title: title ?? `${type} Question (${difficulty})`,
            statement: statement ?? '',
            type: type as any,
            difficulty: difficulty as any,
            topic: rawQuestion.topic ?? config.topics[0] ?? 'General',
            options: options ?? null,
            answer: answer ?? null,
            explanation: combinedExplanation || null,
            optimalSolution: optimalSolution ?? null,
            bruteForceSolution: bruteForceSolution ?? null,
            testCases: testCases ?? null,
            languages: Array.isArray(languages) ? languages : config.languages,
            tags: Array.isArray(tags) ? tags : [],
            status: 'VALIDATING',
            organizationId: config.organizationId,
            retryCount: retries,
          },
        });

        // Run validation pipeline (sandbox for DSA, agent debate for OOPS)
        const validationResult = await runValidationPipeline(saved, config);

        if (validationResult.passed) {
          await prisma.question.update({
            where: { id: saved.id },
            data: { status: 'VALIDATED', validationResult: validationResult as any },
          });

          // Store vector embedding for deduplication against future generations
          await storeEmbedding(saved.id, statement);

          // Trigger webhook if configured
          await triggerWebhook(config.organizationId, {
            event: 'question.validated',
            timestamp: new Date().toISOString(),
            organizationId: config.organizationId,
            data: { questionId: saved.id, type, difficulty },
          });
          success = true;
        } else {
          retries++;
          if (retries >= 3) {
            await prisma.question.update({
              where: { id: saved.id },
              data: { status: 'FAILED', validationResult: validationResult as any },
            });
            logger.warn(`[Job ${jobId}] Question failed after 3 retries. Marked FAILED.`);
          } else {
            logger.info(`[Job ${jobId}] Validation failed. Retrying with reflection.`);
            previousDraft = rawQuestion;
            criticism = validationResult.details || 'Question failed internal validation suite.';
          }
        }
      } catch (err: any) {
        logger.error(`[Job ${jobId}] Error in generation attempt`, { error: err.message });
        retries++;
        if (retries < 3) {
          const waitTime = retries * 5000;
          logger.info(`[Job ${jobId}] Backing off for ${waitTime}ms due to API error...`);
          await new Promise((r) => setTimeout(r, waitTime));
        }
      }
    }

    // Update BullMQ job progress so the status endpoint can report it
    completed++;
    if (job) {
      await job.updateProgress(Math.round((completed / total) * 100));
    }
  }

  logger.info(`[Job ${jobId}] Pipeline complete.`);
}

function buildDifficultyPlan(config: GenerationWizardConfig) {
  const plan: { difficulty: string; type: string }[] = [];
  const { easy, medium, hard } = config.difficultyDistribution;
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
