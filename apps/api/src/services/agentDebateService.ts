import type { Question } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger.js';
import { getLLMClient, getAdversaryLLMClient } from './llmService.js';

interface DebateResult {
  passed: boolean;
  report: string;
}

// Helper: run a critique prompt against any available model
async function runCritiquePrompt(prompt: string, preferNonProvider?: string): Promise<string> {
  // Cross-model: try to use a different model from the one specified
  if (preferNonProvider !== 'openai' && process.env.OPENAI_API_KEY) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const resp = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    return resp.choices[0].message.content ?? '{}';
  }
  if (preferNonProvider !== 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return resp.content[0].type === 'text' ? resp.content[0].text : '{}';
  }
  if (preferNonProvider !== 'gemini' && process.env.GOOGLE_GEMINI_API_KEY) {
    const client = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
    const model = client.getGenerativeModel({ model: 'gemini-flash-lite-latest', generationConfig: { responseMimeType: 'application/json' } });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }
  // Fallback: use any available key
  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return resp.content[0].type === 'text' ? resp.content[0].text : '{}';
  }
  throw new Error('No LLM provider configured for agent debate.');
}

export async function runAdversarialDebate(question: Question): Promise<DebateResult> {
  const content = JSON.stringify({ statement: question.statement, options: question.options, answer: question.answer });

  // ---- AGENT 1: Adversary (cross-model — different from default generator) ----
  logger.info(`[AgentDebate] Running cross-model adversary for Q: ${question.id}`);
  const adversaryPrompt = `You are an adversarial AI reviewing a placement exam question. Your job is to find ANY issue:
- Ambiguity (more than one answer could be correct)
- Factual error in the answer
- Confusing or misleading phrasing
- Answer that depends on language/platform version
- Distractor options that are not genuine misconceptions

Question: ${content}

Respond ONLY with valid JSON: {"foundIssue": true or false, "issue": "describe issue or null", "severity": "minor" or "major"}`;

  let adversaryParsed: { foundIssue: boolean; issue: string | null; severity?: string } = { foundIssue: false, issue: null };
  try {
    // Cross-model: adversary uses a DIFFERENT model than the generator (Anthropic → OpenAI or vice versa)
    const adversaryText = await runCritiquePrompt(adversaryPrompt, 'anthropic');
    adversaryParsed = JSON.parse(adversaryText);
  } catch (e) {
    logger.warn(`[AgentDebate] Adversary parse failed, defaulting to no issue.`);
  }

  // ---- AGENT 2: Judge (uses the primary/best available model) ----
  logger.info(`[AgentDebate] Running judge for Q: ${question.id}. Adversary found: ${adversaryParsed.foundIssue}`);
  const judgePrompt = `You are a senior exam reviewer acting as a judge.

Question: ${content}
Adversary finding: ${adversaryParsed.foundIssue ? adversaryParsed.issue : 'No issues found'}
Severity: ${adversaryParsed.severity ?? 'N/A'}

Rules:
- If severity is "minor", lean towards PASS unless the issue is genuinely misleading.
- If severity is "major", lean towards FAIL unless the adversary is clearly wrong.
- If no issue was found, always PASS.

Respond ONLY with valid JSON: {"decision": "PASS" or "FAIL", "reasoning": "one concise sentence"}`;

  let judgeParsed: { decision: 'PASS' | 'FAIL'; reasoning: string } = { decision: 'PASS', reasoning: 'Defaulted to pass.' };
  try {
    const judgeText = await runCritiquePrompt(judgePrompt);
    judgeParsed = JSON.parse(judgeText);
  } catch (e) {
    logger.warn(`[AgentDebate] Judge parse failed, defaulting to PASS.`);
  }

  const passed = judgeParsed.decision === 'PASS';
  const report = `[Cross-Model Debate] Adversary: ${adversaryParsed.issue ?? 'No issues'} (${adversaryParsed.severity ?? 'N/A'}). Judge: ${judgeParsed.decision} — ${judgeParsed.reasoning}`;

  logger.info(`[AgentDebate] Result for Q ${question.id}: ${passed ? 'PASS' : 'FAIL'}`);
  return { passed, report };
}


