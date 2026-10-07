/**
 * End-to-end suite. Real: Express app, JWT auth, Postgres (via Prisma), Redis,
 * BullMQ queues + workers, code execution (local sandbox driver), webhook HTTP
 * delivery, PDF/JSON export. Scripted: the LLM only.
 *
 * Run with `npm run test:e2e --workspace=apps/api` — see vitest.e2e.config.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'node:http';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { LLMClient } from '../../services/llmService.js';
import { maxSubarrayDraft, BUGGY_OPTIMAL_PYTHON } from '../fixtures/maxSubarray.js';

// ---- Scripted LLM ---------------------------------------------------------
// Everything except the two client factories is the real llmService.
const llm = vi.hoisted(() => ({
  respond: (_prompt: string): string | Promise<string> => { throw new Error('no LLM script set for this test'); },
  /** The independent solver for coding questions. null = solve correctly based on the statement. */
  blindSolve: null as null | ((prompt: string) => string),
  prompts: [] as string[],
}));

vi.mock('../../services/llmService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/llmService.js')>();
  const { isBlindCodeSolvePrompt } = await import('../../services/prompts.js');
  const { OPTIMAL } = await import('../fixtures/maxSubarray.js');
  const LARGEST = 'import sys\nd = sys.stdin.read().split()\nprint(max(int(x) for x in d[1:int(d[0])+1]))\n';

  const fake = (provider: 'anthropic' | 'openai'): LLMClient => ({
    provider,
    model: 'claude-opus-5-5',
    async complete(prompt) {
      llm.prompts.push(prompt);
      const text = isBlindCodeSolvePrompt(prompt)
        ? (llm.blindSolve
            ? llm.blindSolve(prompt)
            : JSON.stringify({ code: /Print the largest of them/.test(prompt) ? LARGEST : OPTIMAL.python }))
        : await llm.respond(prompt);
      return { text, usage: { inputTokens: Math.ceil(prompt.length / 4), outputTokens: Math.ceil(text.length / 4) } };
    },
  });
  return {
    ...actual,
    getLLMClient: () => fake('anthropic'),
    getReviewerLLMClient: () => ({ client: fake('openai'), crossModel: true }),
  };
});

const { default: app } = await import('../../index.js');
const { prisma } = await import('../../utils/prisma.js');
const { connectRedis, redisClient, redisConnection } = await import('../../utils/redis.js');
const { startGenerationWorker } = await import('../../queues/generationWorker.js');
const { startWebhookWorker } = await import('../../queues/webhookQueue.js');
const { generationQueue } = await import('../../queues/generationQueue.js');
const { isEncrypted } = await import('../../utils/crypto.js');
const { requeueOrphanedItems, deleteExpiredLocalExports } = await import('../../services/maintenanceService.js');
const { localExportDir } = await import('../../services/exportService.js');
const { existsSync } = await import('node:fs');
const nodePath = await import('node:path');

// ---- Prompt classifiers and canned replies --------------------------------
const isCodeDraft = (p: string) => p.includes('verified by actually running code');
const isMcqDraft = (p: string) => p.includes('You write multiple-choice questions');
const isSqlDraft = (p: string) => p.includes('verified by actually running the queries in SQLite');
const isBlindSolve = (p: string) => p.startsWith('Answer this multiple-choice question');
const isAdversary = (p: string) => p.startsWith('You are reviewing a question');
const isRevision = (p: string) => p.includes('--- REVISION ---');
const isBlindCode = (p: string) => p.startsWith('Solve this programming problem.');
/** A correct max-subarray draft under its own title and wording, so de-duplication does not get in the way. */
const uniqueDraft = (title: string, statement: string, base: () => string = () => JSON.stringify(maxSubarrayDraft(['python']))) =>
  JSON.stringify({ ...JSON.parse(base()), title, statement });

const draftA = () => JSON.stringify(maxSubarrayDraft(['python', 'javascript']));
const buggyDraftA = () => JSON.stringify({ ...maxSubarrayDraft(['python']), optimalSolution: { python: BUGGY_OPTIMAL_PYTHON } });

/** A second, genuinely different problem: print the largest element. */
const draftB = () => JSON.stringify({
  title: 'Largest Element',
  statement: 'You are given n integers. Print the largest of them.\n\nInput\nThe first line contains n. The second line contains n space-separated integers.\n\nOutput\nPrint the largest value.\n\nConstraints\n1 <= n <= 100000, -10^9 <= a_i <= 10^9\n\nExamples\nInput:\n3\n4 9 2\nOutput:\n9',
  topic: 'Arrays',
  tags: ['arrays'],
  optimalSolution: {
    python: 'import sys\nd = sys.stdin.read().split()\nn = int(d[0])\nprint(max(int(x) for x in d[1:n+1]))\n',
    javascript: "const d = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean).map(Number);\nlet best = d[1];\nfor (let i = 2; i <= d[0]; i++) if (d[i] > best) best = d[i];\nconsole.log(best);\n",
  },
  bruteForceSolution: {
    python: 'import sys\nd = sys.stdin.read().split()\nn = int(d[0])\na = sorted(int(x) for x in d[1:n+1])\nprint(a[-1])\n',
    javascript: "const d = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean).map(Number);\nconst a = d.slice(1, d[0] + 1).sort((x, y) => x - y);\nconsole.log(a[a.length - 1]);\n",
  },
  testCases: [
    { input: '3\n4 9 2\n', expectedOutput: '9', label: 'Statement example', isSample: true },
    { input: '1\n-7\n', expectedOutput: '-7', label: 'edge: single', isEdgeCase: true },
    { input: '4\n-1 -2 -3 -4\n', expectedOutput: '-1', label: 'edge: all negative', isEdgeCase: true },
    { input: '2\n5 5\n', expectedOutput: '5', label: 'ties' },
    { input: '5\n1 2 3 4 5\n', expectedOutput: '5', label: 'sorted' },
    { input: '5\n5 4 3 2 1\n', expectedOutput: '5', label: 'reversed' },
  ],
  inputGenerator: "import sys, random\nseed, mode = sys.stdin.readline().split()\nrandom.seed(int(seed))\nn = 100000 if mode == 'large' else random.randint(1, 6)\nprint(n)\nprint(' '.join(str(random.randint(-9, 9)) for _ in range(n)))\n",
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  bruteForceComplexity: 'O(n log n)',
  explanation: 'Scan once and keep the maximum.',
});

const mcqDraft = () => JSON.stringify({
  title: 'Preventing overrides in Java',
  statement: 'In Java, which keyword placed on an instance method prevents subclasses from overriding it?',
  topic: 'OOP Concepts',
  tags: ['java', 'inheritance'],
  options: [{ id: 'A', text: 'static' }, { id: 'B', text: 'final' }, { id: 'C', text: 'abstract' }, { id: 'D', text: 'volatile' }],
  answer: 'B',
  explanation: 'A final method cannot be overridden; the others do not have that effect on instance methods.',
});

