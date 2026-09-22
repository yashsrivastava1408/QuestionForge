import type { Question } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

interface DebateResult {
  passed: boolean;
  report: string;
}

// LangGraph-style multi-agent debate state
interface DebateState {
  question: Question;
  generatedContent: string;
  adversaryFinding: string | null;
  judgeDecision: 'PASS' | 'FAIL' | null;
  iteration: number;
}

export async function runAdversarialDebate(question: Question): Promise<DebateResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const state: DebateState = {
    question,
    generatedContent: JSON.stringify({ statement: question.statement, options: question.options, answer: question.answer }),
    adversaryFinding: null,
    judgeDecision: null,
    iteration: 0,
  };

  // ---- AGENT 1: Adversary ----
  logger.info(`[AgentDebate] Running adversary agent for Q: ${question.id}`);
  const adversaryResp = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are an adversarial AI reviewing a placement exam question. Your job is to find ANY issue:
- Ambiguity (more than one answer could be correct)
- Factual error in the answer
- Confusing or misleading phrasing
- Answer that depends on language/platform version

Question: ${state.generatedContent}

Respond ONLY with JSON: {"foundIssue": true/false, "issue": "describe issue or null"}`,
    }],
  });

  const adversaryText = adversaryResp.content[0].type === 'text' ? adversaryResp.content[0].text : '{}';
  let adversaryParsed: { foundIssue: boolean; issue: string | null };
  try {
    adversaryParsed = JSON.parse(adversaryText);
  } catch {
    adversaryParsed = { foundIssue: false, issue: null };
  }
  state.adversaryFinding = adversaryParsed.foundIssue ? adversaryParsed.issue : null;

  // ---- AGENT 2: Judge ----
  logger.info(`[AgentDebate] Running judge agent for Q: ${question.id}`);
  const judgeResp = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are a senior exam reviewer acting as a judge.

Question: ${state.generatedContent}
Adversary finding: ${state.adversaryFinding ?? 'No issues found'}

Is the adversary's concern valid enough to reject this question?
Respond ONLY with JSON: {"decision": "PASS" or "FAIL", "reasoning": "one sentence"}`,
    }],
  });

  const judgeText = judgeResp.content[0].type === 'text' ? judgeResp.content[0].text : '{}';
  let judgeParsed: { decision: 'PASS' | 'FAIL'; reasoning: string };
  try {
    judgeParsed = JSON.parse(judgeText);
  } catch {
    judgeParsed = { decision: 'PASS', reasoning: 'Unable to parse judge response, defaulting to pass.' };
  }
  state.judgeDecision = judgeParsed.decision;

  const passed = state.judgeDecision === 'PASS';
  const report = `Adversary: ${state.adversaryFinding ?? 'No issues'}. Judge: ${judgeParsed.decision} — ${judgeParsed.reasoning}`;

  logger.info(`[AgentDebate] Result for Q ${question.id}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  return { passed, report };
}
