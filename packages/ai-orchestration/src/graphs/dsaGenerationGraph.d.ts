/**
 * DSA Generation Graph (LangGraph skeleton)
 * State: Generate → Validate → (if FAIL) → Generate (retry, max 3)
 */
export declare function runDsaGenerationGraph(config: Record<string, unknown>): Promise<{
    passed: boolean;
    question: Record<string, unknown>;
}>;
//# sourceMappingURL=dsaGenerationGraph.d.ts.map