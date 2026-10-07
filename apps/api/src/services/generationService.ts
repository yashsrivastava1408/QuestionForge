import type {
  GenerationJobStatus,
  GenerationKind,
  GenerationWizardConfig,
  LLMProvider,
  TestCase,
  ValidationPipelineResult,
} from '@question-forge/shared';
import type { GenerationItem, GenerationBatch, Question } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { runDsaGenerationGraph, runOopsDebateGraph } from '@question-forge/ai-orchestration';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { runValidationPipeline } from './validationService.js';
import { computeEmbedding, findDuplicate } from './deduplicationService.js';
import {
  completeJson,
  getLLMClient,
  getReviewerLLMClient,
  LlmOutputError,
  LLM_PROVIDERS,
  modelFor,
  resolveApiKey,
  UsageMeter,
  type OrgLlmKeys,
} from './llmService.js';
import { buildDraftPrompt } from './prompts.js';
import { buildQuestionData, draftKindFor, draftSchemaFor, type AnyDraft } from './questionDrafts.js';
import { estimateCostUsd } from './pricing.js';
import { enqueueWebhook } from '../queues/webhookQueue.js';
import { generationQueue } from '../queues/generationQueue.js';
import { AppError } from '../middleware/errorHandler.js';

const MAX_ATTEMPTS = 3;
const FINAL_STATUSES = ['VALIDATED', 'FAILED'];

export interface PlanItem {
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  type: string;
  topic: string;
}

/**
 * Turns the wizard config into one slot per question. Types and topics rotate
 * across the WHOLE plan (not per difficulty band), so a 3-type request is spread
 * evenly and every question is anchored to a single topic instead of all of them.
 */
export function buildGenerationPlan(config: Pick<GenerationWizardConfig, 'totalQuestions' | 'difficultyDistribution' | 'questionTypes' | 'topics'>): PlanItem[] {
  const { easy, medium } = config.difficultyDistribution;
  const easyCount = Math.min(config.totalQuestions, Math.round(config.totalQuestions * (easy / 100)));
  const mediumCount = Math.min(config.totalQuestions - easyCount, Math.round(config.totalQuestions * (medium / 100)));
  const hardCount = config.totalQuestions - easyCount - mediumCount;

  const difficulties: PlanItem['difficulty'][] = [
    ...Array(easyCount).fill('EASY'),
    ...Array(mediumCount).fill('MEDIUM'),
    ...Array(hardCount).fill('HARD'),
  ];
  const topics = config.topics.length > 0 ? config.topics : ['General'];
  return difficulties.map((difficulty, i) => ({
    difficulty,
    type: config.questionTypes[i % config.questionTypes.length],
    topic: topics[i % topics.length],
  }));
}

/**
 * `runTag` makes the BullMQ job id unique per run. BullMQ ignores an add() whose
 * job id it has seen before, so re-queuing an item (retry, sweeper) needs a new one.
 */
async function enqueueItems(items: { id: string }[], runTag?: string) {
  await generationQueue.addBulk(
    items.map((item) => ({
      name: 'item',
      data: { itemId: item.id },
      opts: { jobId: runTag ? `${item.id}-${runTag}` : item.id },
    }))
  );
}

/** Raised inside a running job when its batch was cancelled; ends the item without a retry. */
class BatchCancelledError extends Error {}

const CANCELLED_REASON = 'Cancelled by a user before it finished.';

async function isCancelled(batchId: string): Promise<boolean> {
  const batch = await prisma.generationBatch.findUnique({ where: { id: batchId }, select: { cancelledAt: true } });
  return !!batch?.cancelledAt;
}

/**
 * Cancels a batch. Items still waiting are dropped immediately; an item that is
 * mid-attempt stops at its next step (the current LLM call or sandbox run is
 * allowed to finish — it is already paid for). Validated questions are kept.
 */
export async function cancelBatch(jobId: string, organizationId: string): Promise<boolean> {
  const batch = await prisma.generationBatch.findFirst({ where: { id: jobId, organizationId } });
  if (!batch) return false;
  if (batch.finishedAt) throw new AppError('This job has already finished.', 409);

  await prisma.generationBatch.update({ where: { id: jobId }, data: { cancelledAt: new Date() } });
  await prisma.generationItem.updateMany({
    where: { batchId: jobId, status: 'QUEUED' },
    data: { status: 'FAILED', stage: 'Cancelled', failureReason: CANCELLED_REASON, finishedAt: new Date() },
  });
  await finishBatchIfDone(batch);
  return true;
}

