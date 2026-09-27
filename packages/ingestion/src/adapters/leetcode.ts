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
  sourcePlatform: 'leetcode' | 'gfg';
  languages: string[];
}

export class LeetCodeAdapter {
  private baseUrl = 'https://leetcode.com/graphql';
  private delay: number;

  constructor(delayMs = 2000) {
    this.delay = delayMs;
  }

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

  /**
   * Fetches up to `limit` problem slugs tagged with `category` (e.g. "array",
   * "dynamic-programming") via LeetCode's problem-list GraphQL query, then
   * ingests each one through `fetchQuestion` (which already rate-limits
   * itself). A failure fetching the list, or any individual question,
   * degrades to fewer results rather than throwing.
   */
  async fetchByCategory(category: string, limit = 20): Promise<IngestedQuestion[]> {
    const listQuery = `
      query problemsetQuestionList($limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
        problemsetQuestionList: questionList(categorySlug: "", limit: $limit, skip: $skip, filters: $filters) {
          questions: data {
            titleSlug
          }
        }
      }
    `;

    let slugs: string[] = [];
    try {
      const resp = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Referer': 'https://leetcode.com' },
        body: JSON.stringify({
          query: listQuery,
          variables: {
            limit,
            skip: 0,
            filters: category ? { tags: [category] } : {},
          },
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as any;
        slugs = (data?.data?.problemsetQuestionList?.questions ?? []).map((q: any) => q.titleSlug);
      }
    } catch {
      return [];
    }

    const results: IngestedQuestion[] = [];
    for (const slug of slugs) {
      const question = await this.fetchQuestion(slug);
      if (question) results.push(question);
    }
    return results;
  }
}
