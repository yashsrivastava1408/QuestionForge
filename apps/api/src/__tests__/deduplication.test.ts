import { describe, it, expect } from 'vitest';
import { computeEmbedding } from '../services/deduplicationService.js';

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, idx) => sum + val * b[idx], 0);
}

describe('Vector Deduplication & Feature Hashing', () => {
  it('generates a deterministic 256-dimensional vector', () => {
    const text = 'Given an array of integers, return indices of the two numbers such that they add up to target.';
    const vec1 = computeEmbedding(text);
    const vec2 = computeEmbedding(text);

    expect(vec1).toHaveLength(256);
    expect(vec2).toHaveLength(256);
    expect(vec1).toEqual(vec2);
  });

  it('normalizes the embedding vector with L2 norm ~ 1.0', () => {
    const text = 'Implement a binary search tree with insertion and deletion operations in logarithmic time.';
    const vec = computeEmbedding(text);
    const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));

    expect(magnitude).toBeCloseTo(1.0, 2);
  });

  it('yields high similarity for near-identical statements and lower for distinct topics', () => {
    const base = 'Find the maximum subarray sum using Kadane algorithm with dynamic programming.';
    const similar = 'Calculate maximum contiguous subarray sum using Kadane algorithm in linear time.';
    const different = 'Design a distributed rate limiter using Redis token bucket algorithm with sliding window.';

    const vecBase = computeEmbedding(base);
    const vecSimilar = computeEmbedding(similar);
    const vecDifferent = computeEmbedding(different);

    const simNear = dotProduct(vecBase, vecSimilar);
    const simDiff = dotProduct(vecBase, vecDifferent);

    expect(simNear).toBeGreaterThan(simDiff);
    expect(simNear).toBeGreaterThan(0.4);
  });

  it('returns zero vector for empty or purely stopword inputs without throwing', () => {
    const emptyVec = computeEmbedding('');
    expect(emptyVec).toHaveLength(256);
    expect(emptyVec.every(v => v === 0)).toBe(true);

    const stopwordVec = computeEmbedding('the and or in on at to for with by');
    expect(stopwordVec).toHaveLength(256);
    expect(stopwordVec.every(v => v === 0)).toBe(true);
  });
});