const sqlDraft = () => JSON.stringify({
  title: 'Highest salary per department',
  statement: 'Table employees(id, name, dept, salary). For each department print the department and its highest salary. Output columns: dept, max_salary. Row order does not matter.',
  topic: 'SQL',
  tags: ['group-by'],
  ddl: 'CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, dept TEXT, salary INTEGER);',
  datasets: [
    "INSERT INTO employees VALUES (1,'Ann','eng',120),(2,'Bob','eng',100),(3,'Cy','ops',90),(4,'Di','ops',95);",
    "INSERT INTO employees VALUES (1,'Ann','eng',100),(2,'Bob','eng',100);",
    "INSERT INTO employees VALUES (1,'Solo','hr',50);",
  ],
  referenceQuery: 'SELECT dept, MAX(salary) AS max_salary FROM employees GROUP BY dept',
  alternativeQuery: 'SELECT DISTINCT e.dept, e.salary AS max_salary FROM employees e WHERE NOT EXISTS (SELECT 1 FROM employees o WHERE o.dept = e.dept AND o.salary > e.salary)',
  orderMatters: false,
  explanation: 'Aggregate with GROUP BY; the alternative uses an anti-join.',
});

const blindSolve = (answer: string) => JSON.stringify({ answer, confidence: 'high', reasoning: 'final forbids overriding', alsoDefensible: [] });
const noIssue = () => JSON.stringify({ foundIssue: false, severity: 'minor', issue: null });

// ---- Harness ---------------------------------------------------------------
let generationWorker: ReturnType<typeof startGenerationWorker>;
let webhookWorker: ReturnType<typeof startWebhookWorker>;
let hookServer: http.Server;
let hookUrl: string;
const received: { headers: http.IncomingHttpHeaders; body: string }[] = [];

const tokens: Record<string, string> = {};
const ids = { orgA: '', orgB: '', adminA: '' };

