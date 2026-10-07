import { describe, it, expect } from 'vitest';
import { reviewMcq, reviewDesign } from '../services/reviewService.js';
import { UsageMeter, type LLMClient } from '../services/llmService.js';

/** A reviewer model that replies with the given strings, in order. */
function scripted(replies: string[]) {
  const prompts: string[] = [];
  const client: LLMClient = {
    provider: 'openai',
    model: 'fake',
    async complete(prompt) {
      prompts.push(prompt);
      const text = replies.shift();
      if (text === undefined) throw new Error('reviewer called more times than scripted');
      return { text, usage: { inputTokens: 100, outputTokens: 10 } };
    },
  };
  return { reviewer: { client, crossModel: true, meter: new UsageMeter() }, prompts };
}

const question = {
  statement: 'In Java, which keyword prevents a method from being overridden?',
  options: [{ id: 'A', text: 'static' }, { id: 'B', text: 'final' }, { id: 'C', text: 'abstract' }, { id: 'D', text: 'private' }],
  answer: 'B',
};
const solve = (answer: string | null, alsoDefensible: string[] = []) =>
  JSON.stringify({ answer, confidence: 'high', reasoning: 'final methods cannot be overridden', alsoDefensible });
const noIssue = JSON.stringify({ foundIssue: false, severity: 'minor', issue: null });

describe('reviewMcq', () => {
  it('passes when the blind solver lands on the key and the adversary finds nothing', async () => {
    const { reviewer, prompts } = scripted([solve('B'), noIssue]);
    const out = await reviewMcq(question, reviewer, 4);
    expect(out.passed).toBe(true);
    expect(out.blindSolvePassed).toBe(true);
    // The blind-solve prompt must not reveal the answer key.
    expect(prompts[0]).not.toMatch(/"answer":\s*"B"/);
    expect(reviewer.meter!.inputTokens).toBe(200);
  });

  it('fails when the blind solver picks a different option than the key', async () => {
    const { reviewer } = scripted([solve('D')]);
    const out = await reviewMcq(question, reviewer, 4);
    expect(out.passed).toBe(false);
    expect(out.blindSolvePassed).toBe(false);
    expect(out.report).toMatch(/chose D, but the key says B/);
  });

  it('fails when the solver says no single option is correct', async () => {
    const { reviewer } = scripted([solve(null)]);
    expect((await reviewMcq(question, reviewer, 4)).passed).toBe(false);
  });

  it('sends a "second option is defensible" concern to the judge, who can fail it', async () => {
    const { reviewer, prompts } = scripted([solve('B', ['D']), noIssue, JSON.stringify({ decision: 'FAIL', reasoning: 'private methods also cannot be overridden' })]);
    const out = await reviewMcq(question, reviewer, 4);
    expect(out.passed).toBe(false);
    expect(prompts[2]).toMatch(/option\(s\) D could also be defended/);
  });

  it('lets the judge overrule a mistaken adversary', async () => {
    const { reviewer } = scripted([
      solve('B'),
      JSON.stringify({ foundIssue: true, severity: 'minor', issue: 'Option text is short.' }),
      JSON.stringify({ decision: 'PASS', reasoning: 'cosmetic only' }),
    ]);
    expect((await reviewMcq(question, reviewer, 4)).passed).toBe(true);
  });

  it('accepts a reply wrapped in a markdown fence', async () => {
    const { reviewer } = scripted(['```json\n' + solve('B') + '\n```', 'Here is my review:\n' + noIssue]);
    expect((await reviewMcq(question, reviewer, 4)).passed).toBe(true);
  });

  it('NEVER passes by default: an unparseable reviewer reply throws instead of approving', async () => {
    const { reviewer } = scripted(['I think this looks fine!', 'Still not JSON.']);
    await expect(reviewMcq(question, reviewer, 4)).rejects.toThrow(/did not return a usable verdict/);
  });

  it('NEVER passes by default: a judge reply with no decision throws', async () => {
    const { reviewer } = scripted([
      solve('B'),
      JSON.stringify({ foundIssue: true, severity: 'major', issue: 'Ambiguous.' }),
      JSON.stringify({ reasoning: 'hmm' }),
      JSON.stringify({ verdict: 'ok' }),
    ]);
    await expect(reviewMcq(question, reviewer, 4)).rejects.toThrow(/did not return a usable verdict/);
  });

  it('rejects structural problems without spending an LLM call', async () => {
    const { reviewer, prompts } = scripted([]);
    expect((await reviewMcq({ ...question, answer: 'E' }, reviewer, 4)).report).toMatch(/not one of the option ids/);
    expect((await reviewMcq(question, reviewer, 5)).report).toMatch(/Expected exactly 5 options, got 4/);
    expect((await reviewMcq({ ...question, options: [...question.options.slice(0, 3), { id: 'D', text: 'final' }] }, reviewer, 4)).report).toMatch(/identical text/);
    expect(prompts).toHaveLength(0);
  });
});

describe('reviewDesign', () => {
  const rubric = [
    { criterion: 'API', points: 25, lookFor: 'x' }, { criterion: 'Data', points: 25, lookFor: 'x' },
    { criterion: 'Scale', points: 25, lookFor: 'x' }, { criterion: 'Trade-offs', points: 25, lookFor: 'x' },
  ];
  const design = { statement: 'Design a URL shortener.', answer: 'outline', validationAssets: { rubric, requirements: {} } };

  it('rejects a rubric that does not total 100 before calling the reviewer', async () => {
    const { reviewer, prompts } = scripted([]);
    const out = await reviewDesign({ ...design, validationAssets: { rubric: rubric.slice(0, 3) } }, reviewer);
    expect(out.passed).toBe(false);
    expect(prompts).toHaveLength(0);
  });

  it('passes a sound rubric when the adversary finds nothing', async () => {
    const { reviewer } = scripted([noIssue]);
    expect((await reviewDesign(design, reviewer)).passed).toBe(true);
  });
});
