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
  mcqOptionsCount?: number;
}

export type GenerationKind = 'GENERATE' | 'COMPLETE_IMPORT' | 'REVALIDATE';
export type GenerationItemStatus = 'QUEUED' | 'GENERATING' | 'VALIDATING' | 'VALIDATED' | 'FAILED';

export interface GenerationItemSnapshot {
  index: number;
  type: QuestionType;
  difficulty: Difficulty;
  topic: string | null;
  status: GenerationItemStatus;
  /** Human-readable current step, e.g. "Sandbox: differential testing". */
  stage: string | null;
  attempts: number;
  failureReason: string | null;
  questionId: string | null;
  title: string | null;
}

/** Shape returned by GET /api/generate/status/:jobId and each SSE frame. */
export interface GenerationJobStatus {
  jobId: string;
  kind: GenerationKind;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  /** 0–100: share of items that reached a final state. */
  progress: number;
  done: boolean;
  total: number;
  counts: { queued: number; running: number; validated: number; failed: number };
  items: GenerationItemSnapshot[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** null when no price is known for the provider/model (see pricing.ts). */
    costUsd: number | null;
  };
  createdAt: string;
  finishedAt: string | null;
  cancelledAt: string | null;
}