/**
 * Puts a finished batch's FAILED items back on the queue. Each keeps its slot
 * (type, difficulty, topic) and its question row, so a retry replaces the failed
 * draft instead of adding another.
 */
export async function retryFailedItems(jobId: string, organizationId: string): Promise<number> {
  const batch = await prisma.generationBatch.findFirst({
    where: { id: jobId, organizationId },
    include: { items: { where: { status: 'FAILED' }, select: { id: true } } },
  });
  if (!batch) throw new AppError('Job not found.', 404);
  if (batch.kind !== 'GENERATE') throw new AppError('Only generation jobs can be retried this way.', 400);
  if (!batch.finishedAt) throw new AppError('Wait for the job to finish before retrying its failures.', 409);
  if (batch.items.length === 0) return 0;

  await prisma.$transaction([
    prisma.generationItem.updateMany({
      where: { id: { in: batch.items.map((i) => i.id) } },
      data: { status: 'QUEUED', stage: null, failureReason: null, attempts: 0, startedAt: null, finishedAt: null },
    }),
    prisma.generationBatch.update({ where: { id: jobId }, data: { finishedAt: null, cancelledAt: null } }),
  ]);
  await enqueueItems(batch.items, `r${Date.now()}`);
  return batch.items.length;
}

/** Re-queues items by id. Used by the maintenance sweeper for work that lost its queue job. */
export async function requeueItems(itemIds: string[]): Promise<void> {
  if (itemIds.length > 0) await enqueueItems(itemIds.map((id) => ({ id })), `s${Date.now()}`);
}

/**
 * Creates a generation batch (one row per requested question) and enqueues one
 * job per question. Returns the batch id, which is the public jobId.
 */
export async function createGenerationBatch(config: GenerationWizardConfig): Promise<string> {
  const plan = buildGenerationPlan(config);
  const batch = await prisma.generationBatch.create({
    data: {
      id: uuidv4(),
      organizationId: config.organizationId,
      requestedById: config.requestedBy,
      kind: 'GENERATE',
      config: config as any,
      paperId: config.paperId ?? null,
      total: plan.length,
      items: {
        create: plan.map((p, index) => ({ index, type: p.type as any, difficulty: p.difficulty, topic: p.topic })),
      },
    },
    include: { items: { select: { id: true } } },
  });
  await enqueueItems(batch.items);
  logger.info(`[Queue] Enqueued batch ${batch.id}: ${plan.length} question job(s) for org ${config.organizationId}`);
  return batch.id;
}

/**
 * Enqueues work on ONE existing question: re-validation after an edit, or
 * completing an imported draft with solutions and tests. It is a one-item
 * batch so its progress is visible through the same status endpoint.
 */
export async function createQuestionJob(params: {
  kind: Exclude<GenerationKind, 'GENERATE'>;
  question: Pick<Question, 'id' | 'type' | 'difficulty' | 'topic' | 'organizationId' | 'languages'>;
  requestedBy: string;
  llmProvider?: LLMProvider;
  languages?: string[];
}): Promise<string> {
  const { kind, question } = params;
  const batch = await prisma.generationBatch.create({
    data: {
      id: uuidv4(),
      organizationId: question.organizationId,
      requestedById: params.requestedBy,
      kind,
      config: {
        llmProvider: params.llmProvider ?? null,
        languages: params.languages ?? question.languages,
      },
      total: 1,
      items: {
        create: [{ index: 0, type: question.type, difficulty: question.difficulty, topic: question.topic, questionId: question.id }],
      },
    },
    include: { items: { select: { id: true } } },
  });
  await enqueueItems(batch.items);
  return batch.id;
}

/** First provider that has a usable key — used when the caller did not pick one. */
export function defaultProvider(orgKeys: OrgLlmKeys): LLMProvider {
  const provider = LLM_PROVIDERS.find((p) => resolveApiKey(p, orgKeys));
  if (!provider) {
    throw new AppError('No LLM API key is configured. Add one under Admin → LLM Keys or in the server environment.', 400);
  }
  return provider;
}

type ItemWithBatch = GenerationItem & { batch: GenerationBatch };
type Validation = { result: ValidationPipelineResult; testCases?: TestCase[] };

interface ItemOutcome {
  passed: boolean;
  questionId: string | null;
  failureReason: string | null;
}

/**
 * Processes one question slot. Called by the BullMQ worker.
 *
 * Throws only for infrastructure failures (LLM provider or sandbox unavailable),
 * which BullMQ retries. A question that cannot be made to pass validation is a
 * normal outcome: the item ends FAILED with the validator's reason.
 */
