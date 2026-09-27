import { describe, it, expect } from 'vitest';
import { buildDifficultyPlan, buildQuestionData } from '../services/generationService.js';
import type { GenerationWizardConfig } from '@question-forge/shared';

function baseConfig(overrides: Partial<GenerationWizardConfig> = {}): GenerationWizardConfig {
  return {
    organizationId: 'org-1',
    requestedBy: 'user-1',
    roleLevel: 'sde2',
    topics: ['Arrays'],
    difficultyDistribution: { easy: 20, medium: 50, hard: 30 },
    totalQuestions: 10,
    questionTypes: ['DSA'],
    languages: ['python', 'java'],
    llmProvider: 'anthropic',
    ...overrides,
  };
}

describe('buildDifficultyPlan', () => {
  it('splits total questions across difficulties by the configured percentages', () => {
    const plan = baseConfig();
    const result = buildDifficultyPlan(plan);

    expect(result).toHaveLength(10);
    expect(result.filter((p) => p.difficulty === 'EASY')).toHaveLength(2);
    expect(result.filter((p) => p.difficulty === 'MEDIUM')).toHaveLength(5);
    expect(result.filter((p) => p.difficulty === 'HARD')).toHaveLength(3);
  });

  it('cycles through multiple question types within each difficulty band', () => {
    const config = baseConfig({
      totalQuestions: 4,
      difficultyDistribution: { easy: 100, medium: 0, hard: 0 },
      questionTypes: ['DSA', 'OOPS'],
    });

    const result = buildDifficultyPlan(config);

    expect(result.map((p) => p.type)).toEqual(['DSA', 'OOPS', 'DSA', 'OOPS']);
  });

  it('assigns every leftover question to HARD so rounding never drops a slot', () => {
    // 33/33/34 of 10 -> easy=3 (round(3.3)), medium=3 (round(3.3)), hard = 10-3-3 = 4
    const config = baseConfig({ difficultyDistribution: { easy: 33, medium: 33, hard: 34 } });
    const result = buildDifficultyPlan(config);

    expect(result).toHaveLength(10);
  });
});

describe('buildQuestionData', () => {
  it('extracts known columns and folds complexity notes into the explanation', () => {
    const raw = {
      title: 'Two Sum',
      statement: 'Given an array...',
      explanation: 'Use a hashmap.',
      timeComplexity: 'O(n)',
      spaceComplexity: 'O(n)',
      optimalSolution: { python: 'def f(): ...' },
      bruteForceSolution: { python: 'def g(): ...' },
      testCases: [{ input: '[]', expectedOutput: '[]' }],
      languages: ['python'],
      tags: ['array'],
      topic: 'Arrays',
    };

    const data = buildQuestionData(raw, 'DSA', 'EASY', baseConfig());

    expect(data.title).toBe('Two Sum');
    expect(data.explanation).toBe('Use a hashmap.\n\nTime Complexity: O(n)\n\nSpace Complexity: O(n)');
    expect(data.languages).toEqual(['python']);
    expect(data.topic).toBe('Arrays');
  });

  it('falls back to placeholder title/topic when the LLM omits them', () => {
    const data = buildQuestionData({ statement: 'stub' }, 'OOPS', 'HARD', baseConfig({ topics: ['Design'] }));

    expect(data.title).toBe('OOPS Question (HARD)');
    expect(data.topic).toBe('Design');
    expect(data.languages).toEqual(['python', 'java']); // falls back to config.languages
  });
});
