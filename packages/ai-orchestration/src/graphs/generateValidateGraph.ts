/**
 * Generate → Validate → Retry state machine.
 *
 * This is the real LangGraph engine behind both `dsaGenerationGraph.ts` and
 * `oopsDebateGraph.ts`. Both question types share the exact same control
 * flow — draft something, judge it, and either ship it or feed the critique
 * back into another draft — so the graph itself is written once here and
 * specialized per question type by the two thin wrappers next to this file.
 *
 * The graph never talks to an LLM, a database, or the sandbox directly: the
 * caller injects `generate` and `validate` as plain async functions. That
 * keeps this package framework-only and unit-testable without network
 * access, and lets `apps/api` supply the real Anthropic/OpenAI/Gemini calls
 * and Prisma writes as node implementations.
 */
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';

export interface GenerateResult<TDraft> {
  draft: TDraft;
}

export interface ValidateResult<TValidation> {
  passed: boolean;
  feedback: string;
  validation: TValidation;
}

export interface GenerateValidateNodes<TDraft, TValidation> {
  /**
   * Produce (or revise) a draft. `attempt` is 0 on the first call.
   * `previousDraft`/`feedback` are populated on every retry so the
   * implementation can do reflection-based revision instead of starting
   * from scratch.
   */
  generate: (input: {
    attempt: number;
    previousDraft: TDraft | null;
    feedback: string | null;
  }) => Promise<TDraft>;
  /** Judge a draft. Returning `passed: false` triggers another `generate` call, up to `maxAttempts`. */
  validate: (draft: TDraft) => Promise<ValidateResult<TValidation>>;
}

const GraphState = Annotation.Root({
  maxAttempts: Annotation<number>,
  attempt: Annotation<number>({ reducer: (_prev, next) => next, default: () => 0 }),
  draft: Annotation<unknown>({ reducer: (_prev, next) => next, default: () => null }),
  feedback: Annotation<string | null>({ reducer: (_prev, next) => next, default: () => null }),
  passed: Annotation<boolean>({ reducer: (_prev, next) => next, default: () => false }),
  validation: Annotation<unknown>({ reducer: (_prev, next) => next, default: () => null }),
});

export function compileGenerateValidateGraph<TDraft, TValidation>(
  nodes: GenerateValidateNodes<TDraft, TValidation>
) {
  return new StateGraph(GraphState)
    .addNode('generate', async (state) => {
      const draft = await nodes.generate({
        attempt: state.attempt,
        previousDraft: (state.draft as TDraft | null) ?? null,
        feedback: state.feedback,
      });
      return { draft, attempt: state.attempt + 1 };
    })
    .addNode('validate', async (state) => {
      const outcome = await nodes.validate(state.draft as TDraft);
      return {
        passed: outcome.passed,
        feedback: outcome.feedback,
        validation: outcome.validation,
      };
    })
    .addEdge(START, 'generate')
    .addEdge('generate', 'validate')
    .addConditionalEdges('validate', (state) => {
      if (state.passed) return END;
      if (state.attempt >= state.maxAttempts) return END;
      return 'generate';
    })
    .compile();
}

export interface GenerateValidateRunResult<TDraft, TValidation> {
  passed: boolean;
  draft: TDraft | null;
  validation: TValidation | null;
  attempts: number;
  feedback: string | null;
}

/**
 * Runs the graph to completion (a single `invoke` covers the whole retry
 * loop — LangGraph re-enters `generate` internally via the conditional edge
 * above, we don't loop in application code).
 */
export async function runGenerateValidateGraph<TDraft, TValidation>(
  nodes: GenerateValidateNodes<TDraft, TValidation>,
  options: { maxAttempts?: number } = {}
): Promise<GenerateValidateRunResult<TDraft, TValidation>> {
  const graph = compileGenerateValidateGraph(nodes);
  const finalState = await graph.invoke({
    maxAttempts: options.maxAttempts ?? 3,
  });

  return {
    passed: finalState.passed,
    draft: (finalState.draft as TDraft) ?? null,
    validation: (finalState.validation as TValidation) ?? null,
    attempts: finalState.attempt,
    feedback: finalState.feedback,
  };
}