async function login(email: string, organizationSlug: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123', organizationSlug });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

const baseRequest = {
  roleLevel: 'sde1',
  topics: ['Arrays'],
  difficultyDistribution: { easy: 0, medium: 100, hard: 0 },
  totalQuestions: 1,
  questionTypes: ['DSA'],
  languages: ['python'],
  llmProvider: 'anthropic',
};

async function startJob(body: Record<string, unknown>, who = 'adminA') {
  const res = await request(app).post('/api/generate').set(auth(who)).send({ ...baseRequest, ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(202);
  return res.body.jobId as string;
}

async function waitForJob(jobId: string, who = 'adminA', timeoutMs = 150_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app).get(`/api/generate/status/${jobId}`).set(auth(who));
    expect(res.status).toBe(200);
    if (res.body.done) return res.body;
    if (Date.now() > deadline) throw new Error(`Job ${jobId} did not finish: ${JSON.stringify(res.body.items)}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function waitFor<T>(probe: () => Promise<T | null | undefined | false>, what: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

beforeAll(async () => {
  // Safety net on top of the config check: never truncate something that looks real.
  if (!/127\.0\.0\.1|localhost|_e2e|test/i.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Refusing to run: DATABASE_URL does not look like a disposable test database.');
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AuditLog","ExportRecord","PaperQuestion","Paper","QuestionReview","QuestionHistory","GenerationItem","GenerationBatch","Question","User","Organization" CASCADE'
  );
  await connectRedis();
  await redisClient.flushdb();

  const passwordHash = await bcrypt.hash('password123', 4);
  const orgA = await prisma.organization.create({ data: { name: 'Org A', slug: 'org-a', maxQuestionsPerDay: 50 } });
  const orgB = await prisma.organization.create({ data: { name: 'Org B', slug: 'org-b' } });
  ids.orgA = orgA.id;
  ids.orgB = orgB.id;
  const adminA = await prisma.user.create({ data: { email: 'admin@a.test', name: 'Admin A', role: 'ADMIN', passwordHash, organizationId: orgA.id } });
  ids.adminA = adminA.id;
  await prisma.user.create({ data: { email: 'reviewer@a.test', name: 'Reviewer A', role: 'REVIEWER', passwordHash, organizationId: orgA.id } });
  await prisma.user.create({ data: { email: 'admin@b.test', name: 'Admin B', role: 'ADMIN', passwordHash, organizationId: orgB.id } });

  tokens.adminA = await login('admin@a.test', 'org-a');
  tokens.reviewerA = await login('reviewer@a.test', 'org-a');
  tokens.adminB = await login('admin@b.test', 'org-b');

  hookServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.writeHead(200).end('ok');
    });
  });
  await new Promise<void>((resolve) => hookServer.listen(0, '127.0.0.1', resolve));
  hookUrl = `http://127.0.0.1:${(hookServer.address() as AddressInfo).port}/hook`;

  generationWorker = startGenerationWorker();
  webhookWorker = startWebhookWorker();
});

afterAll(async () => {
  await Promise.all([generationWorker?.close(), webhookWorker?.close()]);
  await generationQueue.close();
  hookServer?.close();
  await prisma.$disconnect();
  redisClient.disconnect();
  redisConnection.disconnect();
});

beforeEach(() => {
  llm.prompts.length = 0;
  llm.blindSolve = null;
  llm.respond = () => { throw new Error('no LLM script set for this test'); };
});

// ---- Tests -----------------------------------------------------------------
describe('authentication & tenant isolation', () => {
  it('has no public registration: anonymous and non-admin callers are refused', async () => {
    const body = { email: 'evil@x.test', password: 'password123', name: 'Evil', organizationSlug: 'org-a', role: 'ADMIN' };
    expect((await request(app).post('/api/auth/register').send(body)).status).toBe(401);
    expect((await request(app).post('/api/auth/register').set(auth('reviewerA')).send(body)).status).toBe(403);
    expect(await prisma.user.findUnique({ where: { email: 'evil@x.test' } })).toBeNull();
  });

  it('lets an admin create a user only inside their own organization', async () => {
    const res = await request(app).post('/api/auth/register').set(auth('adminB'))
      .send({ email: 'new@b.test', password: 'password123', name: 'New B', organizationSlug: 'org-a', role: 'GENERATOR' });
    expect(res.status).toBe(201);
    const created = await prisma.user.findUniqueOrThrow({ where: { email: 'new@b.test' } });
    expect(created.organizationId).toBe(ids.orgB); // the slug in the body is ignored
    expect(created.role).toBe('GENERATOR');
  });

  it('rejects mock-token when ALLOW_MOCK_AUTH is not enabled', async () => {
    const res = await request(app).get('/api/questions').set({ Authorization: 'Bearer mock-token' });
    expect(res.status).toBe(401);
  });

  it('gives the same generic error for a wrong password and an unknown organization', async () => {
    const wrongPw = await request(app).post('/api/auth/login').send({ email: 'admin@a.test', password: 'wrong-password', organizationSlug: 'org-a' });
    const noOrg = await request(app).post('/api/auth/login').send({ email: 'admin@a.test', password: 'password123', organizationSlug: 'nope' });
    expect([wrongPw.status, noOrg.status]).toEqual([401, 401]);
    expect(wrongPw.body.error.message).toBe(noOrg.body.error.message);
  });

  it('revokes a token on logout', async () => {
    const token = await login('reviewer@a.test', 'org-a');
    const headers = { Authorization: `Bearer ${token}` };
    expect((await request(app).get('/api/auth/me').set(headers)).status).toBe(200);
    expect((await request(app).post('/api/auth/logout').set(headers)).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(headers)).status).toBe(401);
  });

  it('returns 400 with field details for invalid input instead of a 500', async () => {
    const res = await request(app).post('/api/generate').set(auth('adminA')).send({ ...baseRequest, totalQuestions: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.issues[0].path).toBe('totalQuestions');
  });
});

describe('generation pipeline (real queue, real DB, real code execution)', () => {
  let paperId: string;
  let validatedQuestionId: string;
  let webhookSecret: string;

  it('stores the webhook secret encrypted and refuses internal webhook targets', async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'false';
    const blocked = await request(app).post('/api/webhooks/configure').set(auth('adminA')).send({ webhookUrl: 'http://169.254.169.254/latest/meta-data/' });
    expect(blocked.status).toBe(400);
    expect((await request(app).post('/api/webhooks/configure').set(auth('adminA')).send({ webhookUrl: hookUrl })).status).toBe(400);

    process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'true'; // dev flag, so the test can receive deliveries on localhost
    const ok = await request(app).post('/api/webhooks/configure').set(auth('adminA')).send({ webhookUrl: hookUrl });
    expect(ok.status).toBe(200);
    webhookSecret = ok.body.webhookSecret;

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: ids.orgA } });
    expect(isEncrypted(org.webhookSecret!)).toBe(true);
    expect(org.webhookSecret).not.toContain(webhookSecret);
  });

  it('generates 2 questions in parallel, de-duplicates twins inside the batch, and reports real progress', async () => {
    const paper = await prisma.paper.create({ data: { title: 'Target paper', organizationId: ids.orgA, config: {} } });
    paperId = paper.id;

    // Both jobs first receive the SAME draft. Whoever is told "too similar" must write a different problem.
    llm.respond = (p) => {
      if (!isCodeDraft(p)) throw new Error('unexpected prompt');
      return isRevision(p) && p.includes('too similar') ? draftB() : draftA();
    };

    const jobId = await startJob({
      totalQuestions: 2,
      difficultyDistribution: { easy: 100, medium: 0, hard: 0 },
      languages: ['python', 'javascript'],
      paperId,
    });
    const status = await waitForJob(jobId);

    expect(status.state).toBe('completed');
    expect(status.progress).toBe(100);
    expect(status.counts).toMatchObject({ validated: 2, failed: 0 });
    expect(status.items.map((i: any) => i.title).sort()).toEqual(['Largest Element', 'Maximum Subarray Sum']);
    expect(status.items.every((i: any) => i.status === 'VALIDATED' && i.questionId)).toBe(true);
    // Real, measured usage — and a real price for a known model.
    expect(status.usage.inputTokens).toBeGreaterThan(500);
    expect(status.usage.outputTokens).toBeGreaterThan(500);
    expect(status.usage.costUsd).toBeGreaterThan(0);

    const questions = await prisma.question.findMany({ where: { organizationId: ids.orgA }, orderBy: { title: 'asc' } });
    expect(questions).toHaveLength(2); // one row per slot, despite the retry
    for (const q of questions) {
      expect(q.status).toBe('VALIDATED');
      const v = q.validationResult as any;
      expect(v.method).toBe('sandbox_differential');
      expect(v.passed).toBe(true);
      expect(v.stats.sandboxRuns).toBeGreaterThan(20);
      expect(v.stats.generatedCases).toBeGreaterThan(0);
      // A second model solved it from the statement alone and got the same answers.
      expect(v.stats.blindSolver).toBe('agreed');
      expect(v.crossModel).toBe(true);
      expect(v.stages.blindSolvePassed).toBe(true);
      // Stored test cases include generated inputs with executed outputs.
      const cases = q.testCases as any[];
      expect(cases.some((c) => /^Generated/.test(c.label))).toBe(true);
      expect(cases.every((c) => c.expectedOutput !== '')).toBe(true);
      expect(q.embeddingVector).toHaveLength(256);
    }
    validatedQuestionId = questions.find((q) => q.title === 'Maximum Subarray Sum')!.id;

    // The independent solver was shown the statement and nothing else: no solutions, no test cases.
    const blindPrompts = llm.prompts.filter(isBlindCode);
    expect(blindPrompts).toHaveLength(2);
    for (const prompt of blindPrompts) {
      expect(prompt).not.toContain('def main');
      expect(prompt).not.toContain('bruteForceSolution');
      expect(prompt).not.toContain('expectedOutput');
    }

    // paperId is honoured: both questions are attached, in distinct positions.
    const attached = await prisma.paperQuestion.findMany({ where: { paperId }, orderBy: { order: 'asc' } });
    expect(attached).toHaveLength(2);
    expect(new Set(attached.map((a) => a.order)).size).toBe(2);
  });

  it('delivers signed webhooks for validated questions and batch completion', async () => {
    await waitFor(async () => received.filter((r) => JSON.parse(r.body).event === 'question.validated').length >= 2
      && received.some((r) => JSON.parse(r.body).event === 'generation.completed'), 'webhook deliveries');

    for (const delivery of received) {
      const expected = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(delivery.body).digest('hex');
      expect(delivery.headers['x-questionforge-signature']).toBe(expected);
    }
    const completed = JSON.parse(received.find((r) => JSON.parse(r.body).event === 'generation.completed')!.body);
    expect(completed.data).toMatchObject({ total: 2, validated: 2, failed: 0 });
  });

  it('hides a job from other organizations, on both the status and stream endpoints', async () => {
    const batch = await prisma.generationBatch.findFirstOrThrow({ where: { organizationId: ids.orgA } });
    expect((await request(app).get(`/api/generate/status/${batch.id}`).set(auth('adminB'))).status).toBe(404);
    expect((await request(app).get(`/api/generate/status/${batch.id}/stream`).set(auth('adminB'))).status).toBe(404);
  });

  it('streams status over SSE with a normal Authorization header, and refuses a token in the URL', async () => {
    const batch = await prisma.generationBatch.findFirstOrThrow({ where: { organizationId: ids.orgA } });
    const inUrl = await request(app).get(`/api/generate/status/${batch.id}/stream?token=${tokens.adminA}`);
    expect(inUrl.status).toBe(401);

    const res = await request(app).get(`/api/generate/status/${batch.id}/stream`).set(auth('adminA')).buffer(true).parse((r, cb) => {
      let data = '';
      r.on('data', (c) => { data += c; });
      r.on('end', () => cb(null, data));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const frame = JSON.parse(String(res.body).split('\n\n')[0].replace(/^data: /, ''));
    expect(frame).toMatchObject({ jobId: batch.id, done: true, progress: 100 });
    expect(frame.items).toHaveLength(2);
  });

  it('feeds the validator report back to the LLM and passes on the corrected draft', async () => {
    // De-duplication is lexical, so this scenario uses its own wording for the same task.
    const reword = (json: string) => JSON.stringify({
      ...JSON.parse(json),
      title: 'Best Contiguous Run',
      statement: 'A hiker logs daily altitude gains and losses. Report the greatest net climb achievable over any unbroken stretch of days.\n\nInput\nFirst the day count, then that many signed whole numbers.\n\nOutput\nOne whole number.',
    });
    llm.respond = (p) => reword(isRevision(p) ? JSON.stringify(maxSubarrayDraft(['python'])) : buggyDraftA());

    const status = await waitForJob(await startJob({}));

    expect(status.items[0]).toMatchObject({ status: 'VALIDATED', attempts: 2 });
    // The second prompt carried the real sandbox finding.
    const revision = llm.prompts.find(isRevision)!;
    expect(revision).toMatch(/Differential testing found/);
    expect(revision).toMatch(/Optimal solution \(python\) printed "0"/);

    const rows = await prisma.question.findMany({ where: { organizationId: ids.orgA, title: 'Best Contiguous Run' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'VALIDATED', retryCount: 1 });
    expect((rows[0].validationResult as any).stats.complexityGap).toBe('confirmed');
  });

  it('marks a question FAILED, with the reason, when no attempt survives validation', async () => {
    llm.respond = () => JSON.stringify({
      ...JSON.parse(buggyDraftA()),
      title: 'Never Correct',
      statement: 'A shopkeeper tracks hourly profit and loss on a ledger. Determine the most lucrative uninterrupted shift window.\n\nInput\nHour tally followed by signed ledger entries.\n\nOutput\nSingle figure.',
    });

    const status = await waitForJob(await startJob({}));

    expect(status.state).toBe('failed');
    expect(status.items[0]).toMatchObject({ status: 'FAILED', attempts: 3 });
    expect(status.items[0].failureReason).toMatch(/Differential testing found/);
    expect(llm.prompts).toHaveLength(3);

    const q = await prisma.question.findFirstOrThrow({ where: { title: 'Never Correct' } });
    expect(q.status).toBe('FAILED');
    expect((q.validationResult as any).passed).toBe(false);
    expect(q.embeddingVector).toHaveLength(0); // a failed draft must not block future ones as a "duplicate"
  });

  it('validates an MCQ by blind solve + review and an SQL question by execution, and labels each honestly', async () => {
    llm.respond = (p) => {
      if (isMcqDraft(p)) return mcqDraft();
      if (isSqlDraft(p)) return sqlDraft();
      if (isBlindSolve(p)) return blindSolve('B');
      if (isAdversary(p)) return noIssue();
      throw new Error('unexpected prompt');
    };
    const status = await waitForJob(await startJob({ totalQuestions: 2, questionTypes: ['MCQ', 'SQL'], topics: ['OOP Concepts', 'SQL'] }));
    expect(status.counts.validated).toBe(2);

    const mcq = await prisma.question.findFirstOrThrow({ where: { type: 'MCQ', organizationId: ids.orgA } });
    const mv = mcq.validationResult as any;
    expect(mv.method).toBe('llm_review');
    expect(mv.crossModel).toBe(true);
    expect(mv.stages).toMatchObject({ blindSolvePassed: true, adversaryDebatePassed: true });
    // No code ran for an MCQ, so the execution stages must not claim to have passed.
    expect(mv.stages.optimalSolutionPassed).toBe(false);
    expect(mv.stages.crossCheckPassed).toBe(false);
    // The blind-solve prompt never contained the key.
    expect(llm.prompts.find(isBlindSolve)).not.toMatch(/"answer"\s*:\s*"B"/);

    const sql = await prisma.question.findFirstOrThrow({ where: { type: 'SQL', organizationId: ids.orgA } });
    expect((sql.validationResult as any).method).toBe('sandbox_sql');
    expect((sql.testCases as any[])[0].expectedOutput).toBe('eng|120\nops|95');
  });

  it('fails an MCQ whose answer key the blind solver disagrees with', async () => {
    llm.respond = (p) => {
      if (isMcqDraft(p)) return JSON.stringify({ ...JSON.parse(mcqDraft()), title: 'Wrong key', statement: 'Consider a Kotlin-free legacy codebase written for the JVM. Which modifier forbids child classes from replacing a parent routine?', answer: 'A' });
      if (isBlindSolve(p)) return blindSolve('B');
      throw new Error('adversary must not be reached when the blind solve fails');
    };
    const status = await waitForJob(await startJob({ questionTypes: ['MCQ'], topics: ['OOP Concepts'] }));
    expect(status.items[0].status).toBe('FAILED');
    expect(status.items[0].failureReason).toMatch(/chose B, but the key says A/);
  });

  it('retries on provider outages, then fails the item cleanly instead of leaving it stuck', async () => {
    let calls = 0;
    llm.respond = () => { calls++; throw Object.assign(new Error('503 Service Unavailable'), { status: 503 }); };

    const status = await waitForJob(await startJob({}));

    expect(calls).toBe(3); // one per BullMQ attempt (provider-level retries live inside the real clients)
    expect(status.items[0].status).toBe('FAILED');
    expect(status.items[0].failureReason).toMatch(/Gave up after 3 attempts: 503/);
    expect(await prisma.question.count({ where: { status: 'VALIDATING' } })).toBe(0);
    expect(await prisma.generationItem.count({ where: { status: { in: ['QUEUED', 'GENERATING', 'VALIDATING'] } } })).toBe(0);
  });

  it('enforces the daily quota on requested question slots', async () => {
    const used = await prisma.generationItem.count({ where: { batch: { organizationId: ids.orgA, kind: 'GENERATE' } } });
    await prisma.organization.update({ where: { id: ids.orgA }, data: { maxQuestionsPerDay: used + 1 } });
    const res = await request(app).post('/api/generate').set(auth('adminA')).send({ ...baseRequest, totalQuestions: 2 });
    expect(res.status).toBe(429);
    expect(res.body.error.message).toMatch(new RegExp(`Used ${used} of ${used + 1}`));
    await prisma.organization.update({ where: { id: ids.orgA }, data: { maxQuestionsPerDay: 500 } });
  });

  it('rejects a paperId that belongs to another organization', async () => {
    const foreign = await prisma.paper.create({ data: { title: 'B paper', organizationId: ids.orgB, config: {} } });
    const res = await request(app).post('/api/generate').set(auth('adminA')).send({ ...baseRequest, paperId: foreign.id });
    expect(res.status).toBe(404);
  });

  describe('editing and re-validation', () => {
    it('refuses to set protected fields through PATCH', async () => {
      const res = await request(app).patch(`/api/questions/${validatedQuestionId}`).set(auth('reviewerA')).send({ status: 'APPROVED' });
      expect(res.status).toBe(400);
      expect((await prisma.question.findUniqueOrThrow({ where: { id: validatedQuestionId } })).status).toBe('VALIDATED');
    });

    it('keeps a title-only edit VALIDATED (no re-validation needed)', async () => {
      const res = await request(app).patch(`/api/questions/${validatedQuestionId}`).set(auth('reviewerA')).send({ title: 'Maximum Subarray Sum (Kadane)' });
      expect(res.status).toBe(200);
      expect(res.body.revalidationJobId).toBeNull();
      expect(res.body.question.status).toBe('VALIDATED');
    });

    it('re-validates after a content edit: a wrong expected output fails, the fix passes', async () => {
      const original = await prisma.question.findUniqueOrThrow({ where: { id: validatedQuestionId } });
      const cases = original.testCases as any[];
      const broken = cases.map((c, i) => (i === 0 ? { ...c, expectedOutput: '999' } : c));

      const bad = await request(app).patch(`/api/questions/${validatedQuestionId}`).set(auth('reviewerA')).send({ testCases: broken, editNote: 'typo' });
      expect(bad.status).toBe(200);
      expect(bad.body.question.status).toBe('VALIDATING');
      expect(bad.body.revalidationJobId).toBeTruthy();

      // While it is being validated it can be neither reviewed nor edited again.
      const review = await request(app).post(`/api/questions/${validatedQuestionId}/review`).set(auth('reviewerA')).send({ decision: 'APPROVED' });
      expect(review.status).toBe(400);

      const failed = await waitForJob(bad.body.revalidationJobId, 'reviewerA');
      expect(failed.kind).toBe('REVALIDATE');
      expect(failed.items[0].status).toBe('FAILED');
      expect(failed.items[0].failureReason).toMatch(/expected output the solutions do not produce/);
      expect((await prisma.question.findUniqueOrThrow({ where: { id: validatedQuestionId } })).status).toBe('FAILED');

      const good = await request(app).patch(`/api/questions/${validatedQuestionId}`).set(auth('reviewerA')).send({ testCases: cases });
      const passed = await waitForJob(good.body.revalidationJobId, 'reviewerA');
      expect(passed.items[0].status).toBe('VALIDATED');

      const after = await prisma.question.findUniqueOrThrow({ where: { id: validatedQuestionId }, include: { history: true } });
      expect(after.status).toBe('VALIDATED');
      expect(after.version).toBe(original.version + 2);
      expect(after.history.length).toBeGreaterThanOrEqual(2);
      expect(llm.prompts).toHaveLength(0); // re-validating code never calls the LLM
    });

    it('approves a validated question and records the review', async () => {
      const res = await request(app).post(`/api/questions/${validatedQuestionId}/review`).set(auth('reviewerA')).send({ decision: 'APPROVED', note: 'Good' });
      expect(res.status).toBe(200);
      expect((await prisma.question.findUniqueOrThrow({ where: { id: validatedQuestionId } })).status).toBe('APPROVED');
    });
  });

  describe('completing an imported draft', () => {
    const importDraft = () => prisma.question.create({
      data: {
        organizationId: ids.orgA, type: 'DSA', difficulty: 'MEDIUM', topic: 'Arrays', status: 'DRAFT',
        title: 'Imported: Kadane', statement: 'Find the contiguous part of the array with the biggest total.',
        languages: ['python'], tags: [], sourcePlatform: 'leetcode', sourceUrl: 'https://example.test/kadane',
      },
    });

    it('writes and validates solutions for the imported statement, keeping its title and source', async () => {
      const draft = await importDraft();
      llm.respond = (p) => {
        expect(p).toContain('Do NOT change what it asks');
        expect(p).toContain(draft.statement);
        return JSON.stringify(maxSubarrayDraft(['python']));
      };

      const res = await request(app).post(`/api/questions/${draft.id}/complete`).set(auth('adminA')).send({ languages: ['python'], llmProvider: 'anthropic' });
      expect(res.status).toBe(202);
      const status = await waitForJob(res.body.jobId);
      expect(status.kind).toBe('COMPLETE_IMPORT');
      expect(status.items[0].status).toBe('VALIDATED');

      const done = await prisma.question.findUniqueOrThrow({ where: { id: draft.id } });
      expect(done).toMatchObject({ status: 'VALIDATED', title: 'Imported: Kadane', sourcePlatform: 'leetcode' });
      expect((done.optimalSolution as any).python).toContain('def main');
      expect((done.validationResult as any).method).toBe('sandbox_differential');
    });

    it('leaves the import as an untouched DRAFT when completion fails', async () => {
      const draft = await importDraft();
      llm.respond = () => buggyDraftA();

      const res = await request(app).post(`/api/questions/${draft.id}/complete`).set(auth('adminA')).send({ llmProvider: 'anthropic' });
      const status = await waitForJob(res.body.jobId);
      expect(status.items[0].status).toBe('FAILED');
      expect(status.items[0].failureReason).toMatch(/Differential testing found/);

      const after = await prisma.question.findUniqueOrThrow({ where: { id: draft.id } });
      expect(after.status).toBe('DRAFT');
      expect(after.statement).toBe(draft.statement);
      expect(after.optimalSolution).toBeNull();
    });

    it('only completes drafts', async () => {
      const res = await request(app).post(`/api/questions/${validatedQuestionId}/complete`).set(auth('adminA')).send({});
      expect(res.status).toBe(400);
    });

    it('answers 400 straight away when no LLM key is available, instead of queueing a doomed job', async () => {
      const draft = await importDraft();
      // No provider named and (in this suite) no real keys anywhere → nothing can be resolved.
      const res = await request(app).post(`/api/questions/${draft.id}/complete`).set(auth('adminA')).send({});
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/No LLM API key is configured/);
      expect(await prisma.generationItem.count({ where: { questionId: draft.id } })).toBe(0);
    });
  });

  describe('independent solver for coding questions', () => {
    it('rejects a draft whose statement a second model reads differently, and feeds that back', async () => {
      llm.respond = () => uniqueDraft('Ambiguous Statement', 'A gardener measures daily growth of a vine, some days it shrinks. Report the best total over a stretch of days.\n\nInput\nDay count, then the signed daily changes.\n\nOutput\nOne whole number.');
      // The independent solver decides an empty stretch (total 0) is allowed — a legitimate reading of that statement.
      llm.blindSolve = () => JSON.stringify({ code: BUGGY_OPTIMAL_PYTHON });

      const status = await waitForJob(await startJob({}));

      expect(status.items[0]).toMatchObject({ status: 'FAILED', attempts: 3 });
      expect(status.items[0].failureReason).toMatch(/independent solver that saw ONLY the statement/);
      // The disagreement reached the generator as feedback for its next attempt.
      expect(llm.prompts.filter((p) => isRevision(p) && /independent solver/.test(p)).length).toBe(2);
      const q = await prisma.question.findFirstOrThrow({ where: { title: 'Ambiguous Statement' } });
      expect((q.validationResult as any).stats.blindSolver).toBe('disagreed');
      expect((q.validationResult as any).stages.blindSolvePassed).toBe(false);
    });
  });

  describe('job controls', () => {
    let failedJobId: string;

    it('retries only the failed questions of a finished job, reusing their slots', async () => {
      // A job that fails for infrastructure reasons…
      llm.respond = () => { throw Object.assign(new Error('529 overloaded'), { status: 529 }); };
      failedJobId = await startJob({ totalQuestions: 2 });
      const failed = await waitForJob(failedJobId);
      expect(failed.counts).toMatchObject({ validated: 0, failed: 2 });

      // …is retried once the provider is back.
      const drafts = [
        uniqueDraft('Retry Winner One', 'A courier logs fuel gained and burned at each depot. Find the richest consecutive leg of the route.\n\nInput\nDepot count then signed litres.\n\nOutput\nOne whole number.'),
        uniqueDraft('Retry Winner Two', 'A streamer tracks follower swings per broadcast. Identify the strongest unbroken series of broadcasts.\n\nInput\nBroadcast count then signed swings.\n\nOutput\nOne whole number.'),
      ];
      let n = 0;
      llm.respond = (p) => (isRevision(p) ? drafts[1] : drafts[n++ % 2]);

      const res = await request(app).post(`/api/generate/jobs/${failedJobId}/retry-failed`).set(auth('adminA'));
      expect(res.status).toBe(202);
      expect(res.body.retried).toBe(2);

      const after = await waitForJob(failedJobId);
      expect(after.counts.validated).toBeGreaterThanOrEqual(1);
      expect(after.total).toBe(2); // same job, same two slots — nothing was added
      expect(await prisma.generationItem.count({ where: { batchId: failedJobId } })).toBe(2);
    });

    it('refuses to retry a job that is still running or belongs to someone else', async () => {
      expect((await request(app).post(`/api/generate/jobs/${failedJobId}/retry-failed`).set(auth('adminB'))).status).toBe(404);
      expect((await request(app).post(`/api/generate/jobs/${failedJobId}/retry-failed`).set(auth('reviewerA'))).status).toBe(403);
    });

    it('cancels a running job: queued questions are dropped at once, running ones stop at their next step', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      let calls = 0;
      llm.respond = async () => { calls++; await gate; return buggyDraftA(); };

      // 6 questions against 4 worker slots: 4 start (and block on the LLM), 2 wait in the queue.
      const jobId = await startJob({ totalQuestions: 6 });
      await waitFor(async () => calls >= 4, 'four drafting calls to start');

      const cancel = await request(app).post(`/api/generate/jobs/${jobId}/cancel`).set(auth('adminA'));
      expect(cancel.status).toBe(200);

      const during = (await request(app).get(`/api/generate/status/${jobId}`).set(auth('adminA'))).body;
      expect(during.cancelledAt).toBeTruthy();
      expect(during.items.filter((i: any) => i.status === 'FAILED' && /Cancelled/.test(i.failureReason)).length).toBe(2);
      expect(during.done).toBe(false); // four are still mid-call

      release();
      const done = await waitForJob(jobId);
      expect(done.items.every((i: any) => i.status === 'FAILED')).toBe(true);
      expect(done.items.filter((i: any) => /Cancelled/.test(i.failureReason)).length).toBeGreaterThanOrEqual(2);
      // No drafting call was started after the cancel: each running item stopped before its next attempt.
      expect(calls).toBe(4);
      expect(await prisma.question.count({ where: { status: 'VALIDATING' } })).toBe(0);

      expect((await request(app).post(`/api/generate/jobs/${jobId}/cancel`).set(auth('adminA'))).status).toBe(409);
      expect((await request(app).post(`/api/generate/jobs/${jobId}/cancel`).set(auth('adminB'))).status).toBe(404);
    });

    it('lists recent jobs with their outcome counts', async () => {
      const res = await request(app).get('/api/generate/jobs').set(auth('adminA'));
      expect(res.status).toBe(200);
      const job = res.body.jobs.find((j: any) => j.id === failedJobId);
      expect(job).toMatchObject({ kind: 'GENERATE', total: 2, llmProvider: 'anthropic' });
      expect(job.validated + job.failed).toBe(2);
      // Other tenants see none of them.
      const other = await request(app).get('/api/generate/jobs').set(auth('adminB'));
      expect(other.body.jobs).toHaveLength(0);
    });

    it('re-queues an item that lost its queue job, so it cannot stay "in progress" forever', async () => {
      llm.respond = () => uniqueDraft('Recovered Orphan', 'A lighthouse keeper notes tide rises and drops each hour. Work out the largest sustained net rise.\n\nInput\nHour count then signed centimetres.\n\nOutput\nOne whole number.');
      const batch = await prisma.generationBatch.create({
        data: {
          id: crypto.randomUUID(), organizationId: ids.orgA, requestedById: ids.adminA, kind: 'GENERATE', total: 1,
          config: { ...baseRequest, organizationId: ids.orgA, requestedBy: ids.adminA },
          // No BullMQ job is ever added for this item — as if Redis had lost it.
          items: { create: [{ index: 0, type: 'DSA', difficulty: 'MEDIUM', topic: 'Arrays', updatedAt: new Date(Date.now() - 3600_000) }] },
        },
      });

      expect(await requeueOrphanedItems()).toBe(1);
      const status = await waitForJob(batch.id);
      expect(status.items[0]).toMatchObject({ status: 'VALIDATED', title: 'Recovered Orphan' });
      // A healthy system has nothing to sweep.
      expect(await requeueOrphanedItems()).toBe(0);
    });
  });

  describe('bulk review, paper builder and analytics', () => {
    let approvedDsa: string[];

    it('approves several questions in one call and reports what it skipped', async () => {
      const validated = await prisma.question.findMany({ where: { organizationId: ids.orgA, status: 'VALIDATED', type: 'DSA' }, select: { id: true } });
      expect(validated.length).toBeGreaterThanOrEqual(2);
      const failedOne = await prisma.question.findFirstOrThrow({ where: { organizationId: ids.orgA, status: 'FAILED' } });
      const foreign = await prisma.question.create({
        data: { organizationId: ids.orgB, type: 'DSA', difficulty: 'EASY', topic: 'x', title: 'B question', statement: 's', status: 'VALIDATED', languages: [], tags: [] },
      });

      const res = await request(app).post('/api/questions/review-bulk').set(auth('reviewerA'))
        .send({ ids: [...validated.map((q) => q.id), failedOne.id, foreign.id], decision: 'APPROVED', note: 'batch ok' });

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(validated.length);
      expect(res.body.skipped.sort()).toEqual([failedOne.id, foreign.id].sort());
      // A FAILED question cannot be bulk-approved, and another tenant's question is untouched.
      expect((await prisma.question.findUniqueOrThrow({ where: { id: failedOne.id } })).status).toBe('FAILED');
      expect((await prisma.question.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe('VALIDATED');
      expect(await prisma.questionReview.count({ where: { note: 'batch ok' } })).toBe(validated.length);
      approvedDsa = (await prisma.question.findMany({ where: { organizationId: ids.orgA, status: 'APPROVED', type: 'DSA' }, select: { id: true } })).map((q) => q.id);
    });

    it('reports how many approved questions are available per type and difficulty', async () => {
      const res = await request(app).get('/api/papers/availability').set(auth('adminA'));
      const dsa = res.body.available.filter((a: any) => a.type === 'DSA').reduce((n: number, a: any) => n + a.count, 0);
      expect(dsa).toBe(approvedDsa.length);
    });

    it('assembles a paper from a blueprint using only approved questions, without repeats', async () => {
      const res = await request(app).post('/api/papers/assemble').set(auth('adminA'))
        .send({ title: 'Blueprint paper', blueprint: [{ type: 'DSA', count: 2 }, { type: 'DSA', difficulty: 'MEDIUM', count: 1 }] });
      expect(res.status, JSON.stringify(res.body)).toBe(201);

      const paper = await prisma.paper.findUniqueOrThrow({ where: { id: res.body.paper.id }, include: { questions: { include: { question: true } } } });
      expect(paper.questions).toHaveLength(3);
      expect(new Set(paper.questions.map((pq) => pq.questionId)).size).toBe(3);
      expect(paper.questions.every((pq) => pq.question.status === 'APPROVED' && pq.question.organizationId === ids.orgA)).toBe(true);
    });

    it('fails clearly, creating nothing, when the bank cannot fill the blueprint', async () => {
      const before = await prisma.paper.count();
      const res = await request(app).post('/api/papers/assemble').set(auth('adminA'))
        .send({ title: 'Too ambitious', blueprint: [{ type: 'DSA', count: 1 }, { type: 'SYSTEM_DESIGN', count: 3 }] });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/SYSTEM_DESIGN: need 3, only 0 approved/);
      expect(await prisma.paper.count()).toBe(before);
    });

    it('reorders and trims a paper, and refuses questions from another organization', async () => {
      const paper = await prisma.paper.findFirstOrThrow({ where: { title: 'Blueprint paper' }, include: { questions: { orderBy: { order: 'asc' } } } });
      const [a, b] = paper.questions.map((pq) => pq.questionId);

      const res = await request(app).patch(`/api/papers/${paper.id}`).set(auth('adminA')).send({ title: 'Renamed', questionIds: [b, a] });
      expect(res.status).toBe(200);
      expect(res.body.paper.title).toBe('Renamed');
      expect(res.body.paper.questions.map((pq: any) => pq.questionId)).toEqual([b, a]);

      const foreign = await prisma.question.findFirstOrThrow({ where: { organizationId: ids.orgB } });
      expect((await request(app).patch(`/api/papers/${paper.id}`).set(auth('adminA')).send({ questionIds: [a, foreign.id] })).status).toBe(400);
      expect((await request(app).patch(`/api/papers/${paper.id}`).set(auth('adminA')).send({ questionIds: [a, a] })).status).toBe(400);
      expect((await request(app).patch(`/api/papers/${paper.id}`).set(auth('adminB')).send({ title: 'x' })).status).toBe(404);
    });

    it('reports pass rate, attempts, measured spend and why questions failed', async () => {
      const res = await request(app).get('/api/analytics/generation?days=7').set(auth('adminA'));
      expect(res.status).toBe(200);
      const { totals, byType, failureReasons, byProvider, humanReview } = res.body;

      const items = await prisma.generationItem.findMany({ where: { batch: { organizationId: ids.orgA, kind: 'GENERATE' }, status: { in: ['VALIDATED', 'FAILED'] } } });
      const validated = items.filter((i) => i.status === 'VALIDATED').length;
      expect(totals).toMatchObject({ requested: items.length, validated, failed: items.length - validated });
      expect(totals.passRate).toBeCloseTo((validated / items.length) * 100, 1);
      expect(totals.costUsd).toBeGreaterThan(0);
      expect(totals.costPerValidatedUsd).toBeCloseTo(totals.costUsd / validated, 3);

      const dsa = byType.find((t: any) => t.type === 'DSA');
      expect(dsa.avgAttempts).toBeGreaterThan(1); // some needed retries
      const reasons = Object.fromEntries(failureReasons.map((f: any) => [f.reason, f.count]));
      expect(reasons['Solutions failed sandbox testing']).toBeGreaterThanOrEqual(1);
      // One coding question (independent program disagreed) and one MCQ (blind solver picked another option).
      expect(reasons['Independent solver disagreed (ambiguous or wrong)']).toBe(2);
      expect(reasons['Cancelled']).toBeGreaterThanOrEqual(2);
      expect(byProvider[0]).toMatchObject({ provider: 'anthropic' });
      expect(humanReview.approved).toBeGreaterThanOrEqual(3);

      // Tenant-scoped: organization B has generated nothing.
      const other = await request(app).get('/api/analytics/generation').set(auth('adminB'));
      expect(other.body.totals.requested).toBe(0);
    });
  });

  describe('export without S3', () => {
    it('exports JSON to local storage and serves it through an expiring token link', async () => {
      const res = await request(app).post('/api/export').set(auth('adminA')).send({ paperId, format: 'JSON' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.downloadUrl).toMatch(/^\/api\/export\/download\/[0-9a-f]{64}$/);

      const file = await request(app).get(res.body.downloadUrl); // no auth header: the token is the credential
      expect(file.status).toBe(200);
      expect(file.headers['content-disposition']).toMatch(/attachment/);
      const payload = JSON.parse(file.text);
      expect(payload.questions).toHaveLength(2);
      expect(JSON.stringify(payload)).not.toContain('optimalSolution'); // candidate-safe: no solutions

      expect((await request(app).get(`/api/export/download/${'0'.repeat(64)}`)).status).toBe(404);
      expect((await request(app).get('/api/export/download/..%2F..%2Fetc%2Fpasswd')).status).toBe(404);

      await prisma.exportRecord.updateMany({ where: { paperId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await request(app).get(res.body.downloadUrl)).status).toBe(410);

      // The maintenance sweep removes the expired file from disk.
      const record = await prisma.exportRecord.findFirstOrThrow({ where: { paperId, storageKey: { not: null } } });
      const onDisk = nodePath.join(localExportDir(), record.storageKey!);
      expect(existsSync(onDisk)).toBe(true);
      expect(await deleteExpiredLocalExports()).toBeGreaterThanOrEqual(1);
      expect(existsSync(onDisk)).toBe(false);
      expect((await prisma.exportRecord.findUniqueOrThrow({ where: { id: record.id } })).storageKey).toBeNull();
    });

    it('renders a PDF', async () => {
      const res = await request(app).post('/api/export').set(auth('adminA')).send({ paperId, format: 'PDF_INTERNAL' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const file = await request(app).get(res.body.downloadUrl).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(file.status).toBe(200);
      expect((file.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      expect((file.body as Buffer).length).toBeGreaterThan(5000);
    });

    it('does not let another organization export the paper', async () => {
      const res = await request(app).post('/api/export').set(auth('adminB')).send({ paperId, format: 'JSON' });
      expect(res.status).toBe(404);
    });
  });
});

describe('accounts: passwords, deactivation, roles', () => {
  const create = (email: string, role = 'REVIEWER') =>
    request(app).post('/api/auth/register').set(auth('adminA')).send({ email, password: 'password123', name: 'Temp User', role });
  const loginAs = (email: string, password = 'password123') =>
    request(app).post('/api/auth/login').send({ email, password, organizationSlug: 'org-a' });
  const me = (token: string) => request(app).get('/api/auth/me').set({ Authorization: `Bearer ${token}` });
  // JWT issue times have one-second resolution; make sure a later token is strictly newer.
  const tick = () => new Promise((r) => setTimeout(r, 1100));

  it('lets a user change their own password, signing out their other sessions', async () => {
    await create('pw@a.test');
    const sessionOne = (await loginAs('pw@a.test')).body.token;
    const sessionTwo = (await loginAs('pw@a.test')).body.token;
    await tick();

    const wrong = await request(app).post('/api/auth/change-password').set({ Authorization: `Bearer ${sessionOne}` })
      .send({ currentPassword: 'not-it', newPassword: 'brand-new-pass-1' });
    expect(wrong.status).toBe(400);

    const ok = await request(app).post('/api/auth/change-password').set({ Authorization: `Bearer ${sessionOne}` })
      .send({ currentPassword: 'password123', newPassword: 'brand-new-pass-1' });
    expect(ok.status).toBe(200);

    expect((await me(ok.body.token)).status).toBe(200);  // the fresh token works
    expect((await me(sessionTwo)).status).toBe(401);      // the other session is gone
    expect((await me(sessionOne)).status).toBe(401);      // and so is the old token
    expect((await loginAs('pw@a.test')).status).toBe(401);                       // old password
    expect((await loginAs('pw@a.test', 'brand-new-pass-1')).status).toBe(200);   // new password
  });

  it('lets an admin reset a password, which signs that user out', async () => {
    await create('reset@a.test');
    const token = (await loginAs('reset@a.test')).body.token;
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'reset@a.test' } });

    expect((await request(app).post(`/api/admin/users/${user.id}/reset-password`).set(auth('reviewerA')).send({ newPassword: 'admin-set-pass-9' })).status).toBe(403);
    expect((await request(app).post(`/api/admin/users/${user.id}/reset-password`).set(auth('adminB')).send({ newPassword: 'admin-set-pass-9' })).status).toBe(404);
    expect((await request(app).post(`/api/admin/users/${user.id}/reset-password`).set(auth('adminA')).send({ newPassword: 'admin-set-pass-9' })).status).toBe(200);

    expect((await me(token)).status).toBe(401);
    expect((await loginAs('reset@a.test', 'admin-set-pass-9')).status).toBe(200);
  });

  it('deactivates an account immediately and lets it be reactivated', async () => {
    await create('leaver@a.test');
    const token = (await loginAs('leaver@a.test')).body.token;
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'leaver@a.test' } });

    const off = await request(app).patch(`/api/admin/users/${user.id}/status`).set(auth('adminA')).send({ isActive: false });
    expect(off.status).toBe(200);
    expect((await me(token)).status).toBe(401);                     // existing session dies now, not in 24h
    expect((await loginAs('leaver@a.test')).status).toBe(401);      // and they cannot log back in
    expect((await loginAs('leaver@a.test')).body.error.message).toBe('Invalid credentials');

    await tick();
    await request(app).patch(`/api/admin/users/${user.id}/status`).set(auth('adminA')).send({ isActive: true });
    expect((await loginAs('leaver@a.test')).status).toBe(200);
  });

  it('protects the last admin and stops an admin locking themselves out', async () => {
    const self = await request(app).patch(`/api/admin/users/${ids.adminA}/status`).set(auth('adminA')).send({ isActive: false });
    expect(self.status).toBe(400);
    const demote = await request(app).patch(`/api/admin/users/${ids.adminA}/role`).set(auth('adminA')).send({ role: 'REVIEWER' });
    expect(demote.status).toBe(400);
    expect(demote.body.error.message).toMatch(/only active admin/);
  });

  it('makes a role change take effect at once by retiring tokens that carry the old role', async () => {
    await create('promoted@a.test', 'REVIEWER');
    const asReviewer = (await loginAs('promoted@a.test')).body.token;
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'promoted@a.test' } });
    expect((await request(app).get('/api/admin/users').set({ Authorization: `Bearer ${asReviewer}` })).status).toBe(403);

    await request(app).patch(`/api/admin/users/${user.id}/role`).set(auth('adminA')).send({ role: 'ADMIN' });
    expect((await me(asReviewer)).status).toBe(401); // old token (old role) no longer accepted
    await tick();
    const asAdmin = (await loginAs('promoted@a.test')).body.token;
    expect((await request(app).get('/api/admin/users').set({ Authorization: `Bearer ${asAdmin}` })).status).toBe(200);
  });

  it('only lets a named platform operator create organizations', async () => {
    const body = { name: 'New Tenant', slug: 'new-tenant' };
    expect((await request(app).post('/api/admin/organizations').set(auth('adminA')).send(body)).status).toBe(403);
    process.env.SUPERADMIN_EMAILS = 'someone@else.test, admin@a.test';
    expect((await request(app).post('/api/admin/organizations').set(auth('adminA')).send(body)).status).toBe(201);
    delete process.env.SUPERADMIN_EMAILS;
  });
});

