import type { QuestionType } from './question.js';
export type LLMProvider = 'anthropic' | 'openai' | 'gemini';
export interface GenerationWizardConfig {
    organizationId: string;
    requestedBy: string;
    roleLevel: 'intern' | 'sde1' | 'sde2' | 'senior' | 'lead';
    topics: string[];
    difficultyDistribution: {
        easy: number;
        medium: number;
        hard: number;
    };
    totalQuestions: number;
    questionTypes: QuestionType[];
    languages: string[];
    companyStyle?: string;
    llmProvider: LLMProvider;
    paperId?: string;
}
export interface GenerationJobStatus {
    jobId: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    totalRequested: number;
    generated: number;
    validated: number;
    failed: number;
    estimatedTokens?: number;
    estimatedCostUsd?: number;
    startedAt?: string;
    completedAt?: string;
}
//# sourceMappingURL=generation.d.ts.map