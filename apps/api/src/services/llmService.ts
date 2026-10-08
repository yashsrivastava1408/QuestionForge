import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { z } from 'zod';
import type { LLMProvider } from '@question-forge/shared';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { extractJsonObject } from '../utils/json.js';
import { decryptSecret } from '../utils/crypto.js';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Accumulates real token usage across every call made for one generation item. */
export class UsageMeter implements LlmUsage {
  inputTokens = 0;
  outputTokens = 0;
  add(usage: LlmUsage) {
    this.inputTokens += usage.inputTokens;
    this.outputTokens += usage.outputTokens;
  }
}

export interface LLMClient {
  readonly provider: LLMProvider;
  readonly model: string;
  /** Sends one prompt and returns the raw text reply plus measured token usage. */
  complete(prompt: string, options?: { maxTokens?: number }): Promise<{ text: string; usage: LlmUsage }>;
}

/**
 * The model answered, but not with something usable (not JSON, wrong shape,
 * cut off, refused). Retrying the same call with feedback can fix it, unlike a
 * provider outage — so this is handled inside the generate → validate loop.
 */
export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmOutputError';
  }
}

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-4o',
  gemini: 'gemini-flash-lite-latest',
};

const MODEL_ENV: Record<LLMProvider, string> = {
  anthropic: 'ANTHROPIC_MODEL',
  openai: 'OPENAI_MODEL',
  gemini: 'GEMINI_MODEL',
};

const KEY_ENV: Record<LLMProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GOOGLE_GEMINI_API_KEY',
};

export const LLM_PROVIDERS: LLMProvider[] = ['anthropic', 'openai', 'gemini'];

/**
 * `review` calls (blind solve, adversary, judge) are short and frequent, so they
 * can be pointed at a cheaper model with ANTHROPIC_REVIEW_MODEL / OPENAI_REVIEW_MODEL /
 * GEMINI_REVIEW_MODEL. Unset, they use the same model as drafting.
 */
export function modelFor(provider: LLMProvider, role: 'draft' | 'review' = 'draft'): string {
  const reviewOverride = role === 'review' ? process.env[MODEL_ENV[provider].replace('_MODEL', '_REVIEW_MODEL')] : undefined;
  return reviewOverride || process.env[MODEL_ENV[provider]] || DEFAULT_MODELS[provider];
}

// A full DSA draft carries two solutions in up to four languages plus ~20 test
// cases. 4k tokens truncated that mid-JSON; give the model real room.
const DEFAULT_MAX_TOKENS = 32_000;

class AnthropicLLMClient implements LLMClient {
  readonly provider = 'anthropic' as const;
  private client: Anthropic;