describe('admin: per-organization LLM keys and the queue dashboard', () => {
  it('stores an organization key encrypted and never returns it', async () => {
    const secret = 'sk-ant-test-1234567890abcdefWXYZ';
    expect((await request(app).put('/api/admin/llm-keys').set(auth('reviewerA')).send({ provider: 'anthropic', apiKey: secret })).status).toBe(403);

    const put = await request(app).put('/api/admin/llm-keys').set(auth('adminA')).send({ provider: 'anthropic', apiKey: secret });
    expect(put.status).toBe(200);

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: ids.orgA } });
    const stored = (org.llmApiKeysEncrypted as any).anthropic as string;
    expect(isEncrypted(stored)).toBe(true);
    expect(JSON.stringify(org.llmApiKeysEncrypted)).not.toContain(secret);

    const get = await request(app).get('/api/admin/llm-keys').set(auth('adminA'));
    const anthropic = get.body.providers.find((p: any) => p.provider === 'anthropic');
    expect(anthropic).toMatchObject({ configured: true, source: 'org', last4: 'WXYZ' });
    expect(JSON.stringify(get.body)).not.toContain(secret);

    // Other tenants do not see it.
    const other = await request(app).get('/api/admin/llm-keys').set(auth('adminB'));
    expect(other.body.providers.find((p: any) => p.provider === 'anthropic').source).not.toBe('org');

    await request(app).put('/api/admin/llm-keys').set(auth('adminA')).send({ provider: 'anthropic', apiKey: null });
    const cleared = await prisma.organization.findUniqueOrThrow({ where: { id: ids.orgA } });
    expect((cleared.llmApiKeysEncrypted as any).anthropic).toBeUndefined();
  });

  it('opens Bull Board with a one-time ticket, never with a JWT in the URL', async () => {
    // The old way — the login JWT as a query parameter — no longer works.
    expect((await request(app).get(`/admin/queues?token=${tokens.adminA}`)).status).toBe(401);
    // Non-admins cannot mint a ticket.
    expect((await request(app).post('/api/admin/queues/ticket').set(auth('reviewerA'))).status).toBe(403);

    const ticket = await request(app).post('/api/admin/queues/ticket').set(auth('adminA'));
    expect(ticket.status).toBe(200);

    const first = await request(app).get(ticket.body.url);
    expect(first.status).toBe(302);
    expect(first.headers.location).toBe('/admin/queues'); // ticket stripped from the URL
    const cookie = first.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);

    // Single use.
    expect((await request(app).get(ticket.body.url)).status).toBe(401);

    // The session cookie opens the dashboard…
    const dashboard = await request(app).get('/admin/queues').set('Cookie', cookie.split(';')[0]);
    expect(dashboard.status).toBe(200);
    // …but is not an API login.
    const sessionJwt = decodeURIComponent(cookie.split(';')[0].split('=')[1]);
    expect((await request(app).get('/api/questions').set({ Authorization: `Bearer ${sessionJwt}` })).status).toBe(401);
  });
});