export async function processGenerationItem(itemId: string): Promise<void> {
  const item = await prisma.generationItem.findUnique({ where: { id: itemId }, include: { batch: true } });
  if (!item) {
    logger.warn(`[Item ${itemId}] No such generation item; skipping.`);
    return;
  }
  if (FINAL_STATUSES.includes(item.status)) return; // redelivered job — already done
  if (item.batch.cancelledAt) {
    await failGenerationItem(itemId, CANCELLED_REASON);
    return;
  }

  const org = await prisma.organization.findUnique({
    where: { id: item.batch.organizationId },
    select: { llmApiKeysEncrypted: true },
  });
  const orgKeys = (org?.llmApiKeysEncrypted ?? null) as OrgLlmKeys;
  const meter = new UsageMeter();

  await prisma.generationItem.update({ where: { id: itemId }, data: { startedAt: item.startedAt ?? new Date() } });

  let outcome: ItemOutcome;
  try {
    outcome = item.batch.kind === 'REVALIDATE'
      ? await revalidateItem(item, orgKeys, meter)
      : await draftAndValidateItem(item, orgKeys, meter);
  } catch (err: any) {
    await recordUsage(item, meter);
    if (err instanceof BatchCancelledError) {
      await failGenerationItem(itemId, CANCELLED_REASON);
      return;
    }
    await setStage(itemId, { stage: `Waiting to retry — ${String(err.message).slice(0, 300)}` });
    throw err;
  }

  await recordUsage(item, meter);
  await prisma.generationItem.update({
    where: { id: itemId },
    data: {
      status: outcome.passed ? 'VALIDATED' : 'FAILED',
      stage: outcome.passed ? 'Validated' : 'Failed validation',
      failureReason: outcome.failureReason,
      questionId: outcome.questionId,
      finishedAt: new Date(),
    },
  });
  await finishBatchIfDone(item.batch);
}

/** Marks an item FAILED after its job ran out of retries (infrastructure failure). */
export async function failGenerationItem(itemId: string, reason: string): Promise<void> {
  const item = await prisma.generationItem.findUnique({ where: { id: itemId }, include: { batch: true } });
  if (!item || FINAL_STATUSES.includes(item.status)) return;

  await prisma.generationItem.update({
    where: { id: itemId },
    data: { status: 'FAILED', stage: 'Failed', failureReason: reason, finishedAt: new Date() },
  });
  if (item.questionId) {
    // Never leave a question stuck in VALIDATING. Imported drafts go back to DRAFT untouched.
    await prisma.question.updateMany({
      where: { id: item.questionId, status: 'VALIDATING' },
      data: item.batch.kind === 'COMPLETE_IMPORT' ? { status: 'DRAFT' } : { status: 'FAILED', embeddingVector: [] },
    });
  }
  await finishBatchIfDone(item.batch);
}

async function setStage(itemId: string, data: { status?: 'GENERATING' | 'VALIDATING'; stage: string; attempts?: number }) {
  await prisma.generationItem.update({ where: { id: itemId }, data });
}

async function recordUsage(item: ItemWithBatch, meter: UsageMeter) {
  if (meter.inputTokens === 0 && meter.outputTokens === 0) return;
  const increment = { inputTokens: { increment: meter.inputTokens }, outputTokens: { increment: meter.outputTokens } };
  await prisma.$transaction([
    prisma.generationItem.update({ where: { id: item.id }, data: increment }),
    prisma.generationBatch.update({ where: { id: item.batchId }, data: increment }),
  ]);
  meter.inputTokens = 0;
  meter.outputTokens = 0;
}

async function finishBatchIfDone(batch: GenerationBatch) {
  const remaining = await prisma.generationItem.count({
    where: { batchId: batch.id, status: { notIn: ['VALIDATED', 'FAILED'] } },
  });
  if (remaining > 0) return;

  // updateMany with a finishedAt guard: only one worker wins and sends the webhook.
  const { count } = await prisma.generationBatch.updateMany({
    where: { id: batch.id, finishedAt: null },
    data: { finishedAt: new Date() },
  });
  if (count === 0 || batch.kind !== 'GENERATE') return;

  const validated = await prisma.generationItem.count({ where: { batchId: batch.id, status: 'VALIDATED' } });
  await enqueueWebhook(batch.organizationId, {
    event: 'generation.completed',
    timestamp: new Date().toISOString(),
    organizationId: batch.organizationId,
    data: { jobId: batch.id, total: batch.total, validated, failed: batch.total - validated },
  });
  logger.info(`[Batch ${batch.id}] Finished: ${validated}/${batch.total} validated.`);
}

