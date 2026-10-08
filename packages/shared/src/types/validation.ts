export interface SandboxExecutionRequest {
  language: string;
  version: string;
  code: string;
  stdin?: string;
  timeoutMs?: number;
}

export interface SandboxExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  executionTimeMs: number;
  /**
   * True when the sandbox itself could not run the code (unreachable, 5xx, unknown
   * runtime). This is NOT a verdict on the code — callers must not treat it as a
   * failing solution, or an outage gets reported as "the question is wrong".
   */
  infraError?: boolean;
}

export type ComplexityGap = 'confirmed' | 'not_observed' | 'not_checked';

export interface ValidationStats {
  /** Hand-written cases that came with the draft. */
  listedCases: number;
  /** Cases produced by running the draft's input generator in the sandbox. */
  generatedCases: number;
  /** Total sandbox executions performed. */
  sandboxRuns: number;
  /** Listed cases whose LLM-stated expected output was replaced by the executed result. */
  expectedOutputCorrections: number;
  complexityGap: ComplexityGap;
  optimalLargeMs?: number;
  bruteLargeMs?: number;
  bruteLargeTimedOut?: boolean;
  /**
   * Result of the independent solver: a second model writes a solution from the
   * statement alone and it is run on the verified test cases.
   *  agreed       – it reproduced every expected output
   *  disagreed    – it ran but printed different answers (the draft is rejected)
   *  inconclusive – it produced nothing runnable, so it proves nothing either way
   *  skipped      – not run (disabled, or no reviewer model available)
   */
  blindSolver?: 'agreed' | 'disagreed' | 'inconclusive' | 'skipped';
}

export interface ValidationPipelineResult {
  questionId: string;
  passed: boolean;
  /**
   * How the question was checked. 'llm_review' means no code was executed;
   * 'sandbox_snippet' means the code shown in the question was run and its real
   * output matched the answer key, on top of the model review.
   */
  method: 'sandbox_differential' | 'sandbox_sql' | 'sandbox_snippet' | 'llm_review';
  stages: {
    syntaxCheck: boolean;
    optimalSolutionPassed: boolean;
    bruteForcePassed: boolean;
    crossCheckPassed: boolean;
    edgeCasesPassed: boolean;
    complexityGapPassed?: boolean; // DSA only
    blindSolvePassed?: boolean; // MCQ: reviewer picked the key; DSA: independent solver matched the outputs
    adversaryDebatePassed?: boolean; // LLM-reviewed types only
  };
  /** Mirrors stages.crossCheckPassed — kept top-level for the review UI. */
  crossCheckPassed: boolean;
  /** True when the reviewer model came from a different provider than the generator. */
  crossModel?: boolean;
  stats?: ValidationStats;
  details: string;
  retryCount: number;
}
