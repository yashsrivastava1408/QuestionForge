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
}

export interface ValidationPipelineResult {
  questionId: string;
  passed: boolean;
  stages: {
    syntaxCheck: boolean;
    optimalSolutionPassed: boolean;
    bruteForcePassed: boolean;
    crossCheckPassed: boolean;
    edgeCasesPassed: boolean;
    adversaryDebatePassed?: boolean; // OOPS only
  };
  details: string;
  retryCount: number;
}