/** Titles the generator is told not to repeat: recent questions of this type, including ones still in flight. */
async function titlesToAvoid(organizationId: string, type: string, excludeId: string | null): Promise<string[]> {
  const rows = await prisma.question.findMany({
    where: {
      organizationId,
      type: type as any,
      status: { not: 'FAILED' },
      ...(excludeId && { id: { not: excludeId } }),
    },
    select: { title: true },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
  return [...new Set(rows.map((r) => r.title))];
}

async function attachToPaper(paperId: string, questionId: string) {
  try {
    const last = await prisma.paperQuestion.findFirst({ where: { paperId }, orderBy: { order: 'desc' }, select: { order: true } });
    await prisma.paperQuestion.create({ data: { paperId, questionId, order: (last?.order ?? 0) + 1 } });
  } catch (err: any) {
    logger.warn(`[Paper ${paperId}] Could not attach question ${questionId}`, { error: err.message });
  }
}

/**
 * GENERATE and COMPLETE_IMPORT: the LangGraph `generate → validate → retry`
 * state machine. The validator's report is fed back into the next draft, up to
 * MAX_ATTEMPTS, and only one Question row exists per slot however many attempts it takes.
 */
async function draftAndValidateItem(item: ItemWithBatch, orgKeys: OrgLlmKeys, meter: UsageMeter): Promise<ItemOutcome> {
  const config = item.batch.config as unknown as Partial<GenerationWizardConfig>;
  const organizationId = item.batch.organizationId;
  const isImport = item.batch.kind === 'COMPLETE_IMPORT';
  const kind = draftKindFor(item.type);
  const schema = draftSchemaFor(kind);

  const provider = config.llmProvider ?? defaultProvider(orgKeys);
  const generator = getLLMClient(provider, orgKeys);
  // MCQ-style and design questions are reviewed by a second model; coding questions get an
  // independent solver from it (VALIDATION_BLIND_SOLVER=false turns that off).
  const blindSolve = kind === 'code' && process.env.VALIDATION_BLIND_SOLVER !== 'false';
  const reviewer = kind === 'mcq' || kind === 'design' || blindSolve
    ? { ...getReviewerLLMClient(provider, orgKeys), meter }
    : undefined;
  const languages = kind === 'code' ? (config.languages?.length ? config.languages : ['python']) : [];
  const topic = item.topic ?? config.topics?.[0] ?? 'General';

  const imported = isImport
    ? await prisma.question.findFirstOrThrow({ where: { id: item.questionId!, organizationId } })
    : null;
  if (imported && kind !== 'code') {
    return { passed: false, questionId: imported.id, failureReason: 'Only coding (DSA) drafts can be completed automatically.' };
  }

  let questionId = isImport ? null : item.questionId; // for imports the row is only written on success
  let lastDraft: AnyDraft | null = null;
  const avoidTitles = imported ? [] : await titlesToAvoid(organizationId, item.type, questionId);
  const runGraph = kind === 'code' ? runDsaGenerationGraph : runOopsDebateGraph;

  const result = await runGraph<AnyDraft | { __generationError: string }, Validation | null>(
    {
      generate: async ({ attempt, feedback }) => {
        // Checked before every (paid) drafting call, so a cancel stops the spend promptly.
        if (await isCancelled(item.batchId)) throw new BatchCancelledError();
        await setStage(item.id, {
          status: 'GENERATING',
          stage: `Drafting with ${generator.provider} (attempt ${attempt + 1} of ${MAX_ATTEMPTS})`,
          attempts: attempt + 1,
        });
        const prompt = buildDraftPrompt(
          {
            type: item.type,
            difficulty: item.difficulty,
            topic,
            roleLevel: config.roleLevel ?? 'sde1',
            companyStyle: config.companyStyle,
            languages,
            mcqOptionsCount: config.mcqOptionsCount ?? 4,
            avoidTitles,
            fixedStatement: imported ? { title: imported.title, statement: imported.statement } : undefined,
          },
          lastDraft,
          feedback
        );
        try {
          const draft = (await completeJson(generator, prompt, schema, meter)) as AnyDraft;
          lastDraft = draft;
          return draft;
        } catch (err) {
          // Unusable output is the model's mistake to fix on the next attempt.
          // Anything else (provider down, bad key) propagates and retries the job.
          if (!(err instanceof LlmOutputError)) throw err;
          logger.warn(`[Item ${item.id}] Draft attempt ${attempt + 1} unusable: ${err.message}`);
          return { __generationError: err.message };
        }
      },

      validate: async (draft) => {
        if ('__generationError' in draft) {
          return { passed: false, feedback: `Your reply could not be used: ${draft.__generationError}`, validation: null };
        }

        if (!imported) {
          const duplicate = await findDuplicate(draft.statement, organizationId, questionId);
          if (duplicate) {
            return {
              passed: false,
              feedback: `This is too similar to an existing question in the bank ("${duplicate.title}"). Write a different underlying problem, not a rewording.`,
              validation: null,
            };
          }
        }

        const data = buildQuestionData(draft, item.type, item.difficulty, topic, languages);
        let candidate: Question;
        if (imported) {
          // Validate in memory; the imported row is only overwritten once the result is proven.
          candidate = { ...imported, ...data, title: imported.title } as Question;
        } else {
          const persisted = { ...data, status: 'VALIDATING' as const, embeddingVector: computeEmbedding(draft.statement) };
          candidate = questionId
            ? await prisma.question.update({ where: { id: questionId }, data: { ...persisted, retryCount: { increment: 1 } } })
            : await prisma.question.create({ data: { ...persisted, organizationId, sourcePlatform: 'generated' } });
          if (!questionId) {
            questionId = candidate.id;
            await prisma.generationItem.update({ where: { id: item.id }, data: { questionId } });

            // Two parallel jobs can both pass the check above before either has saved its
            // row. Now that this row is visible, look again; of two twins, the one with
            // the larger id yields, so exactly one survives.
            const twin = await findDuplicate(draft.statement, organizationId, questionId);
            if (twin && twin.id < questionId) {
              await prisma.question.update({ where: { id: questionId }, data: { embeddingVector: [] } });
              return {
                passed: false,
                feedback: `This is too similar to an existing question in the bank ("${twin.title}"). Write a different underlying problem, not a rewording.`,
                validation: null,
              };
            }
          }
        }

        await setStage(item.id, { status: 'VALIDATING', stage: 'Validating' });
        const validation = await runValidationPipeline(candidate, {
          languages,
          reviewer,
          blindSolve,
          mcqOptionsCount: config.mcqOptionsCount ?? 4,
          onStage: (stage) => setStage(item.id, { status: 'VALIDATING', stage }),
        });
        return { passed: validation.result.passed, feedback: validation.result.details, validation };
      },
    },
    { maxAttempts: MAX_ATTEMPTS }
  );

  const validation = result.validation;
  const finalDraft = lastDraft as AnyDraft | null;

  if (imported) {
    if (result.passed && validation && finalDraft) {
      const data = buildQuestionData(finalDraft, item.type, item.difficulty, topic, languages);
      await prisma.question.update({
        where: { id: imported.id },
        data: {
          ...data,
          title: imported.title,
          status: 'VALIDATED',
          testCases: (validation.testCases ?? data.testCases) as any,
          validationResult: validation.result as any,
          embeddingVector: computeEmbedding(finalDraft.statement),
        },
      });
      await notifyValidated(organizationId, imported.id, item);
      return { passed: true, questionId: imported.id, failureReason: null };
    }
    // Leave the import as the DRAFT it was; just record why completion failed.
    await prisma.question.update({
      where: { id: imported.id },
      data: { validationResult: (validation?.result as any) ?? undefined },
    });
    return { passed: false, questionId: imported.id, failureReason: result.feedback };
  }

  if (!questionId) {
    logger.warn(`[Item ${item.id}] No usable draft after ${result.attempts} attempt(s): ${result.feedback}`);
    return { passed: false, questionId: null, failureReason: result.feedback };
  }

  if (result.passed && validation) {
    await prisma.question.update({
      where: { id: questionId },
      data: {
        status: 'VALIDATED',
        validationResult: validation.result as any,
        ...(validation.testCases && { testCases: validation.testCases as any }),
      },
    });
    if (item.batch.paperId) await attachToPaper(item.batch.paperId, questionId);
    await notifyValidated(organizationId, questionId, item);
    return { passed: true, questionId, failureReason: null };
  }

  // Keep the failed row for inspection, but drop its vector so it cannot block future drafts as a "duplicate".
  await prisma.question.update({
    where: { id: questionId },
    data: { status: 'FAILED', validationResult: (validation?.result as any) ?? undefined, embeddingVector: [] },
  });
  logger.warn(`[Item ${item.id}] ${item.type}/${item.difficulty} FAILED after ${result.attempts} attempt(s).`);
  return { passed: false, questionId, failureReason: result.feedback };
}

/** REVALIDATE: no drafting — run validation once on the question as it now stands. */
async function revalidateItem(item: ItemWithBatch, orgKeys: OrgLlmKeys, meter: UsageMeter): Promise<ItemOutcome> {
  const config = item.batch.config as unknown as Partial<GenerationWizardConfig>;
  const question = await prisma.question.findFirstOrThrow({
    where: { id: item.questionId!, organizationId: item.batch.organizationId },
  });
  const kind = draftKindFor(question.type);
  const reviewer = kind === 'mcq' || kind === 'design'
    ? { ...getReviewerLLMClient(config.llmProvider ?? defaultProvider(orgKeys), orgKeys), meter }
    : undefined;

  await setStage(item.id, { status: 'VALIDATING', stage: 'Validating', attempts: 1 });
  const { result, testCases } = await runValidationPipeline(question, {
    languages: question.languages,
    reviewer,
    // The edited expected outputs are the reviewer's intent — check them, do not overwrite them.
    trustStatedOutputs: true,
    onStage: (stage) => setStage(item.id, { status: 'VALIDATING', stage }),
  });

  await prisma.question.update({
    where: { id: question.id },
    data: {
      status: result.passed ? 'VALIDATED' : 'FAILED',
      validationResult: result as any,
      ...(result.passed && testCases && { testCases: testCases as any }),
      embeddingVector: result.passed ? computeEmbedding(question.statement) : [],
    },
  });
  if (result.passed) await notifyValidated(question.organizationId, question.id, item);
  return { passed: result.passed, questionId: question.id, failureReason: result.passed ? null : result.details };
}

async function notifyValidated(organizationId: string, questionId: string, item: GenerationItem) {
  await enqueueWebhook(organizationId, {
    event: 'question.validated',
    timestamp: new Date().toISOString(),
    organizationId,
    data: { questionId, type: item.type, difficulty: item.difficulty },
  });
}

/** Live status of a batch, scoped to the caller's organization. Null if it is not theirs or does not exist. */
export async function getBatchStatus(jobId: string, organizationId: string): Promise<GenerationJobStatus | null> {
  const batch = await prisma.generationBatch.findFirst({
    where: { id: jobId, organizationId },
    include: { items: { orderBy: { index: 'asc' } } },
  });
  if (!batch) return null;

  const questionIds = batch.items.map((i) => i.questionId).filter((id): id is string => !!id);
  const questions = questionIds.length
    ? await prisma.question.findMany({ where: { id: { in: questionIds } }, select: { id: true, title: true } })
    : [];
  const titles = new Map(questions.map((q) => [q.id, q.title]));

  const counts = { queued: 0, running: 0, validated: 0, failed: 0 };
  for (const item of batch.items) {
    if (item.status === 'QUEUED') counts.queued++;
    else if (item.status === 'VALIDATED') counts.validated++;
    else if (item.status === 'FAILED') counts.failed++;
    else counts.running++;
  }
  const finished = counts.validated + counts.failed;
  const done = finished === batch.total;
  const provider = (batch.config as any)?.llmProvider as LLMProvider | null | undefined;

  return {
    jobId: batch.id,
    kind: batch.kind,
    state: done ? (counts.validated === 0 ? 'failed' : 'completed') : finished + counts.running === 0 ? 'waiting' : 'active',
    progress: batch.total === 0 ? 100 : Math.round((finished / batch.total) * 100),
    done,
    total: batch.total,
    counts,
    items: batch.items.map((item) => ({
      index: item.index,
      type: item.type,
      difficulty: item.difficulty,
      topic: item.topic,
      status: item.status,
      stage: item.stage,
      attempts: item.attempts,
      failureReason: item.failureReason,
      questionId: item.questionId,
      title: item.questionId ? titles.get(item.questionId) ?? null : null,
    })),
    usage: {
      inputTokens: batch.inputTokens,
      outputTokens: batch.outputTokens,
      // Priced at the generator model's rate; approximate when a different provider did the reviewing.
      costUsd: estimateCostUsd(provider ? modelFor(provider) : undefined, batch.inputTokens, batch.outputTokens),
    },
    createdAt: batch.createdAt.toISOString(),
    finishedAt: batch.finishedAt?.toISOString() ?? null,
    cancelledAt: batch.cancelledAt?.toISOString() ?? null,
  };
}
