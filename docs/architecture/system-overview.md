# System Architecture Overview

This document provides a comprehensive technical overview of the **Question Forge** distributed architecture, design principles, decoupling boundaries, and reliability guarantees.

---

## 1. High-Level Architectural Principles

Question Forge is designed around four foundational tenets:

1. **Decoupled Asynchronous Compute**: Slow work (LLM drafting and review, multi-language sandbox execution) runs in background workers — one job per question — never inside an HTTP request.
2. **Crash Resilience & State Isolation**: Neither HTTP servers nor background workers maintain in-memory state across requests or jobs. Distributed state resides entirely in **Redis 7** (job queues, token blacklists, cache) and **PostgreSQL 16** (all persistent data, including each generation batch and its per-question progress).
3. **Layered Monorepo Architecture**: Clean boundaries between HTTP routing, business logic orchestration, database access, and shared schemas prevent code drift while enabling atomic builds across packages via **Turborepo**.
4. **Tenant Isolation**: Every query filters on the `organizationId` from the caller's verified JWT. See the [security page](../security/security-whitepaper.md).

---

## 2. Distributed Process Topology

In production environments, Question Forge operates as two distinct, independently scalable compute workloads alongside shared infrastructure services:

```mermaid
flowchart TD
    subgraph Traffic ["Clients & External Systems"]
        Client["Browser / SPA Client"]
        LMS["Customer ATS / LMS Endpoint"]
    end

    subgraph Edge ["Edge / Ingress Layer"]
        ALB["Application Load Balancer / Nginx Reverse Proxy\n(SSL Termination, HTTP/2)"]
    end

    subgraph API_Tier ["Stateless HTTP API Cluster (apps/api)"]
        API_1["API Pod 1 (Port 4000)"]
        API_2["API Pod 2 (Port 4000)"]
        API_N["API Pod N (Port 4000)"]
    end

    subgraph Worker_Tier ["Dedicated Background Worker Cluster (apps/api/src/worker.ts)"]
        W_1["Worker Pod 1\n(Draft + Validate)"]
        W_2["Worker Pod 2\n(Draft + Validate)"]
        W_Hook["Worker Pod (Webhooks)\n(HMAC Outbound Delivery)"]
    end

    subgraph State_Tier ["Distributed State Layer"]
        Redis[("Redis 7 Cluster / ElastiCache\n- BullMQ 'generation' queue\n- BullMQ 'webhooks' queue\n- JTI Revocation Blacklist\n- Analytics Cache (60s TTL)\n- Distributed Rate Limit Store")]
        Postgres[("PostgreSQL 16, pgvector-enabled image (AWS RDS)\n- Questions, Users, Papers, Reviews\n- Generation batches and items\n- 256-dim lexical vectors, compared in application code\n- Write-Ahead Logging (WAL)")]
        S3[("Export storage: AWS S3\n(or local disk on a single machine)\n- Candidate PDFs\n- Internal PDFs\n- JSON Bundles")]
    end

    subgraph Execution_Tier ["Execution Sandbox Cluster"]
        Piston["Piston Sandbox (Docker)\n- python, java, gcc, node, sqlite3 runtimes\n- 512MB RAM and 0.75 CPU container limits"]
    end

    subgraph AI_Providers ["External LLM APIs"]
        OpenAI["OpenAI"]
        Anthropic["Anthropic Claude"]
        Gemini["Google Gemini"]
    end

    Client -->|HTTPS + SSE| ALB
    ALB --> API_1 & API_2 & API_N

    API_1 & API_2 & API_N -->|Enqueue one job per question| Redis
    API_1 & API_2 & API_N -->|Query Relational Data| Postgres
    API_1 & API_2 & API_N -->|Read/Write Presigned URLs| S3

    Redis -->|Dequeue Generation Jobs| W_1 & W_2
    Redis -->|Dequeue Webhook Deliveries| W_Hook

    W_1 & W_2 -->|Parallel Code Verification| Piston
    W_1 & W_2 -->|Draft and review prompts| AI_Providers
    W_1 & W_2 -->|Persist questions and item progress| Postgres

    W_Hook -->|HMAC-SHA256 Signed POST| LMS
```

---

## 3. Decoupling: API Cluster vs. Worker Cluster

### The Monolith Event Loop Bottleneck (Why Decoupling Matters)
In Node.js, the runtime operates on a single-threaded event loop. If long-running tasks—such as parsing multi-megabyte JSON payloads, computing cosine similarity over dense arrays, running synchronous AST analysis, or waiting on 30-second multi-turn LLM streams—run within the same process handling incoming HTTP requests:
1. **Event Loop Starvation**: Incoming HTTP connections wait hundreds of milliseconds just to execute the first tick, spiking API latency ($p99 > 2000\text{ms}$).
2. **Health Check Death Spirals**: Application Load Balancers issue periodic `GET /health` probes. If the single thread is blocked by an LLM synthesis loop, the health check times out. The ALB marks the instance unhealthy and kills the container mid-execution.
3. **Asymmetrical Resource Needs**: HTTP ingestion is network I/O-bound (low CPU, low RAM), whereas AI orchestration and sandbox code verification are CPU- and memory-bound.

### The Question Forge Decoupled Model

