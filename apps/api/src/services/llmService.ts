import type { GenerationWizardConfig } from '@question-forge/shared';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

// Difficulty complexity constraints injected into prompts
function getDifficultyConstraints(difficulty: string): string {
  switch (difficulty.toUpperCase()) {
    case 'EASY':
      return 'DIFFICULTY CONSTRAINT: The optimal solution MUST run in O(n) or O(n log n) time. No more than 2 nested loops. Must be solvable using basic iteration, hashmaps, or simple math.';
    case 'MEDIUM':
      return 'DIFFICULTY CONSTRAINT: The optimal solution MUST use Dynamic Programming, Two Pointers, Sliding Window, or Binary Search. The brute force must be O(n²) or worse. The approach cannot be trivially guessable.';
    case 'HARD':
      return 'DIFFICULTY CONSTRAINT: The optimal solution MUST use a specialized data structure such as a Monotonic Stack, Segment Tree, Trie, or Union-Find. An O(n²) optimal solution is UNACCEPTABLE. The question should require non-obvious insight.';
    default:
      return '';
  }
}

// System prompt builder for DSA questions
function buildDSASystemPrompt(config: GenerationWizardConfig & { difficulty: string; questionType: string }, previousDraft?: any, criticism?: string) {
  const difficultyConstraint = getDifficultyConstraints(config.difficulty);

  let prompt = `You are an expert DSA question generator for placement assessments targeting ${config.roleLevel.toUpperCase()} level engineers at ${config.companyStyle ?? 'top product companies'}.

Generate a ${config.difficulty} difficulty ${config.questionType} question on the topic(s): ${config.topics.join(', ')}.

${difficultyConstraint}

CRITICAL: Your response must be STRICTLY valid JSON matching this schema exactly. No markdown outside of the JSON string values.

{
  "_thinking": "Before generating the question, explicitly reason step-by-step about why the question fits the ${config.difficulty} difficulty, what edge cases need to be covered, and what the time/space complexity constraints should be. Verify you are meeting the difficulty constraint above.",
  "title": "Short descriptive title",
  "statement": "Full problem statement with constraints and examples",
  "difficulty": "${config.difficulty}",
  "type": "${config.questionType}",
  "topic": "Primary topic from the list",
  "tags": ["tag1", "tag2"],
  "languages": ${JSON.stringify(config.languages)},
  "optimalSolution": {
    "python": "def solution(...):\n    ...",
    "java": "public int solution(...) {...}",
    "cpp": "int solution(...) {...}",
    "javascript": "function solution(...) {...}"
  },
  "bruteForceSolution": {
    "python": "def bruteForce(...):\n    ...",
    "java": "...",
    "cpp": "...",
    "javascript": "..."
  },
  "testCases": [
    {"input": "...", "expectedOutput": "...", "label": "Basic case"},
    {"input": "...", "expectedOutput": "...", "label": "Edge case - empty", "isEdgeCase": true}
  ],
  "timeComplexity": "O(??) — explain why",
  "spaceComplexity": "O(??) — explain why",
  "explanation": "Step by step explanation of optimal approach with time/space complexity"
}

Generate at least 20 test cases. Include edge cases: empty input, single element, maximum values, negative numbers. Every test case MUST have a correct expectedOutput.`;

  if (previousDraft && criticism) {
    prompt += `\n\n--- REVISION REQUEST ---\nYour previous attempt failed validation.\nCriticism: ${criticism}\nPrevious Draft: ${JSON.stringify(previousDraft)}\n\nPlease fix the issues and generate a revised JSON payload. Ensure your _thinking block explicitly addresses the criticism.`;
  }
  return prompt;
}

// System prompt for OOPS/Conceptual/MCQ questions
function buildOOPSSystemPrompt(config: GenerationWizardConfig & { difficulty: string; mcqOptionsCount?: number }, previousDraft?: any, criticism?: string) {
  const optsCount = config.mcqOptionsCount ?? 4;
  const difficultyConstraint = getDifficultyConstraints(config.difficulty);

  let prompt = `You are an expert conceptual question generator for placement assessments.

Generate a ${config.difficulty} MCQ question on ${config.topics.join(', ')} for ${config.roleLevel.toUpperCase()} level.

${difficultyConstraint}

Response must be STRICTLY valid JSON matching this schema exactly:

{
  "_thinking": "Reason about why this question fits the ${config.difficulty} difficulty, and ensure all distractors (wrong options) represent common real-world misconceptions. Verify the difficulty constraint is met.",
  "title": "Short descriptive title",
  "statement": "The question stem. Must have ONE and ONLY ONE correct answer.",
  "difficulty": "${config.difficulty}",
  "type": "MCQ",
  "topic": "Primary topic",
  "tags": ["tag1", "tag2"],
  "languages": [],
  "options": [
    {"id": "A", "text": "..."} // Exactly ${optsCount} options total
  ],
  "answer": "A",
  "explanation": "Why the correct answer is right and why each wrong option is a common misconception."
}`;

  if (previousDraft && criticism) {
    prompt += `\n\n--- REVISION REQUEST ---\nYour previous attempt failed validation.\nCriticism: ${criticism}\nPrevious Draft: ${JSON.stringify(previousDraft)}\n\nPlease fix the issues and generate a revised JSON payload. Ensure your _thinking block explicitly addresses the criticism.`;
  }
  return prompt;
}

