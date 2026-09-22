import type { QuestionType, Difficulty } from './question.js';

export type LLMProvider = 'anthropic' | 'openai' | 'gemini';

export interface GenerationWizardConfig {
  organizationId: string;
  requestedBy: string;
  roleLevel: 'intern' | 'sde1' | 'sde2' | 'senior' | 'lead';
  topics: string[];
  difficultyDistribution: {
    easy: number;   // percentage e.g. 20
    medium: number; // percentage e.g. 50
    hard: number;   // percentage e.g. 30
  };
  totalQuestions: number;
  questionTypes: QuestionType[];
  languages: string[];           // ["python", "java", "cpp", "javascript"]
  companyStyle?: string;         // e.g. "google", "amazon", "service-based"
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
