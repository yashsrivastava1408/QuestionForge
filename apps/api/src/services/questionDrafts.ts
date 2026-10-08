import { z } from 'zod';
import type { QuestionType } from '@question-forge/shared';

/**
 * How a question type is drafted and checked:
 *  - code   → runnable programs, proven by sandbox differential testing
 *  - sql    → two queries, proven by running both in SQLite on several datasets
 *  - mcq    → one correct option, checked by a blind solve + adversarial review
 *  - design → open-ended prompt with a grading rubric, checked by LLM review only
 */
export type DraftKind = 'code' | 'sql' | 'mcq' | 'design';

export function draftKindFor(type: QuestionType | string): DraftKind {
  switch (type) {
    case 'DSA': return 'code';
    case 'SQL': return 'sql';
    case 'SYSTEM_DESIGN': return 'design';
    default: return 'mcq'; // MCQ, CONCEPTUAL, OOPS
  }
}

const text = (min = 1) => z.string().trim().min(min);
const tags = z.array(z.string()).default([]);
// LLMs emit numbers or strings for outputs interchangeably; store one shape.
const looseString = z.union([z.string(), z.number(), z.boolean()]).transform(String);

export const testCaseSchema = z.object({
  input: looseString,
  expectedOutput: looseString.optional().default(''),
  label: z.string().optional(),
  isSample: z.boolean().optional(),
  isEdgeCase: z.boolean().optional(),
});

export const codeDraftSchema = z.object({
  title: text(3),
  statement: text(40),
  topic: z.string().optional(),
  tags,
  optimalSolution: z.record(text(10)),
  bruteForceSolution: z.record(text(10)),
  testCases: z.array(testCaseSchema).min(6, 'at least 6 test cases are required'),
  inputGenerator: text(20),
  timeComplexity: z.string().optional(),
  spaceComplexity: z.string().optional(),
  bruteForceComplexity: z.string().optional(),
  explanation: text(10),
});
export type CodeDraft = z.infer<typeof codeDraftSchema>;

/**
 * For questions that show code and ask what it does or prints: a complete
 * program that is actually executed, so the answer key is checked by running
 * code and not only by a second model's opinion.
 */
export const snippetVerificationSchema = z.object({
  language: z.enum(['python', 'java', 'cpp', 'javascript']),
  program: text(10),
  expectedOutput: looseString,
});
export type SnippetVerification = z.infer<typeof snippetVerificationSchema>;

export const mcqDraftSchema = z.object({
  title: text(3),
  statement: text(15),
  topic: z.string().optional(),
  tags,
  options: z.array(z.object({ id: text(), text: looseString })).min(2),
  answer: text(),
  explanation: text(10),
  // Models send null when there is nothing to run.
  verification: snippetVerificationSchema.nullish().transform((v) => v ?? undefined),
});
export type McqDraft = z.infer<typeof mcqDraftSchema>;

export const sqlDraftSchema = z.object({
  title: text(3),
  statement: text(40),
  topic: z.string().optional(),
  tags,
  ddl: text(10),
  datasets: z.array(text(10)).min(2, 'at least 2 datasets are required'),
  referenceQuery: text(6),
  alternativeQuery: text(6),
  orderMatters: z.boolean().default(false),
  explanation: text(10),
});
export type SqlDraft = z.infer<typeof sqlDraftSchema>;

export const designDraftSchema = z.object({
  title: text(3),
  statement: text(60),
  topic: z.string().optional(),
  tags,
  requirements: z.object({
    functional: z.array(text()).min(2),
    nonFunctional: z.array(text()).min(2),
  }),
  rubric: z
    .array(z.object({ criterion: text(), points: z.number().positive(), lookFor: text() }))
    .min(4, 'the rubric needs at least 4 criteria'),
  referenceOutline: text(80),
  explanation: text(10),
});
export type DesignDraft = z.infer<typeof designDraftSchema>;

export type AnyDraft = CodeDraft | McqDraft | SqlDraft | DesignDraft;

export function draftSchemaFor(kind: DraftKind) {
  return { code: codeDraftSchema, sql: sqlDraftSchema, mcq: mcqDraftSchema, design: designDraftSchema }[kind];
}

/** Maps a validated draft onto Prisma `Question` columns. Pure, so retries can reuse it. */
export function buildQuestionData(
  draft: AnyDraft,
  type: string,
  difficulty: string,
  fallbackTopic: string,
  languages: string[]
) {
  const kind = draftKindFor(type);
  const base = {
    title: draft.title,
    statement: draft.statement,
    type: type as any,
    difficulty: difficulty as any,
    topic: draft.topic?.trim() || fallbackTopic,
    tags: draft.tags,
    options: null as any,
    answer: null as string | null,
    explanation: draft.explanation as string | null,
    optimalSolution: null as any,
    bruteForceSolution: null as any,
    testCases: null as any,
    validationAssets: null as any,
    languages: [] as string[],
  };

  if (kind === 'code') {
    const d = draft as CodeDraft;
    return {
      ...base,
      explanation: [
        d.explanation,
        d.timeComplexity && `Time Complexity: ${d.timeComplexity}`,
        d.spaceComplexity && `Space Complexity: ${d.spaceComplexity}`,
        d.bruteForceComplexity && `Brute Force: ${d.bruteForceComplexity}`,
      ].filter(Boolean).join('\n\n'),
      optimalSolution: d.optimalSolution,
      bruteForceSolution: d.bruteForceSolution,
      testCases: d.testCases,
      validationAssets: { inputGenerator: d.inputGenerator },
      languages,
    };
  }

  if (kind === 'sql') {
    const d = draft as SqlDraft;
    return {
      ...base,
      answer: d.referenceQuery,
      optimalSolution: { sql: d.referenceQuery },
      bruteForceSolution: { sql: d.alternativeQuery },
      validationAssets: { sqlDdl: d.ddl, sqlDatasets: d.datasets, orderMatters: d.orderMatters },
      languages: ['sql'],
    };
  }

  if (kind === 'design') {
    const d = draft as DesignDraft;
    return {
      ...base,
      answer: d.referenceOutline,
      validationAssets: { requirements: d.requirements, rubric: d.rubric },
    };
  }

  const d = draft as McqDraft;
  return {
    ...base,
    options: d.options,
    answer: d.answer,
    validationAssets: (d.verification ? { verification: d.verification } : null) as any,
  };
}
