import { describe, it, expect, vi } from 'vitest';

vi.mock('../utils/prisma.js', () => ({ prisma: {} }));
vi.mock('../utils/redis.js', () => ({ redisClient: {} }));

const { classifyFailure } = await import('../controllers/analyticsController.js');

describe('classifyFailure', () => {
  it.each([
    ['Cancelled by a user before it finished.', 'Cancelled'],
    ['Gave up after 3 attempts: 503 Service Unavailable', 'Infrastructure (LLM or sandbox unavailable)'],
    ['This is too similar to an existing question in the bank ("Two Sum").', 'Duplicate of an existing question'],
    ['Difficulty check failed: on the maximum-size input the brute force finished in 40ms', 'Not as hard as labelled (no brute-force gap)'],
    ['An independent solver that saw ONLY the statement wrote a program that disagrees', 'Independent solver disagreed (ambiguous or wrong)'],
    ['A worked example in the statement disagrees with what every solution prints.', 'Stated examples do not match execution'],
    ['Differential testing found 2 disagreement(s) between solutions.', 'Solutions failed sandbox testing'],
    ['The two queries return different rows on dataset 2', 'SQL queries disagreed or failed'],
    ['Blind solve agreed with the key (B). Reviewer concern (major): ambiguous. Judge: FAIL', 'Rejected by LLM review'],
    ['Your reply could not be used: Model reply did not contain a valid JSON object.', 'Unusable model output'],
    [null, 'Other'],
  ])('%s → %s', (reason, bucket) => {
    expect(classifyFailure(reason)).toBe(bucket);
  });
});
