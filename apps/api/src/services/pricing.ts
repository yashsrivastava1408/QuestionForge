/**
 * Turns measured token usage into dollars.
 *
 * Only prices we can source are listed (Anthropic's published first-party rates,
 * USD per million tokens). For anything else set LLM_PRICE_INPUT_PER_MTOK and
 * LLM_PRICE_OUTPUT_PER_MTOK; without them the cost is reported as null rather
 * than guessed.
 */
const PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export function estimateCostUsd(model: string | undefined, inputTokens: number, outputTokens: number): number | null {
  const envIn = Number(process.env.LLM_PRICE_INPUT_PER_MTOK);
  const envOut = Number(process.env.LLM_PRICE_OUTPUT_PER_MTOK);
  const price =
    process.env.LLM_PRICE_INPUT_PER_MTOK && process.env.LLM_PRICE_OUTPUT_PER_MTOK && !isNaN(envIn) && !isNaN(envOut)
      ? { input: envIn, output: envOut }
      : model ? PRICES_PER_MTOK[model] : undefined;
  if (!price) return null;
  return Number(((inputTokens * price.input + outputTokens * price.output) / 1_000_000).toFixed(4));
}
