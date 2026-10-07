import { draftKindFor } from './questionDrafts.js';

export interface DraftPromptInput {
  type: string;
  difficulty: string;
  topic: string;
  roleLevel: string;
  companyStyle?: string;
  languages: string[];
  mcqOptionsCount: number;
  /** Titles already in the bank or being written in this batch — the model must not repeat them. */
  avoidTitles: string[];
  /** Set when completing an imported problem: the statement is fixed, only solutions/tests are written. */
  fixedStatement?: { title: string; statement: string };
}

const JSON_ONLY = 'Reply with ONE JSON object and nothing else — no markdown fences, no commentary.';

function audience(input: DraftPromptInput): string {
  return `${input.roleLevel.toUpperCase()}-level candidates${input.companyStyle ? ` (${input.companyStyle} interview style)` : ''}`;
}

function avoidBlock(titles: string[]): string {
  if (titles.length === 0) return '';
  return `\nThese questions already exist. Write something clearly different — a different underlying problem, not a reworded one:\n${titles.map((t) => `- ${t}`).join('\n')}\n`;
}

function revisionBlock(previousDraft: unknown, feedback: string | null): string {
  if (!previousDraft || !feedback) return '';
  return `

--- REVISION ---
Your previous draft was rejected by automated validation. The validator's report:
${feedback}

Previous draft:
${JSON.stringify(previousDraft)}

Fix the root cause the report points to and return the complete corrected JSON object.`;
}

const CODE_DIFFICULTY: Record<string, string> = {
  EASY: 'One straightforward idea (a single pass, a hash map, sorting, simple math). The brute force may have the same complexity as the optimal solution.',
  MEDIUM: 'Needs one standard technique applied with some care (two pointers, binary search, BFS/DFS, a 1-D or 2-D DP, a heap, prefix sums). The brute force must be asymptotically slower than the optimal solution.',
  HARD: 'Needs a non-obvious insight or a combination of techniques. The brute force must be asymptotically slower than the optimal solution.',
};

const LANGUAGE_NOTES: Record<string, string> = {
  python: 'python: Python 3, read with sys.stdin.',
  java: 'java: a single file whose public class is named Main with public static void main; use BufferedReader for input.',
  cpp: 'cpp: C++17, #include <bits/stdc++.h> is NOT available everywhere — include the specific headers you use.',
  javascript: "javascript: Node.js, read all input with require('fs').readFileSync(0, 'utf8').",
};

