# Testing

Two suites. The first needs nothing but Node and a few common toolchains. The second runs the real system.

```bash
npm test             # unit + real-execution tests, every workspace
npm run test:e2e     # end-to-end: needs a disposable Postgres and Redis
```

---

## 1. `npm test`

| Workspace | What it covers |
|---|---|
| `apps/api` | Validation engine, the independent solver, review logic, draft schemas, generation plan, failure classification, crypto, SSRF guard, boot-time config checks, JSON extraction, pricing, ingestion controller, health probes. |
| `packages/sandbox` | Piston client (mocked HTTP) and the local runner (real processes). |
| `packages/ai-orchestration` | The LangGraph generate → validate → retry state machine. |
| `packages/ingestion` | LeetCode / GeeksforGeeks adapters (mocked HTTP). |
| `apps/frontend` | Live job progress, the SSE client, question detail/edit, paper builder and export, bulk review, change password, user actions, job history, generation analytics, login, admin import tab. |

No database, Redis, LLM key or Docker is needed.

### Tests that execute real code

`apps/api/src/__tests__/validationService.test.ts` does not mock the sandbox. It runs real Python, JavaScript, C++, Java and SQLite programs through the local runner and checks that the validator:

- passes a correct problem in four languages and confirms the brute force times out at maximum size;
- rejects a solution with a real bug and names the failing input;
- catches a bug the hand-written cases miss, using generated inputs;
- rejects a miscalculated worked example;
- corrects a wrong hand-written expected output from execution;
- fails the difficulty check when brute force is as fast as optimal;
- rejects bare functions that print nothing;
- passes agreeing SQL queries and fails ones that disagree on a tie-heavy dataset;
- raises an infrastructure error — not a failed validation — when the sandbox is down;
- retries a single timed-out run, but still fails a real infinite loop;
- has the independent solver agree with a correct statement, disagree (naming the input) with an ambiguous one, and stay inconclusive when it returns nothing runnable.

Each of these is skipped (not failed) if its toolchain is missing: `python3`, `node`, `g++`, `javac`, `sqlite3`.

## 2. `npm run test:e2e`

`apps/api/src/__tests__/e2e/pipeline.e2e.ts`. **Real:** the Express app, JWT auth, Postgres through Prisma, Redis, both BullMQ queues and their workers, code execution, webhook delivery over HTTP to a local receiver, JSON and PDF export. **Scripted:** only the LLM, so the suite is free and repeatable.

It **truncates every table** in the database it is given, and flushes the Redis database. It refuses to run unless the URL looks disposable (contains `localhost`, `127.0.0.1`, `_e2e` or `test`). Never point it at a database you care about.

```bash
docker compose up -d postgres redis
createdb -h localhost -U qforge question_forge_e2e          # password: qforge_password
DATABASE_URL=postgresql://qforge:qforge_password@localhost:5432/question_forge_e2e \
  npm run db:migrate:deploy

E2E_DATABASE_URL=postgresql://qforge:qforge_password@localhost:5432/question_forge_e2e \
E2E_REDIS_URL=redis://localhost:6379/15 \
  npm run test:e2e
```

What it proves:

| Area | Checked end to end |
|---|---|
| Auth | No public registration; admins create users only in their own organization; `mock-token` refused; identical error for wrong password and unknown organization; logout revokes the token; invalid input is a 400 with field details. |
| Generation | Two questions generated in parallel; twins inside a batch de-duplicated; one row per slot despite retries; test cases stored with executed outputs; `paperId` honoured; measured token usage and cost. |
| Independent solver | Agrees on a sound question and is shown only the statement; when it reads a statement differently the question is rejected and the disagreement is fed back to the generator. |
| Job controls | Cancel drops queued questions at once and starts no further drafting calls; retry re-runs only the failed slots in place; job history is tenant-scoped; an item with no queue job is recovered by the sweeper. |
| Accounts | Change password signs out other sessions; admin reset; deactivation takes effect immediately and is reversible; the last admin is protected; a role change retires old tokens; only named operators can create organizations. |
| Review & papers | Bulk approve skips ineligible and foreign questions; blueprint assembly uses only approved questions without repeats and fails clearly when the bank is short; reorder/trim; foreign questions refused. |
| Analytics | Pass rate, attempts, measured spend, cost per validated question and failure-reason buckets match the database; tenant-scoped. |
| Feedback loop | A buggy draft fails differential testing, the report reaches the next prompt, the corrected draft passes on attempt 2. |
| Failure | A draft that never passes ends `FAILED` with the reason and a cleared similarity vector. |
| MCQ / SQL | MCQ validated by blind solve + review and labelled `llm_review` with no execution stage claimed; a wrong answer key is caught; SQL validated by execution. |
| Outages | A provider returning 503 is retried by the queue 3 times, then the item fails cleanly; nothing is left `VALIDATING`. |
| Tenancy | Another organization gets 404 on job status, the SSE stream, exports and foreign `paperId`s. |
| SSE | Streams with an `Authorization` header; a token in the URL is refused. |
| Webhooks | Internal targets refused; secret stored encrypted; deliveries arrive with a valid HMAC signature. |
| Editing | Protected fields rejected; title-only edits keep `VALIDATED`; a content edit triggers re-validation that fails a wrong expected output and passes the fix; a question cannot be approved while `VALIDATING`. |
| Imports | Completing a draft writes validated solutions and keeps its title and source; a failed completion leaves the draft untouched; a missing LLM key is a 400 up front. |
| Export | JSON and PDF exported to local storage and downloaded through an expiring token link; bad and expired tokens refused; expired files deleted from disk by the sweeper. |
| Admin | Organization LLM keys stored encrypted and never returned; Bull Board opened with a single-use ticket; its cookie is not an API login. |
| Quota | The daily quota counts requested slots. |

CI runs both suites on every push and pull request, after applying the migrations to a fresh database — so a schema that drifts from its migrations now fails the build.

## 3. What is not tested

Be clear-eyed about these before relying on the system:

- **No live LLM.** The prompts and JSON contracts have never been run against Anthropic, OpenAI or Gemini in this suite. Real pass rates, and whether each provider reliably returns the requested shape, are unknown until you run a batch.
- **No real Piston.** The Piston client is tested with mocked HTTP. Real execution in tests uses the local runner. Runtime names and versions on your Piston instance (including `sqlite3`) are unverified.
- **No browser.** Frontend tests render components in jsdom. Nothing drives the app in a real browser.
- **No load test.** See [scalability-and-benchmarks.md](./scalability-and-benchmarks.md).
- **No Docker build.** The Dockerfiles and compose files were edited but not built in this round.
- **S3.** The S3 upload path is unchanged and not exercised; the local-storage path is.
