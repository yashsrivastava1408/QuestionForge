import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { runValidationPipeline } from './validationService.js';
import { checkDuplicate } from './deduplicationService.js';
import { getLLMClient } from './llmService.js';
import { triggerWebhook } from '../routes/webhooks.js';
// Builds jobs in the background — doesn't block the HTTP response
export async function runGenerationPipeline(config) {
    const jobId = uuidv4();
    // Fire and forget — runs asynchronously
    _runPipelineAsync(jobId, config).catch((err) => logger.error('Generation pipeline error', { jobId, error: err.message }));
    return jobId;
}
async function _runPipelineAsync(jobId, config) {
    logger.info(`[Job ${jobId}] Starting generation for org ${config.organizationId}`);
    const llm = getLLMClient(config.llmProvider, config.organizationId);
    const difficultyPlan = buildDifficultyPlan(config);
    for (const { difficulty, type } of difficultyPlan) {
        let retries = 0;
        let success = false;
        while (retries < 3 && !success) {
            try {
                logger.info(`[Job ${jobId}] Generating ${type} / ${difficulty} (attempt ${retries + 1})`);
                const rawQuestion = await llm.generateQuestion({ ...config, difficulty, questionType: type });
                // Deduplication check
                const isDuplicate = await checkDuplicate(rawQuestion.statement, config.organizationId);
                if (isDuplicate) {
                    logger.warn(`[Job ${jobId}] Duplicate detected, skipping.`);
                    retries++;
                    continue;
                }
                // Save as DRAFT
                const saved = await prisma.question.create({
                    data: {
                        ...rawQuestion,
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
                        data: { status: 'VALIDATED', validationResult: validationResult },
                    });
                    // Trigger webhook if configured
                    await triggerWebhook(config.organizationId, {
                        event: 'question.approved',
                        timestamp: new Date().toISOString(),
                        organizationId: config.organizationId,
                        data: { questionId: saved.id, type, difficulty },
                    });
                    success = true;
                }
                else {
                    retries++;
                    if (retries >= 3) {
                        await prisma.question.update({
                            where: { id: saved.id },
                            data: { status: 'FAILED', validationResult: validationResult },
                        });
                        logger.warn(`[Job ${jobId}] Question failed after 3 retries. Marked FAILED.`);
                    }
                }
            }
            catch (err) {
                logger.error(`[Job ${jobId}] Error in generation attempt`, { error: err.message });
                retries++;
            }
        }
    }
    logger.info(`[Job ${jobId}] Pipeline complete.`);
}
function buildDifficultyPlan(config) {
    const plan = [];
    const { easy, medium, hard } = config.difficultyDistribution;
    const easyCount = Math.round(config.totalQuestions * (easy / 100));
    const mediumCount = Math.round(config.totalQuestions * (medium / 100));
    const hardCount = config.totalQuestions - easyCount - mediumCount;
    const typeCycle = [...config.questionTypes];
    const addItems = (count, difficulty) => {
        for (let i = 0; i < count; i++) {
            plan.push({ difficulty, type: typeCycle[i % typeCycle.length] });
        }
    };
    addItems(easyCount, 'EASY');
    addItems(mediumCount, 'MEDIUM');
    addItems(hardCount, 'HARD');
    return plan;
}
//# sourceMappingURL=generationService.js.map