  constructor(apiKey: string, readonly model: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(prompt: string, options: { maxTokens?: number } = {}) {
    // Refusal fallbacks and the effort setting exist on the current model families
    // only; an older model named via ANTHROPIC_MODEL would reject them.
    const isCurrentFamily = /^claude-(opus-5|sonnet-5-5|fable-5)/.test(this.model);

    // Streamed so a long draft cannot hit an HTTP timeout; finalMessage() collects it.
    const message = await this.client.beta.messages
      .stream({
        model: this.model,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
        ...(isCurrentFamily && {
          output_config: { effort: 'high' as const },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default' as const,
        }),
      })
      .finalMessage();

    if (message.stop_reason === 'refusal') {
      throw new LlmOutputError('The model declined to answer this prompt.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new LlmOutputError('The reply was cut off at the token limit. Produce a more compact answer.');
    }

    const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    return {
      text,
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    };
  }
}

class OpenAILLMClient implements LLMClient {
  readonly provider = 'openai' as const;
  private client: OpenAI;

  constructor(apiKey: string, readonly model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(prompt: string) {
    const resp = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const choice = resp.choices[0];
    if (choice.finish_reason === 'length') {
      throw new LlmOutputError('The reply was cut off at the token limit. Produce a more compact answer.');
    }
    if (choice.message.refusal) {
      throw new LlmOutputError('The model declined to answer this prompt.');
    }
    return {
      text: choice.message.content ?? '',
      usage: { inputTokens: resp.usage?.prompt_tokens ?? 0, outputTokens: resp.usage?.completion_tokens ?? 0 },
    };
  }
}

class GeminiLLMClient implements LLMClient {
  readonly provider = 'gemini' as const;
  private client: GoogleGenerativeAI;

  constructor(apiKey: string, readonly model: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async complete(prompt: string) {
    const model = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt);
    const finishReason = result.response.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
      throw new LlmOutputError('The reply was cut off at the token limit. Produce a more compact answer.');
    }
    const usage = result.response.usageMetadata;
    return {
      text: result.response.text(),
      usage: { inputTokens: usage?.promptTokenCount ?? 0, outputTokens: usage?.candidatesTokenCount ?? 0 },
    };
  }
}

/** 429 / 5xx / dropped connections are worth waiting out; 4xx and bad output are not. */
function isTransient(err: any): boolean {
  if (err instanceof LlmOutputError) return false;
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  if (typeof status === 'number') return status === 408 || status === 409 || status === 429 || status >= 500;
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|overloaded|503|429/i.test(String(err?.message));
}

const RETRY_DELAYS_MS = [2_000, 6_000, 15_000];

/** Wraps a client so transient provider errors are retried with backoff, uniformly across providers. */
function withRetry(client: LLMClient): LLMClient {
  return {
    provider: client.provider,
    model: client.model,
    async complete(prompt, options) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await client.complete(prompt, options);
        } catch (err: any) {
          if (!isTransient(err) || attempt >= RETRY_DELAYS_MS.length) throw err;
          const delay = Number(process.env.LLM_RETRY_BASE_MS ?? RETRY_DELAYS_MS[attempt]);
          logger.warn(`[LLM] ${client.provider} call failed (${err.message}); retry ${attempt + 1} in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    },
  };
}

const clientCache = new Map<string, LLMClient>();

function getOrCreateClient(provider: LLMProvider, apiKey: string, role: 'draft' | 'review' = 'draft'): LLMClient {
  const model = modelFor(provider, role);
  const cacheKey = `${provider}:${model}:${apiKey}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    const raw =
      provider === 'anthropic' ? new AnthropicLLMClient(apiKey, model)
      : provider === 'openai' ? new OpenAILLMClient(apiKey, model)
      : new GeminiLLMClient(apiKey, model);
    client = withRetry(raw);
    clientCache.set(cacheKey, client);
  }
  return client;
}

/** Per-organization keys as stored in Organization.llmApiKeysEncrypted. */
export type OrgLlmKeys = Partial<Record<LLMProvider, string>> | null | undefined;

/**
 * Key lookup order: the organization's own key (BYOK, encrypted at rest) wins;
 * the server-wide env key is the fallback.
 */
export function resolveApiKey(provider: LLMProvider, orgKeys: OrgLlmKeys): { key: string; source: 'org' | 'env' } | null {
  const stored = orgKeys?.[provider];
  if (stored) return { key: decryptSecret(stored), source: 'org' };
  const envKey = process.env[KEY_ENV[provider]];
  // Placeholder values from .env.example ("sk-ant-...", "...") are not keys.
  if (envKey && !envKey.endsWith('...')) return { key: envKey, source: 'env' };
  return null;
}

/** The client that drafts questions. The requested provider is used strictly — no silent substitution. */
export function getLLMClient(provider: LLMProvider, orgKeys?: OrgLlmKeys): LLMClient {
  const resolved = resolveApiKey(provider, orgKeys);
  if (!resolved) {
    throw new AppError(
      `No API key configured for '${provider}'. Add one under Admin → LLM Keys or set ${KEY_ENV[provider]}.`,
      400
    );
  }
  return getOrCreateClient(provider, resolved.key);
}

/**
 * The client that reviews drafts. Prefers a DIFFERENT provider than the
 * generator so the reviewer does not share the generator's blind spots.
 * `crossModel` is false when only one provider has a key — the review still
 * runs, but it is the same model grading itself, and the result says so.
 */
export function getReviewerLLMClient(
  generatorProvider: LLMProvider,
  orgKeys?: OrgLlmKeys
): { client: LLMClient; crossModel: boolean } {
  // REVIEW_PROVIDER pins the reviewer (e.g. when one provider's free tier is too
  // flaky to review with). It is still reported as same-model if it equals the drafter.
  const pinned = process.env.REVIEW_PROVIDER as LLMProvider | undefined;
  if (pinned && LLM_PROVIDERS.includes(pinned)) {
    const resolved = resolveApiKey(pinned, orgKeys);
    if (resolved) {
      return { client: getOrCreateClient(pinned, resolved.key, 'review'), crossModel: pinned !== generatorProvider };
    }
  }
  for (const provider of LLM_PROVIDERS) {
    if (provider === generatorProvider) continue;
    const resolved = resolveApiKey(provider, orgKeys);
    if (resolved) return { client: getOrCreateClient(provider, resolved.key, 'review'), crossModel: true };
  }
  const own = resolveApiKey(generatorProvider, orgKeys);
  if (!own) return { client: getLLMClient(generatorProvider, orgKeys), crossModel: false }; // throws the "no key" error
  return { client: getOrCreateClient(generatorProvider, own.key, 'review'), crossModel: false };
}

/**
 * Sends a prompt that must be answered with one JSON object and validates the
 * reply against `schema`. Anything else — prose, broken JSON, missing fields —
 * throws LlmOutputError. There is deliberately no default value on failure.
 */
export async function completeJson<T extends z.ZodTypeAny>(
  client: LLMClient,
  prompt: string,
  schema: T,
  meter?: UsageMeter,
  options?: { maxTokens?: number }
): Promise<z.infer<T>> {
  const { text, usage } = await client.complete(prompt, options);
  meter?.add(usage);

  let parsed: unknown;
  try {
    parsed = extractJsonObject(text);
  } catch (err: any) {
    throw new LlmOutputError(err.message);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const problems = result.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new LlmOutputError(`Reply did not match the required JSON shape — ${problems}`);
  }
  return result.data;
}
