import type { Question } from '@prisma/client';
interface DebateResult {
    passed: boolean;
    report: string;
}
export declare function runAdversarialDebate(question: Question): Promise<DebateResult>;
export {};
//# sourceMappingURL=agentDebateService.d.ts.map