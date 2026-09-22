/**
 * OOPS Adversarial Debate Graph (LangGraph)
 *
 * State machine: Generator → Adversary → Judge → (if FAIL) → Generator (retry)
 *
 * Nodes:
 *  - generator: Creates the OOPS question
 *  - adversary: Challenges the question for ambiguity / errors
 *  - judge: Decides PASS or FAIL based on debate
 *
 * Edges:
 *  - generator → adversary
 *  - adversary → judge
 *  - judge: if PASS → END, if FAIL and retries < 3 → generator
 */
export declare function runOopsDebateGraph(questionPrompt: string, maxIterations?: number): Promise<{
    passed: boolean;
    content: string;
    report: string;
}>;
//# sourceMappingURL=oopsDebateGraph.d.ts.map