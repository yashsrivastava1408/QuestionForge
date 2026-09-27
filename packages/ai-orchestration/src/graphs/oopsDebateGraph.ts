/**
 * OOPS Adversarial Debate Graph
 * State: Generate → Debate (Adversary + Judge) → (if FAIL) → Generate (retry, max N)
 *
 * Conceptual/OOPS questions don't get sandbox-executed — instead the
 * "validate" step is a cross-model adversarial debate (see
 * `apps/api/src/services/agentDebateService.ts`, which implements the
 * Adversary and Judge prompts against a *different* LLM provider than the
 * one that generated the draft). This module is the same retry state
 * machine as `dsaGenerationGraph.ts`, just named and typed for that use
 * case — both are built on `generateValidateGraph.ts`.
 */
import {
  runGenerateValidateGraph,
  type GenerateValidateNodes,
  type GenerateValidateRunResult,
} from './generateValidateGraph.js';

export type OopsDebateNodes<TDraft, TValidation> = GenerateValidateNodes<TDraft, TValidation>;
export type OopsDebateResult<TDraft, TValidation> = GenerateValidateRunResult<TDraft, TValidation>;

export async function runOopsDebateGraph<TDraft, TValidation>(
  nodes: OopsDebateNodes<TDraft, TValidation>,
  options: { maxAttempts?: number } = {}
): Promise<OopsDebateResult<TDraft, TValidation>> {
  return runGenerateValidateGraph(nodes, options);
}
