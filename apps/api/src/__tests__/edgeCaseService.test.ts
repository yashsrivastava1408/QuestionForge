import { describe, it, expect } from 'vitest';
import { injectEdgeCases } from '../services/edgeCaseService.js';

describe('injectEdgeCases', () => {
  it('adds array boundary cases for an array-topic question', () => {
    const result = injectEdgeCases([], 'Subarray Sum');
    const inputs = result.map((tc) => tc.input);

    expect(inputs).toContain('[]');
    expect(inputs).toContain('[0]');
    expect(result.every((tc) => tc.isEdgeCase || !tc.isEdgeCase)).toBe(true);
  });

  it('adds string boundary cases for a string-topic question', () => {
    const result = injectEdgeCases([], 'Longest Palindromic Substring');
    const inputs = result.map((tc) => tc.input);

    expect(inputs).toContain('""');
    expect(inputs).toContain('"a"');
  });

  it('does not duplicate an edge case that already exists in the base test cases', () => {
    const base = [{ input: '[]', expectedOutput: '0', label: 'Existing empty case' }];
    const result = injectEdgeCases(base, 'Array Rotation');

    const emptyArrayCases = result.filter((tc) => tc.input === '[]');
    expect(emptyArrayCases).toHaveLength(1);
    expect(emptyArrayCases[0].label).toBe('Existing empty case');
  });

  it('adds nothing extra for a topic that matches no known category', () => {
    const result = injectEdgeCases([{ input: '5', expectedOutput: '5' }], 'Bit Manipulation Trick');
    expect(result).toHaveLength(1);
  });
});