function buildCodePrompt(input: DraftPromptInput): string {
  const langs = input.languages;
  const solutionShape = `{ ${langs.map((l) => `"${l}": "<complete program>"`).join(', ')} }`;
  const task = input.fixedStatement
    ? `Below is an existing ${input.difficulty} coding problem. Do NOT change what it asks. Rewrite the statement only as far as needed to define an exact stdin/stdout format, then write reference solutions and tests for it.

Title: ${input.fixedStatement.title}
Statement:
${input.fixedStatement.statement}`
    : `Write one original ${input.difficulty} coding problem on the topic "${input.topic}" for ${audience(input)}.
Difficulty bar: ${CODE_DIFFICULTY[input.difficulty] ?? ''}
${avoidBlock(input.avoidTitles)}`;

  return `You write coding-interview problems that are verified by actually running code. Everything you produce will be executed in a sandbox, so it must be exact.

${task}

HOW YOUR ANSWER IS CHECKED
1. Every solution is run as a standalone program: the test input is piped to standard input and whatever it prints to standard output is the answer.
2. The brute force is treated as the source of truth. The optimal solution, in every language, must print exactly the same output as the brute force on every test input — your listed cases AND random inputs produced by your generator.
3. The optimal solution is then run on a maximum-size input and must finish within 3 seconds.${input.difficulty === 'EASY' ? '' : ' On that same input the brute force is expected to be far slower (ideally it times out) — that is the evidence the problem really is ' + input.difficulty + '.'}

RULES
- Input format: plain text only — integers and words separated by spaces and newlines. No JSON, no brackets, no quotes. State the exact format in the statement under "Input" and "Output" headings, and state numeric constraints under "Constraints".
- Choose the constraints so the optimal solution is comfortably fast at the maximum size in Python${input.difficulty === 'EASY' ? '' : ', and the brute force is hopeless at the maximum size'}.
- The answer for each input must be unique (one single correct output). If several answers could be valid, tighten the problem (e.g. "print the smallest such index").
- Each solution is a COMPLETE program that reads stdin and prints only the answer. No prompts, no debug output.
- Write the brute force as the most obviously-correct direct translation of the problem definition. It must be written independently of the optimal solution, not derived from it.
- Language notes:
${langs.map((l) => `  - ${LANGUAGE_NOTES[l] ?? `${l}: standard toolchain.`}`).join('\n')}
- Include 2–3 examples in the statement and repeat each of them in "testCases" with "isSample": true.
- "inputGenerator" is a Python 3 program. It reads one line "<seed> <mode>" from stdin, calls random.seed(seed), and prints exactly ONE valid input in your input format:
    mode "small": sizes and values tiny (e.g. n ≤ 8, values in a narrow range so duplicates and ties happen) — the brute force must be instant.
    mode "edge":  boundary shapes — minimum size, all-equal values, extremes of the value range, already-sorted/reversed, etc. Vary the shape with the seed.
    mode "large": the MAXIMUM constraints, in the shape that is worst for the brute force.

${JSON_ONLY}
{
  "title": "short descriptive title",
  "statement": "full statement with Input / Output / Constraints / Examples sections",
  "topic": "${input.topic}",
  "tags": ["..."],
  "optimalSolution": ${solutionShape},
  "bruteForceSolution": ${solutionShape},
  "testCases": [
    { "input": "exact stdin text", "expectedOutput": "exact stdout text", "label": "what it covers", "isSample": true },
    { "input": "...", "expectedOutput": "...", "label": "edge: minimum size", "isEdgeCase": true }
  ],
  "inputGenerator": "import sys, random\\n...",
  "timeComplexity": "O(...) with a one-line reason",
  "spaceComplexity": "O(...)",
  "bruteForceComplexity": "O(...)",
  "explanation": "the key idea of the optimal solution, step by step"
}
Provide 10–15 test cases covering normal cases and every edge case the constraints allow.`;
}

const MCQ_FOCUS: Record<string, string> = {
  OOPS: 'object-oriented programming — encapsulation, inheritance, polymorphism, abstraction, composition vs inheritance, SOLID, design patterns. Prefer questions built on a short code snippet or a concrete design situation over definition recall.',
  CONCEPTUAL: 'core computer-science concepts (operating systems, networking, databases, complexity, language semantics). Test understanding, not trivia.',
  MCQ: 'the given topic. Test understanding, not trivia.',
};

const MCQ_DIFFICULTY: Record<string, string> = {
  EASY: 'Tests one core concept directly.',
  MEDIUM: 'Requires applying a concept to a concrete situation or reading a short code snippet.',
  HARD: 'Requires combining concepts or reasoning about a subtle but well-defined behaviour.',
};

