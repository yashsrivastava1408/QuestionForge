import { describe, it, expect, vi } from 'vitest';
import { runGenerateValidateGraph } from './generateValidateGraph.js';
import { runDsaGenerationGraph } from './dsaGenerationGraph.js';
import { runOopsDebateGraph } from './oopsDebateGraph.js';

describe('Generate → Validate → Retry graph', () => {
  it('passes on the first attempt without retrying', async () => {
    const generate = vi.fn().mockResolvedValue({ text: 'draft-1' });
    const validate = vi.fn().mockResolvedValue({ passed: true, feedback: 'looks good', validation: { score: 100 } });

    const result = await runGenerateValidateGraph({ generate, validate }, { maxAttempts: 3 });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(result.passed).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.draft).toEqual({ text: 'draft-1' });
    expect(result.validation).toEqual({ score: 100 });
  });

  it('retries with feedback when validation fails, then succeeds', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ text: 'draft-1' })
      .mockResolvedValueOnce({ text: 'draft-2 (revised)' });
    const validate = vi
      .fn()
      .mockResolvedValueOnce({ passed: false, feedback: 'missing edge case', validation: { score: 40 } })
      .mockResolvedValueOnce({ passed: true, feedback: 'fixed', validation: { score: 95 } });

    const result = await runGenerateValidateGraph({ generate, validate }, { maxAttempts: 3 });

    expect(generate).toHaveBeenCalledTimes(2);
    // The second generate call must receive the prior draft + feedback for reflection.
    expect(generate).toHaveBeenNthCalledWith(2, {
      attempt: 1,
      previousDraft: { text: 'draft-1' },
      feedback: 'missing edge case',
    });
    expect(result.passed).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.draft).toEqual({ text: 'draft-2 (revised)' });
  });

  it('stops after maxAttempts and reports failure instead of looping forever', async () => {
    const generate = vi.fn().mockImplementation(async ({ attempt }) => ({ text: `draft-${attempt}` }));
    const validate = vi.fn().mockResolvedValue({ passed: false, feedback: 'still broken', validation: { score: 10 } });

    const result = await runGenerateValidateGraph({ generate, validate }, { maxAttempts: 3 });

    expect(generate).toHaveBeenCalledTimes(3);
    expect(validate).toHaveBeenCalledTimes(3);
    expect(result.passed).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.feedback).toBe('still broken');
  });

  it('exposes the same engine through the DSA and OOPS named wrappers', async () => {
    const nodes = {
      generate: vi.fn().mockResolvedValue({ text: 'x' }),
      validate: vi.fn().mockResolvedValue({ passed: true, feedback: 'ok', validation: null }),
    };

    const dsaResult = await runDsaGenerationGraph(nodes, { maxAttempts: 3 });
    const oopsResult = await runOopsDebateGraph(nodes, { maxAttempts: 3 });

    expect(dsaResult.passed).toBe(true);
    expect(oopsResult.passed).toBe(true);
  });
});
