import type { GenerationWizardConfig } from '@question-forge/shared';
interface LLMClient {
    generateQuestion(config: GenerationWizardConfig & {
        difficulty: string;
        questionType: string;
    }): Promise<any>;
}
export declare function getLLMClient(provider: string, _organizationId: string): LLMClient;
export {};
//# sourceMappingURL=llmService.d.ts.map