import type { GenerationWizardConfig } from '@question-forge/shared';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

// System prompt builder for DSA questions
function buildDSASystemPrompt(config: GenerationWizardConfig & { difficulty: string; questionType: string }) {
  return `You are an expert DSA question generator for placement assessments targeting ${config.roleLevel.toUpperCase()} level engineers at ${config.companyStyle ?? 'top product companies'}.

Generate a ${config.difficulty} difficulty ${config.questionType} question on the topic(s): ${config.topics.join(', ')}.

CRITICAL: Your response must be STRICTLY valid JSON matching this schema exactly. No markdown, no explanation, just raw JSON:

{
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
    {"input": "...", "expectedOutput": "...", "label": "Edge case - empty", "isEdgeCase": true},
    {"input": "...", "expectedOutput": "...", "label": "Edge case - max values", "isEdgeCase": true}
  ],
  "explanation": "Step by step explanation of optimal approach with time/space complexity"
}

Generate at least 20 test cases. Include edge cases: empty input, single element, maximum values, negative numbers.`;
}

// System prompt for OOPS/Conceptual questions
function buildOOPSSystemPrompt(config: GenerationWizardConfig & { difficulty: string }) {
  return `You are an expert OOPS/conceptual question generator for placement assessments.

Generate a ${config.difficulty} MCQ question on ${config.topics.join(', ')} for ${config.roleLevel.toUpperCase()} level.

Response must be STRICTLY valid JSON:

{
  "title": "Short descriptive title",
  "statement": "The question stem. Must have ONE and ONLY ONE correct answer.",
  "difficulty": "${config.difficulty}",
  "type": "OOPS",
  "topic": "Primary topic",
  "tags": ["tag1", "tag2"],
  "languages": [],
  "options": [
    {"id": "A", "text": "Option A text"},
    {"id": "B", "text": "Option B text"},
    {"id": "C", "text": "Option C text"},
    {"id": "D", "text": "Option D text"}
  ],
  "answer": "A",
  "explanation": "Why A is correct and why others are wrong."
}`;
}

interface LLMClient {
  generateQuestion(config: GenerationWizardConfig & { difficulty: string; questionType: string }): Promise<any>;
}

class AnthropicLLMClient implements LLMClient {
  private client: Anthropic;
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateQuestion(config: GenerationWizardConfig & { difficulty: string; questionType: string }) {
    const prompt = config.questionType === 'DSA'
      ? buildDSASystemPrompt(config)
      : buildOOPSSystemPrompt(config);

    const resp = await this.client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = resp.content[0].type === 'text' ? resp.content[0].text : '';
    return JSON.parse(text);
  }
}

class OpenAILLMClient implements LLMClient {
  private client: OpenAI;
  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateQuestion(config: GenerationWizardConfig & { difficulty: string; questionType: string }) {
    const prompt = config.questionType === 'DSA'
      ? buildDSASystemPrompt(config)
      : buildOOPSSystemPrompt(config);

    const resp = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(resp.choices[0].message.content ?? '{}');
  }
}

export function getLLMClient(provider: string, _organizationId: string): LLMClient {
  // In production: fetch org-specific encrypted API keys from DB
  // For now: use env vars (BYOK via .env)
  switch (provider) {
    case 'anthropic': {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new AppError('ANTHROPIC_API_KEY not configured', 400);
      return new AnthropicLLMClient(key);
    }
    case 'openai': {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new AppError('OPENAI_API_KEY not configured', 400);
      return new OpenAILLMClient(key);
    }
    default:
      throw new AppError(`Unsupported LLM provider: ${provider}`, 400);
  }
}
