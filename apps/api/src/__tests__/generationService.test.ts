import { describe, it, expect, vi } from 'vitest';

// Pure-function tests: keep the module's infrastructure imports inert.
vi.mock('../utils/prisma.js', () => ({ prisma: {} }));
vi.mock('../queues/generationQueue.js', () => ({ generationQueue: {} }));
vi.mock('../queues/webhookQueue.js', () => ({ enqueueWebhook: vi.fn() }));

const { buildGenerationPlan } = await import('../services/generationService.js');
const { buildQuestionData, codeDraftSchema, mcqDraftSchema, sqlDraftSchema, designDraftSchema, draftKindFor } =
  await import('../services/questionDrafts.js');
const { maxSubarrayDraft } = await import('./fixtures/maxSubarray.js');

const plan = (overrides: Record<string, unknown> = {}) =>
  buildGenerationPlan({
    topics: ['Arrays'],
    difficultyDistribution: { easy: 20, medium: 50, hard: 30 },
    totalQuestions: 10,
    questionTypes: ['DSA'],
    ...overrides,
  } as any);

describe('buildGenerationPlan', () => {
  it('splits total questions across difficulties by the configured percentages', () => {
    const result = plan();
    expect(result).toHaveLength(10);
    expect(result.filter((p) => p.difficulty === 'EASY')).toHaveLength(2);
    expect(result.filter((p) => p.difficulty === 'MEDIUM')).toHaveLength(5);
    expect(result.filter((p) => p.difficulty === 'HARD')).toHaveLength(3);
  });

  it('never drops or adds a slot to rounding', () => {
    for (const total of [1, 2, 3, 7, 10, 99]) {
      expect(plan({ totalQuestions: total, difficultyDistribution: { easy: 33, medium: 33, hard: 34 } })).toHaveLength(total);
      expect(plan({ totalQuestions: total, difficultyDistribution: { easy: 50, medium: 50, hard: 0 } })).toHaveLength(total);
    }
  });

  it('spreads question types evenly across the whole plan, not per difficulty band', () => {
    // 1 easy / 1 medium / 1 hard with 3 types: the old per-band cycle produced DSA, DSA, DSA.
    const result = plan({
      totalQuestions: 3,
      difficultyDistribution: { easy: 34, medium: 33, hard: 33 },
      questionTypes: ['DSA', 'SQL', 'MCQ'],
    });
    expect(result.map((p) => p.type).sort()).toEqual(['DSA', 'MCQ', 'SQL']);
  });

  it('anchors each question to one topic, rotating through the list', () => {
    const result = plan({ totalQuestions: 4, topics: ['Arrays', 'Graphs'] });
    expect(result.map((p) => p.topic)).toEqual(['Arrays', 'Graphs', 'Arrays', 'Graphs']);
  });
});

describe('draft schemas', () => {
  it('maps question types to how they are checked', () => {
    expect(draftKindFor('DSA')).toBe('code');
    expect(draftKindFor('SQL')).toBe('sql');
    expect(draftKindFor('SYSTEM_DESIGN')).toBe('design');
    expect(['MCQ', 'OOPS', 'CONCEPTUAL'].map(draftKindFor)).toEqual(['mcq', 'mcq', 'mcq']);
  });

  it('accepts a complete coding draft', () => {
    expect(codeDraftSchema.safeParse(maxSubarrayDraft()).success).toBe(true);
  });

  it('rejects a coding draft without an input generator or with too few test cases', () => {
    const draft = maxSubarrayDraft();
    expect(codeDraftSchema.safeParse({ ...draft, inputGenerator: undefined }).success).toBe(false);
    expect(codeDraftSchema.safeParse({ ...draft, testCases: draft.testCases.slice(0, 2) }).success).toBe(false);
  });

  it('coerces numeric expected outputs to strings', () => {
    const draft = maxSubarrayDraft();
    const parsed = codeDraftSchema.parse({ ...draft, testCases: draft.testCases.map((tc) => ({ ...tc, expectedOutput: Number(tc.expectedOutput) })) });
    expect(parsed.testCases[0].expectedOutput).toBe('7');
  });

  it('rejects an MCQ with no answer, an SQL draft with one dataset, and a 2-line design rubric', () => {
    const mcq = { title: 'Polymorphism', statement: 'Which statement about virtual dispatch is true?', options: [{ id: 'A', text: 'x' }, { id: 'B', text: 'y' }], explanation: 'Because of vtables.' };
    expect(mcqDraftSchema.safeParse(mcq).success).toBe(false);
    expect(mcqDraftSchema.safeParse({ ...mcq, answer: 'A' }).success).toBe(true);

    const sql = { title: 'Top earners', statement: 'Return the highest salary in each department of the company.', ddl: 'CREATE TABLE t(x INT);', datasets: ['INSERT INTO t VALUES (1);'], referenceQuery: 'SELECT 1;', alternativeQuery: 'SELECT 1;', explanation: 'Group by department.' };
    expect(sqlDraftSchema.safeParse(sql).success).toBe(false);

    const design = { title: 'URL shortener', statement: 'Design a URL shortening service handling 10k writes per second and 100k reads per second.', requirements: { functional: ['a', 'b'], nonFunctional: ['c', 'd'] }, rubric: [{ criterion: 'API', points: 50, lookFor: 'x' }, { criterion: 'Storage', points: 50, lookFor: 'y' }], referenceOutline: 'x'.repeat(100), explanation: 'Tests trade-off reasoning.' };
    expect(designDraftSchema.safeParse(design).success).toBe(false);
  });
});

describe('buildQuestionData', () => {
  it('stores solutions, the generator and complexity notes for a coding draft', () => {
    const data = buildQuestionData(codeDraftSchema.parse(maxSubarrayDraft(['python', 'java'])), 'DSA', 'MEDIUM', 'Fallback', ['python', 'java']);
    expect(data.title).toBe('Maximum Subarray Sum');
    expect(data.topic).toBe('Arrays');
    expect(data.languages).toEqual(['python', 'java']);
    expect(Object.keys(data.optimalSolution)).toEqual(['python', 'java']);
    expect(data.validationAssets.inputGenerator).toContain('random.seed');
    expect(data.explanation).toContain('Time Complexity: O(n)');
    expect(data.explanation).toContain('Brute Force: O(n^2)');
  });

  it('stores both queries and the datasets for an SQL draft', () => {
    const draft = sqlDraftSchema.parse({
      title: 'Top earners', statement: 'Return the highest salary in each department of the company.',
      ddl: 'CREATE TABLE t(x INT);', datasets: ['INSERT INTO t VALUES (1);', 'INSERT INTO t VALUES (2);'],
      referenceQuery: 'SELECT MAX(x) FROM t;', alternativeQuery: 'SELECT x FROM t ORDER BY x DESC LIMIT 1;', explanation: 'Aggregate.',
    });
    const data = buildQuestionData(draft, 'SQL', 'EASY', 'SQL', []);
    expect(data.answer).toBe('SELECT MAX(x) FROM t;');
    expect(data.bruteForceSolution).toEqual({ sql: 'SELECT x FROM t ORDER BY x DESC LIMIT 1;' });
    expect(data.validationAssets.sqlDatasets).toHaveLength(2);
    expect(data.topic).toBe('SQL'); // falls back when the draft names no topic
  });
});
