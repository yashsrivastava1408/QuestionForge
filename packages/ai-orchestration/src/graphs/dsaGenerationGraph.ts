/**
 * DSA Generation Graph
 * State: Generate → Validate (sandbox differential test) → (if FAIL) → Generate (retry, max N)
 *
 * A thin, DSA-flavored type layer over the shared LangGraph engine in
 * `generateValidateGraph.ts`. `apps/api`'s `generationService.ts` supplies
 * the real `generate` (LLM call) and `validate` (dedup + sandbox execution)
 * implementations; this module only owns the retry state machine.
 */
import {
  runGenerateValidateGraph,
  type GenerateValidateNodes,
  type GenerateValidateRunResult,
} from './generateValidateGraph.js';

export type DsaGenerationNodes<TDraft, TValidation> = GenerateValidateNodes<TDraft, TValidation>;
export type DsaGenerationResult<TDraft, TValidation> = GenerateValidateRunResult<TDraft, TValidation>;

export async function runDsaGenerationGraph<TDraft, TValidation>(
  nodes: DsaGenerationNodes<TDraft, TValidation>,
  options: { maxAttempts?: number } = {}
): Promise<DsaGenerationResult<TDraft, TValidation>> {
  return runGenerateValidateGraph(nodes, options);
}
