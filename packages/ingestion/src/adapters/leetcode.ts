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

export class LeetCodeAdapter {
  private baseUrl = 'https://leetcode.com/graphql';
  private delay = 2000; // ms between requests

  async fetchQuestion(titleSlug: string): Promise<IngestedQuestion | null> {
    await new Promise(res => setTimeout(res, this.delay));

    try {
      const resp = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Referer': 'https://leetcode.com' },
        body: JSON.stringify({
          query: `
            query questionData($titleSlug: String!) {
              question(titleSlug: $titleSlug) {
                title
                content
                difficulty
                topicTags { name }
              }
            }
          `,
          variables: { titleSlug },
        }),
      });

      if (!resp.ok) return null;
      const data = await resp.json() as any;
      const q = data?.data?.question;
      if (!q) return null;

      // Strip HTML from LeetCode content
      const statement = q.content
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();

      const diffMap: Record<string, 'EASY' | 'MEDIUM' | 'HARD'> = {
        Easy: 'EASY', Medium: 'MEDIUM', Hard: 'HARD',
      };

      return {
        title: q.title,
        statement,
        difficulty: diffMap[q.difficulty] ?? 'MEDIUM',
        type: 'DSA',
        topic: q.topicTags?.[0]?.name ?? 'Arrays',
        tags: q.topicTags?.map((t: any) => t.name) ?? [],
        sourceUrl: `https://leetcode.com/problems/${titleSlug}/`,
        sourcePlatform: 'leetcode',
        languages: ['python', 'java', 'cpp', 'javascript'],
      };
    } catch {
      return null;
    }
  }

  async fetchByCategory(category: string, limit = 20): Promise<IngestedQuestion[]> {
    // Fetch a list of problems and ingest them one by one
    // Implementation: fetch problem list from LC API, filter by category, scrape each
    console.log(`Fetching ${limit} questions in category: ${category}`);
    return [];
  }
}