| Dimension | API Cluster (`apps/api/src/index.ts`) | Worker Cluster (`apps/api/src/worker.ts`) |
|---|---|---|
| **Process Role** | Stateless HTTP request/response & SSE stream server | Headless background queue processor |
| **Port / Ingress** | Exposes port `4000` to reverse proxy / ALB | Headless (no open HTTP ports) |
| **Scaling Metric** | ALB request latency and pod CPU utilization | BullMQ queue backlog (`waiting` + `delayed` jobs) |
| **Graceful Shutdown** | Closes HTTP listener; waits 5s for active connections | Pauses queues; awaits current job completion; disconnects Redis |
| **Embedded Mode** | Enabled in dev (`ENABLE_EMBEDDED_WORKERS=true`) | Dedicated process in prod (`ENABLE_EMBEDDED_WORKERS=false`) |

---

## 4. Layered Controller Architecture

To eliminate architectural rot where business logic, SQL queries, and HTTP validation get jumbled inside route handlers, Question Forge enforces a **4-layer architectural hierarchy**:

```mermaid
flowchart LR
    ClientReq["HTTP Request"] --> Router["1. Route Delegator\n(Thin Express Router)"]
    Router --> Middleware["2. Middleware Pipeline\n(Rate Limit, Auth, Zod Validation)"]
    Middleware --> Controller["3. Controller Layer\n(Request unwrapping, orchestration)"]
    Controller --> Service["4. Service / Domain Layer\n(Debate, Sandbox, Vector, DB, Queue)"]
    Service --> Response["HTTP 200/201/202 Response"]
```

### Responsibility Breakdown
1. **Route Layer (`apps/api/src/routes/`)**:
   Pure routing definitions. Contains zero business logic, zero raw SQL queries, and zero direct queue interactions. Example:
   ```typescript
   authRouter.post('/login', AuthController.login);
   authRouter.post('/register', authenticate, authorize('ADMIN'), AuthController.register);
   authRouter.post('/logout', authenticate, AuthController.logout);
   ```
2. **Middleware Layer (`apps/api/src/middleware/`)**:
   Enforces cross-cutting concerns:
   - `rateLimiter.ts`: Redis-backed rate limiters shared across replicas.
   - `auth.ts`: Verifies JWT signatures and checks the token's UUID `jti` against the Redis Revocation Blacklist.
   - `errorHandler.ts`: Turns Zod errors into `400` with field details, returns client-facing `AppError` messages as-is, and hides everything else in production.
3. **Controller Layer (`apps/api/src/controllers/`)**:
   Parses `req.body`, `req.params`, and `req.query`, invokes domain services or Prisma client queries, and formats standard HTTP responses (`200 OK`, `202 Accepted`, `400 Bad Request`).
4. **Service Layer (`apps/api/src/services/`)**:
   Domain logic: the generate → validate loop (`generationService`), differential and SQL validation (`validationService`), LLM review (`reviewService`), prompts and draft schemas, duplicate detection, export.

---

## 5. Resilience & Fault Tolerance Patterns

### 1. Redis BullMQ Crash Recovery
All asynchronous jobs are serialized as JSON payloads in Redis. Each job has an associated BullMQ lock. If a worker container crashes or is abruptly terminated by AWS ECS/K8s spot eviction:
- BullMQ's lock expires after `stalledInterval` (default 30 seconds).
- A surviving worker picks the stalled job up again. Each job is one question, and its `GenerationItem` row remembers the `questionId`, so the retry updates the same question instead of creating a duplicate; the other questions in the batch are unaffected.
- Redis runs with append-only persistence and `maxmemory-policy noeviction` (in `docker-compose.yml`). BullMQ keeps its queues in Redis, so Redis must never evict keys; use the same policy on a managed Redis.

### 2. Provider Errors
LLM clients are cached per provider, model and key. Transient errors (429, 5xx, dropped connections) are retried with backoff inside the client; if they persist, the job throws and BullMQ retries it up to 3 times before the item is marked `FAILED` with the reason. There is no automatic switch to a different provider: the provider chosen for a batch is used strictly.

### 3. Graceful Draining (`SIGTERM` / `SIGINT`)
Upon receiving termination signals from Docker/Kubernetes:
```typescript
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Draining BullMQ workers...`);
  await Promise.all([
    generationWorker.close(),
    webhookWorker.close(),
  ]);
  await redisConnection.quit();
  process.exit(0);
};
```
Active jobs are permitted up to 30 seconds to finish execution and persist results before the process terminates.

```mermaid
sequenceDiagram
    autonumber
    participant Orch as Docker / K8s
    participant Proc as apps/api process
    participant HTTP as HTTP server
    participant W as BullMQ Workers
    participant Redis as Redis

    Orch->>Proc: SIGTERM
    Proc->>HTTP: server.close()\n(stop accepting new connections)
    Note over HTTP: In-flight requests finish;\nnew ones get no listener
    Proc->>W: await worker.close() for each\n(finish current job, stop pulling new ones)
    W-->>Proc: drained
    Proc->>Redis: disconnect
    Proc->>Orch: process.exit(0)

    alt Draining takes > 30s
        Proc->>Proc: force process.exit(1)
        Note over Proc: Safety valve — a stuck job\nnever blocks a rolling deploy forever
    end
```
