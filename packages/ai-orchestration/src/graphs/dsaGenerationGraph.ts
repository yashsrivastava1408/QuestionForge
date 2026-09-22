/**
 * DSA Generation Graph (LangGraph skeleton)
 * State: Generate → Validate → (if FAIL) → Generate (retry, max 3)
 */
export async function runDsaGenerationGraph(
  config: Record<string, unknown>
): Promise<{ passed: boolean; question: Record<string, unknown> }> {
  return { passed: false, question: {} };
}