function buildMcqPrompt(input: DraftPromptInput): string {
  return `You write multiple-choice questions for technical hiring assessments.

Write one ${input.difficulty} question on the topic "${input.topic}" for ${audience(input)}.
Focus: ${MCQ_FOCUS[input.type] ?? MCQ_FOCUS.MCQ}
Difficulty bar: ${MCQ_DIFFICULTY[input.difficulty] ?? ''}
${avoidBlock(input.avoidTitles)}
HOW YOUR ANSWER IS CHECKED
A second model will answer your question WITHOUT seeing your answer key. If it picks a different option, the question is rejected as ambiguous or wrong. A reviewer then looks for any flaw.

RULES
- Exactly ${input.mcqOptionsCount} options with ids ${Array.from({ length: input.mcqOptionsCount }, (_, i) => String.fromCharCode(65 + i)).join(', ')}.
- Exactly ONE option is correct, and it must be defensible from the question text alone. An expert must be able to rule out every other option.
- If the answer depends on a language, version, or platform, name it in the question.
- Every wrong option must be a plausible, specific misconception — no joke options, no "all/none of the above".
- Options must be similar in length and style so the correct one does not stand out.
- If you include code, it must be complete enough that its behaviour is fully determined.

${JSON_ONLY}
{
  "title": "short descriptive title",
  "statement": "the question, including any code snippet",
  "topic": "${input.topic}",
  "tags": ["..."],
  "options": [{ "id": "A", "text": "..." }],
  "answer": "the id of the correct option",
  "explanation": "why the correct option is right and why each other option is wrong"
}`;
}

function buildSqlPrompt(input: DraftPromptInput): string {
  return `You write SQL interview problems that are verified by actually running the queries in SQLite.

Write one ${input.difficulty} SQL problem on the topic "${input.topic}" for ${audience(input)}.
${avoidBlock(input.avoidTitles)}
HOW YOUR ANSWER IS CHECKED
For each dataset, the schema and that dataset are loaded into a fresh SQLite database and both of your queries are run. Both must succeed and return exactly the same rows on every dataset.

RULES
- Use only SQL that SQLite 3.36 supports (window functions and CTEs are fine; no stored procedures, no vendor-specific syntax).
- "ddl": CREATE TABLE statements only.
- "datasets": at least 3 separate INSERT scripts for the same schema. One is the example data shown in the statement. The others must stress the edge cases a wrong query would get wrong — NULLs, ties, duplicates, groups with no matching rows, a single row.
- The statement must show the tables, describe the columns, state the exact output columns and their order, and — if row order matters — the exact ordering including tie-breaks.
- "referenceQuery" is the intended answer. "alternativeQuery" must solve the same problem with a genuinely different approach (e.g. a join instead of a subquery, a window function instead of GROUP BY). It is the independent cross-check, so do not write it by lightly editing the reference query.
- Set "orderMatters" to true only if the statement specifies an ordering; then both queries need the same ORDER BY with a total tie-break.
- The result must be non-empty on the example dataset.

${JSON_ONLY}
{
  "title": "short descriptive title",
  "statement": "full problem statement with table descriptions and the expected output format",
  "topic": "${input.topic}",
  "tags": ["..."],
  "ddl": "CREATE TABLE ...;",
  "datasets": ["INSERT INTO ...;", "INSERT INTO ...;", "INSERT INTO ...;"],
  "referenceQuery": "SELECT ...;",
  "alternativeQuery": "SELECT ...;",
  "orderMatters": false,
  "explanation": "how the reference query works and the traps it avoids"
}`;
}

function buildDesignPrompt(input: DraftPromptInput): string {
  return `You write open-ended system-design interview questions together with the rubric an interviewer grades against.

Write one ${input.difficulty} system-design question on the topic "${input.topic}" for ${audience(input)}.
${avoidBlock(input.avoidTitles)}
RULES
- Scope it so a strong candidate at this level can cover it in 45 minutes. Give concrete scale numbers (users, requests/second, data size) so trade-offs are real rather than hand-waved.
- The statement is what the candidate sees: the product, the scale, and what they are asked to design. Do not leak the solution.
- "rubric": 5–8 criteria whose points add up to 100. Each "lookFor" says what a good answer contains for that criterion, concretely enough that two interviewers would score the same answer alike.
- "referenceOutline": a strong answer in outline form — components, data model, key flows, and the main trade-offs with the reasoning for each choice.

${JSON_ONLY}
{
  "title": "short descriptive title",
  "statement": "the question as shown to the candidate",
  "topic": "${input.topic}",
  "tags": ["..."],
  "requirements": { "functional": ["..."], "nonFunctional": ["..."] },
  "rubric": [{ "criterion": "...", "points": 20, "lookFor": "..." }],
  "referenceOutline": "...",
  "explanation": "what this question is designed to reveal about a candidate"
}`;
}

