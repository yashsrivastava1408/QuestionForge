export type QuestionType = 'DSA' | 'OOPS' | 'SYSTEM_DESIGN' | 'SQL' | 'CONCEPTUAL' | 'MCQ';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type QuestionStatus =
  | 'DRAFT'
  | 'VALIDATING'
  | 'VALIDATED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'FAILED';

export interface TestCase {
  input: string;
  expectedOutput: string;
  label?: string;
  isEdgeCase?: boolean;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export interface ValidationResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  errorMessage?: string;
  executionTimeMs?: number;
  crossCheckPassed?: boolean; // brute vs optimal match
  adversaryReport?: string;  // OOPS agent debate result
}

export interface Question {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  topic: string;
  title: string;
  statement: string;
  options?: QuestionOption[];
  answer?: string;
  explanation?: string;
  optimalSolution?: string;
  bruteForceSolution?: string;
  testCases?: TestCase[];
  languages: string[];
  tags: string[];
  sourceUrl?: string;
  sourcePlatform?: string;
  status: QuestionStatus;
  validationResult?: ValidationResult;
  version: number;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}