interface LLMClient {
  generateQuestion(config: GenerationWizardConfig & { difficulty: string; questionType: string; mcqOptionsCount?: number }, previousDraft?: any, criticism?: string): Promise<any>;
  readonly providerName: string;
}

class AnthropicLLMClient implements LLMClient {
  private client: Anthropic;
  readonly providerName = 'anthropic';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateQuestion(config: GenerationWizardConfig & { difficulty: string; questionType: string; mcqOptionsCount?: number }, previousDraft?: any, criticism?: string) {
    const prompt = config.questionType === 'DSA'
      ? buildDSASystemPrompt(config, previousDraft, criticism)
      : buildOOPSSystemPrompt(config, previousDraft, criticism);

    const resp = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = resp.content[0].type === 'text' ? resp.content[0].text : '';
    const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleanedText);
  }
}

class OpenAILLMClient implements LLMClient {
  private client: OpenAI;
  readonly providerName = 'openai';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateQuestion(config: GenerationWizardConfig & { difficulty: string; questionType: string; mcqOptionsCount?: number }, previousDraft?: any, criticism?: string) {
    const prompt = config.questionType === 'DSA'
      ? buildDSASystemPrompt(config, previousDraft, criticism)
      : buildOOPSSystemPrompt(config, previousDraft, criticism);

    const resp = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(resp.choices[0].message.content ?? '{}');
  }
}

class GeminiLLMClient implements LLMClient {
  private client: GoogleGenerativeAI;
  readonly providerName = 'gemini';

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateQuestion(config: GenerationWizardConfig & { difficulty: string; questionType: string; mcqOptionsCount?: number }, previousDraft?: any, criticism?: string) {
    const prompt = config.questionType === 'DSA'
      ? buildDSASystemPrompt(config, previousDraft, criticism)
      : buildOOPSSystemPrompt(config, previousDraft, criticism);

    const model = this.client.getGenerativeModel({
      model: 'gemini-flash-lite-latest',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleanedText);
  }
}

const clientCache = new Map<string, LLMClient>();

function getOrCreateClient(provider: 'anthropic' | 'openai' | 'gemini', apiKey: string): LLMClient {
  const cacheKey = `${provider}:${apiKey}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    if (provider === 'anthropic') client = new AnthropicLLMClient(apiKey);
    else if (provider === 'openai') client = new OpenAILLMClient(apiKey);
    else client = new GeminiLLMClient(apiKey);
    clientCache.set(cacheKey, client);
  }
  return client;
}

/**
 * Returns the best available LLM client based on configured API keys.
 * Priority: Anthropic → OpenAI → Gemini
 * This allows enterprises to use whichever key they have, including Gemini's free tier.
 */
export function getLLMClient(preferredProvider: string, _organizationId: string): LLMClient {
  // If a specific provider is requested, use it strictly
  if (preferredProvider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new AppError('ANTHROPIC_API_KEY not configured', 400);
    return getOrCreateClient('anthropic', key);
  }
  if (preferredProvider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new AppError('OPENAI_API_KEY not configured', 400);
    return getOrCreateClient('openai', key);
  }
  if (preferredProvider === 'gemini') {
    const key = process.env.GOOGLE_GEMINI_API_KEY;
    if (!key) throw new AppError('GOOGLE_GEMINI_API_KEY not configured', 400);
    return getOrCreateClient('gemini', key);
  }

  // Auto-detect: fall through to best available key
  if (process.env.ANTHROPIC_API_KEY) {
    return getOrCreateClient('anthropic', process.env.ANTHROPIC_API_KEY);
  }
  if (process.env.OPENAI_API_KEY) {
    return getOrCreateClient('openai', process.env.OPENAI_API_KEY);
  }
  if (process.env.GOOGLE_GEMINI_API_KEY) {
    return getOrCreateClient('gemini', process.env.GOOGLE_GEMINI_API_KEY);
  }

  throw new AppError('No LLM API key configured. Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GEMINI_API_KEY in your .env file.', 400);
}

/**
 * Returns a different LLM client than the generator for cross-model debate.
 * Uses a different provider to catch blind spots the generator missed.
 */
export function getAdversaryLLMClient(generatorProvider: string): LLMClient {
  // Adversary should be a DIFFERENT model than the generator
  if (generatorProvider !== 'openai' && process.env.OPENAI_API_KEY) {
    return getOrCreateClient('openai', process.env.OPENAI_API_KEY);
  }
  if (generatorProvider !== 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return getOrCreateClient('anthropic', process.env.ANTHROPIC_API_KEY);
  }
  if (generatorProvider !== 'gemini' && process.env.GOOGLE_GEMINI_API_KEY) {
    return getOrCreateClient('gemini', process.env.GOOGLE_GEMINI_API_KEY);
  }
  // Fallback: same model (better than nothing)
  logger.warn('[LLM] Only one LLM provider configured. Cross-model debate unavailable, using same provider.');
  return getLLMClient('auto', '');
}