export function buildDraftPrompt(input: DraftPromptInput, previousDraft?: unknown, feedback?: string | null): string {
  const kind = draftKindFor(input.type);
  const base =
    kind === 'code' ? buildCodePrompt(input)
    : kind === 'sql' ? buildSqlPrompt(input)
    : kind === 'design' ? buildDesignPrompt(input)
    : buildMcqPrompt(input);
  return base + revisionBlock(previousDraft, feedback ?? null);
}

// ---- Review prompts ----

export function buildBlindSolvePrompt(statement: string, options: { id: string; text: string }[]): string {
  return `Answer this multiple-choice question from a technical hiring assessment. Work it out carefully before you commit.

Question:
${statement}

Options:
${options.map((o) => `${o.id}) ${o.text}`).join('\n')}

${JSON_ONLY}
{
  "answer": "the id of the single best option, or null if no option is correct or more than one is equally correct",
  "confidence": "high | medium | low",
  "reasoning": "one or two sentences",
  "alsoDefensible": ["ids of any OTHER options a knowledgeable candidate could reasonably defend"]
}`;
}

export function buildAdversaryPrompt(question: unknown, kind: 'mcq' | 'design'): string {
  const checks = kind === 'mcq'
    ? `- More than one option could be correct, or none is
- The marked answer is factually wrong
- The answer depends on a language/version/platform the question does not name
- Wording that is ambiguous or misleading in a way that changes the answer
- A wrong option that is not a real misconception (so it gives the answer away)`
    : `- The scope is impossible in 45 minutes, or trivial for the stated level
- Missing scale numbers, so trade-offs cannot be reasoned about
- The statement leaks the intended solution
- The rubric misses a major area of the problem, or its points do not add up to 100
- Rubric criteria too vague for two interviewers to score alike
- The reference outline contradicts the requirements or contains a technical error`;

  return `You are reviewing a question before it goes into a real hiring assessment. Find real defects — the kind that would make the question unfair or wrong. Do not invent problems, and do not report matters of taste.

Look for:
${checks}

Question:
${JSON.stringify(question, null, 2)}

${JSON_ONLY}
{
  "foundIssue": true,
  "severity": "major | minor",
  "issue": "the single most serious defect, stated specifically — or null if there is none"
}
"major" = a candidate could be marked wrong unfairly, or the question cannot be graded reliably. "minor" = polish.`;
}

export function buildJudgePrompt(question: unknown, issue: string, severity: string): string {
  return `You are the final reviewer for a hiring-assessment question. Another reviewer raised the concern below. Decide whether the question may be used as written.

Question:
${JSON.stringify(question, null, 2)}

Concern (${severity}): ${issue}

Decide FAIL if the concern is correct and it could cause a candidate to be graded unfairly. Decide PASS if the concern is mistaken, or is real but only cosmetic.

${JSON_ONLY}
{ "decision": "PASS | FAIL", "reasoning": "one or two sentences; if FAIL, say what must change" }`;
}

const BLIND_SOLVER_MARKER = 'Solve this programming problem.';
export const isBlindCodeSolvePrompt = (prompt: string) => prompt.startsWith(BLIND_SOLVER_MARKER);

/** The independent solver sees ONLY the statement — no solutions, no test cases, no hints. */
export function buildBlindCodeSolvePrompt(statement: string, language: string): string {
  return `${BLIND_SOLVER_MARKER} Write one complete ${language} program that reads the input from standard input and prints only the answer to standard output.

${LANGUAGE_NOTES[language] ?? ''}

Follow the statement exactly as written. If it is ambiguous, choose the most literal reading — do not guess what the author "probably meant".

Problem:
${statement}

${JSON_ONLY}
{ "code": "<the complete program>" }`;
}
