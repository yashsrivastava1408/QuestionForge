/**
 * LeetCode Ingestion Adapter
 *
 * Uses LeetCode's unofficial GraphQL API to fetch problem data.
 * Normalizes it to the Question Forge schema.
 *
 * NOTE: Respects robots.txt. Use only for internal/educational purposes.
 * Rate limit: 1 request per 2 seconds.
 */
export interface IngestedQuestion {
    title: string;
    statement: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    type: 'DSA';
    topic: string;
    tags: string[];
    sourceUrl: string;
    sourcePlatform: 'leetcode';
    languages: string[];
}
export declare class LeetCodeAdapter {
    private baseUrl;
    private delay;
    fetchQuestion(titleSlug: string): Promise<IngestedQuestion | null>;
    fetchByCategory(category: string, limit?: number): Promise<IngestedQuestion[]>;
}
//# sourceMappingURL=leetcode.d.ts.map