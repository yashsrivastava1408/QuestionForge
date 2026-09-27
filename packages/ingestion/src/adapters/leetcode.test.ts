import { describe, it, expect, vi, afterEach } from 'vitest';
import { LeetCodeAdapter } from './leetcode.js';

describe('LeetCodeAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('fetchQuestion', () => {
    it('normalizes a LeetCode GraphQL response into an IngestedQuestion', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            question: {
              title: 'Two Sum',
              content: '<p>Given an array&nbsp;of integers, return &lt;indices&gt;.</p>',
              difficulty: 'Easy',
              topicTags: [{ name: 'Array' }, { name: 'Hash Table' }],
            },
          },
        }),
      }) as any;

      const adapter = new LeetCodeAdapter(0);
      const result = await adapter.fetchQuestion('two-sum');

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Two Sum');
      expect(result!.difficulty).toBe('EASY');
      expect(result!.statement).not.toContain('<p>');
      expect(result!.statement).not.toContain('&nbsp;');
      expect(result!.tags).toEqual(['Array', 'Hash Table']);
      expect(result!.sourcePlatform).toBe('leetcode');
      expect(result!.sourceUrl).toBe('https://leetcode.com/problems/two-sum/');
    });

    it('returns null when LeetCode responds with no question data', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { question: null } }) }) as any;
      const adapter = new LeetCodeAdapter(0);
      expect(await adapter.fetchQuestion('does-not-exist')).toBeNull();
    });

    it('returns null instead of throwing on a network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
      const adapter = new LeetCodeAdapter(0);
      expect(await adapter.fetchQuestion('two-sum')).toBeNull();
    });
  });

  describe('fetchByCategory', () => {
    it('fetches the problem list then ingests each slug', async () => {
      const fetchMock = vi.fn();
      // First call: the problem-list query.
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { problemsetQuestionList: { questions: [{ titleSlug: 'two-sum' }, { titleSlug: 'add-two-numbers' }] } },
        }),
      });
      // Subsequent calls: one per-question fetch.
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            question: {
              title: 'Some Problem',
              content: '<p>Body</p>',
              difficulty: 'Medium',
              topicTags: [{ name: 'Array' }],
            },
          },
        }),
      });
      global.fetch = fetchMock as any;

      const adapter = new LeetCodeAdapter(0);
      const results = await adapter.fetchByCategory('array', 2);

      expect(results).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(3); // 1 list + 2 questions
    });

    it('returns an empty array when the list query fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
      const adapter = new LeetCodeAdapter(0);
      expect(await adapter.fetchByCategory('array')).toEqual([]);
    });
  });
});
