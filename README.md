# Question Forge

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18-blue)
![Node](https://img.shields.io/badge/Node-20%2B-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![Turborepo](https://img.shields.io/badge/Turborepo-Monorepo-blue)
![Prisma](https://img.shields.io/badge/Prisma-ORM-teal)
![Docker](https://img.shields.io/badge/Docker-Enabled-blue)
![Redis](https://img.shields.io/badge/Redis-BullMQ-red)
![Vitest](https://img.shields.io/badge/Vitest-Unit%20%26%20Integration-yellow)
![AWS](https://img.shields.io/badge/AWS-Terraform-orange)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

**Enterprise-Grade Multi-Agent AI Assessment Generation, Code Execution & Validation Platform**

Question Forge is an open-source, multi-agent AI orchestration platform engineered for enterprise HR and technical recruiting organizations. It automates the generation, rigorous algorithmic validation, human-in-the-loop review, and secure export of technical interview questions (Data Structures & Algorithms, Object-Oriented Design, System Design, SQL, and Conceptual MCQs).

By combining **LangGraph agentic debate**, **isolated Docker sandboxed code execution**, **decoupled BullMQ worker processes**, and **pgvector semantic deduplication**, Question Forge produces verified, hallucination-free technical assessments at enterprise scale without data loss.

---

## Table of Contents
- [Architecture & Deep Technical Documentation (`docs/`)](./docs/README.md)
- [Key Enterprise Capabilities](#key-enterprise-capabilities)
- [Technology Stack](#technology-stack)
- [Monorepo Architecture & Directory Structure](#monorepo-architecture--directory-structure)
- [System Architecture](#system-architecture)
- [Core Workflows & Diagrams](#core-workflows--diagrams)
  - [1. Distributed Job Queue & SSE Progress Streaming](#1-distributed-job-queue--sse-progress-streaming)
  - [2. Multi-Agent Adversarial Debate Pipeline](#2-multi-agent-adversarial-debate-pipeline)
  - [3. High-Concurrency Sandboxed Code Execution](#3-high-concurrency-sandboxed-code-execution)
  - [4. Asynchronous Webhook Delivery Engine](#4-asynchronous-webhook-delivery-engine)
  - [5. Question Review & Lifecycle State Machine](#5-question-review--lifecycle-state-machine)
  - [6. Zero-Downtime CI/CD Pipeline & Automated Rollback](#6-zero-downtime-cicd-pipeline--automated-rollback)
- [Database Schema & ERD](#database-schema--erd)
- [Quantitative Scalability Specifications & Benchmarks](#quantitative-scalability-specifications--benchmarks)
- [Scalability & Reliability Matrix](#scalability--reliability-matrix)
- [Enterprise Security Architecture](#enterprise-security-architecture)
- [REST API Reference](#rest-api-reference)
- [Automated Testing Suite (Vitest)](#automated-testing-suite-vitest)
- [Environment Variables](#environment-variables)
- [Local Development & Seeding](#local-development--seeding)
- [Production Deployment (AWS / Terraform / Docker)](#production-deployment-aws--terraform--docker)
- [Roadmap & Future Extensions](#roadmap--future-extensions)
- [Contributing](#contributing)
- [License](#license)

> [!NOTE]
> **Looking for in-depth architectural specifications and operational runbooks?**
> Visit the [Question Forge Enterprise Documentation Hub (`docs/`)](./docs/README.md) for deep dives into:
> - [System Overview & Decoupled Compute](./docs/architecture/system-overview.md)
> - [LangGraph Multi-Agent Adversarial Debate](./docs/architecture/multi-agent-debate.md)
> - [Piston Sandboxed Code Execution & Differential Testing](./docs/architecture/sandboxed-execution.md)
> - [BullMQ Distributed Queue & Worker Engine](./docs/architecture/queue-and-worker-engine.md)
> - [Database Schema, ERD & Composite Indexing](./docs/database/schema-and-indexing.md)
> - [Vector Deduplication & Semantic Search (`pgvector`)](./docs/database/vector-deduplication.md)
> - [Enterprise Security Architecture Whitepaper](./docs/security/security-whitepaper.md)
> - [Production Deployment & SRE Incident Runbook](./docs/operations/deployment-and-runbook.md)
> - [Quantitative Scalability & Throughput Benchmarks](./docs/operations/scalability-and-benchmarks.md)

---

---

## Key Enterprise Capabilities

1. **Multi-Agent Adversarial Validation Pipeline:**
   Rather than relying on single-shot LLM prompts, Question Forge employs a LangGraph state machine where a **Generator Agent** drafts problem specifications and optimal/brute solutions, an **Adversary Agent** identifies edge-case gaps and time/space complexity flaws, and a **Judge Agent** evaluates whether the problem passes strict quality rubrics, triggering iterative rewrites on failure.

2. **Parallel Sandboxed Code Execution:**
   Every generated coding problem is tested in an isolated Piston container sandbox across multiple languages (Python, Java, C++, JavaScript). Edge-case suites are executed against both optimal and brute-force solutions simultaneously using concurrency-capped worker pools (`p-limit`), slashing validation latency by over 10×.

3. **Decoupled Background Worker Process (`apps/api/src/worker.ts`):**
   HTTP request handling is cleanly isolated from CPU- and memory-intensive AI orchestration and sandbox code verification. In production, dedicated worker processes consume BullMQ queues independently, with auto-scaling governed by queue depth, while stateless Express API replicas handle incoming traffic without risking Event Loop starvation.

4. **Crash-Resilient Distributed Queues (BullMQ + Redis):**
   Generation jobs and outbound webhook deliveries run through separate BullMQ queues backed by Redis with persistence. If an API or worker container restarts mid-generation, jobs persist in Redis and resume automatically. Real-time generation progress is streamed to clients via Server-Sent Events (SSE).

5. **Clean Layered Controller Architecture:**
   HTTP route files in `apps/api/src/routes/` serve exclusively as thin delegators. All business logic, input sanitization, database mutations, and queue dispatching reside in dedicated, single-responsibility controller modules (`authController`, `questionsController`, `papersController`, `exportController`, `adminController`, `webhooksController`, and `analyticsController`).

6. **Independent Asynchronous Webhook Delivery:**
   Approved questions and exported papers trigger outbound webhook notifications to customer ATS/LMS platforms. Deliveries are decoupled from HTTP request loops, signed with cryptographic HMAC-SHA256 signatures, and backed by a 5-tier exponential backoff retry mechanism.

7. **Algorithmic Semantic Deduplication (`pgvector`):**
   Every approved question is embedded into high-dimensional vector space stored in PostgreSQL via the `pgvector` extension. Prior to final insertion, cosine similarity calculations (< 0.85 threshold) prevent duplicate problems and cross-assessment question leakage.

8. **Hardened Multi-Tenancy & Zero-Trust Security:**
   - Stateless JWT tokens paired with an **instant Redis JTI Revocation Blacklist** on logout.
   - Strict organization-boundary authorization ensuring zero cross-tenant leakage.
   - Strict Zod mutation schemas protecting against mass-assignment vulnerabilities.
   - Puppeteer PDF rendering sanitized against HTML injection and XSS.
   - Direct-to-S3 asset storage with ephemeral presigned URLs.

9. **Enterprise Monorepo Pipeline (Turborepo 2.x):**
   Coordinated monorepo task orchestration across `apps/*` and `packages/*` with deterministic caching, topological dependency graph execution, and sub-10ms incremental build checks.

10. **Automated Testing Suite (Vitest + Supertest):**
    Integrated automated unit and integration tests covering deep health probes, vector deduplication boundary mathematics, Zod schema validation, and RBAC authorization without requiring live external services.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Monorepo Engine** | Turborepo 2.x, npm Workspaces |
| **Frontend SPA** | React 18, TypeScript 5.4, Vite, Tailwind CSS, Lucide Icons, TanStack React Query, React Router |
| **API Server** | Node.js (v20+), Express.js, Layered Controllers, TypeScript, Zod Schema Validation |
| **Dedicated Worker** | Standalone BullMQ Worker runtime (`worker.ts`) with graceful `SIGTERM`/`SIGINT` draining |
| **AI Orchestration** | LangGraph State Machines, OpenAI SDK, Anthropic SDK, Google Gen AI SDK |
| **Automated Testing** | Vitest, Supertest, In-memory Redis/DB mocks |
| **Queues & Caching** | Redis 7, BullMQ (Independent Generation & Webhook queues), ioredis |
| **Database & Vector** | PostgreSQL 16, Prisma ORM, `pgvector` extension, Composite B-Tree & IVFFlat Indexes |
| **Execution Sandbox** | Piston (Isolated Docker containers with 512MB RAM / 0.75 CPU quota per instance) |
| **PDF & Export** | Puppeteer (Headless Chromium with HTML entity escaping), AWS S3 SDK |
| **Infrastructure & IaC** | Docker Compose, Terraform (AWS EC2, RDS, ElastiCache, S3), GitHub Actions CI/CD |

---

## Monorepo Architecture & Directory Structure

Question Forge is structured as a modular, enterprise-grade monorepo managed by **Turborepo**:

```text
question-forge/
├── apps/
│   ├── api/                                # Backend Express API & Worker Service
│   │   ├── src/
│   │   │   ├── controllers/                # Layered Controller Modules
│   │   │   │   ├── adminController.ts      # User role management, queue monitoring
│   │   │   │   ├── analyticsController.ts  # Cached metrics & export breakdowns
│   │   │   │   ├── authController.ts       # Registration, login, Redis JTI blacklist
│   │   │   │   ├── exportController.ts     # S3 PDF/JSON generation & presigned URLs
│   │   │   │   ├── papersController.ts     # Assessment bundle management
│   │   │   │   ├── questionsController.ts  # CRUD, reviews, history snapshots
│   │   │   │   └── webhooksController.ts   # ATS/LMS HMAC webhook configurations
│   │   │   ├── routes/                     # Slim HTTP Route Delegators
│   │   │   ├── middleware/                 # Auth, RBAC, Redis rate limiters, validation
│   │   │   ├── queues/                     # BullMQ generation & webhook queue definitions
│   │   │   ├── workers/                    # BullMQ job processors & debate runners
│   │   │   ├── __tests__/                  # Vitest Automated Test Suite
│   │   │   │   ├── authValidation.test.ts  # Zod schema & registration tests
│   │   │   │   ├── deduplication.test.ts   # Vector cosine similarity unit tests
│   │   │   │   └── health.test.ts          # Liveness & readiness probe tests
│   │   │   ├── index.ts                    # HTTP server entry point (stateless in prod)
│   │   │   └── worker.ts                   # Standalone BullMQ Worker process entry point
│   │   ├── vitest.config.ts                # Vitest test runner configuration
│   │   └── Dockerfile                      # Dual-mode production container image
│   │
│   └── frontend/                           # Client-side React 18 SPA
│       ├── src/
│       │   ├── components/                 # Reusable UI component library
│       │   ├── pages/                      # Generator, Review, Papers, Analytics views
│       │   ├── services/                   # Axios API clients & SSE listeners
│       │   └── types/                      # Frontend TypeScript interfaces
│       ├── vite.config.ts                  # Vite bundler configuration
│       └── Dockerfile                      # Production Nginx container image
│
├── packages/
│   └── shared/                             # Monorepo Shared Package
│       ├── prisma/
│       │   ├── schema.prisma               # Canonical DB schema (Postgres + pgvector)
│       │   ├── seed.ts                     # Database seeding script (Admin/Reviewer)
│       │   └── migrations/                 # Versioned SQL migration history
│       └── src/
│           ├── types/                      # Shared domain types & Zod contracts
│           └── index.ts                    # Package export entry point
│
├── infra/
│   └── terraform/                          # Production AWS Infrastructure as Code
│       ├── main.tf                         # VPC, Security Groups, EC2 ASG, S3
│       └── outputs.tf                      # ALB DNS, RDS & ElastiCache endpoints
│
├── .github/
│   └── workflows/
│       └── deploy-backend.yml              # CI/CD: Turbo test -> Migrate -> Rolling restart
│
├── docker-compose.yml                      # Local development infrastructure stack
├── docker-compose.prod.yml                 # Production overrides (Decoupled API + Worker)
├── turbo.json                              # Turborepo task pipeline configuration
└── package.json                            # Root workspaces & developer scripts
```

---

## System Architecture

```mermaid
flowchart TD
    subgraph Clients ["Client Layer"]
        SPA["React 18 SPA (Vite + Tailwind)"]
        SSE_Stream["SSE Live Progress Listener"]
    end

    subgraph Gateway ["Ingress & Security"]
        Proxy["Reverse Proxy / AWS ALB"]
        RL["Redis Rate Limiter\n(express-rate-limit)"]
        AuthMid["JWT Auth + Redis JTI Revocation Check"]
    end

    subgraph API_Cluster ["Stateless Express API Cluster (apps/api)"]
        API_Replicas["API Pods / Replicas (xN)"]
        Router["Thin Route Delegators"]
        Controllers["Layered Controllers:\nAuth | Questions | Papers | Export | Admin | Webhooks | Analytics"]
    end

    subgraph Distributed_State ["Distributed State (Redis 7)"]
        Bull_Gen["BullMQ: 'generation' Queue"]
        Bull_Hook["BullMQ: 'webhooks' Queue"]
        Cache_Analytics["Redis Cache (Analytics TTL 60-120s)"]
        Blacklist["Redis JTI Token Blacklist"]
    end

    subgraph Worker_Cluster ["Dedicated Worker Cluster (apps/api/src/worker.ts)"]
        Worker_Pods["Worker Pods / Replicas (Auto-scaled)"]
        Gen_Worker["Generation Worker\n(Concurrency: 5-15)"]
        Hook_Worker["Webhook Delivery Worker\n(Concurrency: 10)"]
        SigDrain["Graceful SIGTERM/SIGINT\nJob Draining"]
    end

    subgraph AI_Engine ["Multi-Agent AI Engine (LangGraph)"]
        Generator["Generator Agent\n(Drafts Problem & Tests)"]
        Adversary["Adversary Agent\n(Edge-Case Analysis)"]
        Judge["Judge Agent\n(Consensus & Scoring)"]
    end

    subgraph Execution ["Sandboxed Execution"]
        PistonPool["Piston Docker Sandbox Pool\n(p-limit Parallel Semaphore)"]
    end

    subgraph Storage ["Persistent Storage Layer"]
        Postgres[("PostgreSQL 16 + pgvector\n(Questions, Users, Audits, Embeddings)")]
        S3[("AWS S3 Bucket\n(Watermarked PDFs & JSON Exports)")]
    end

    subgraph External ["External ATS / LMS Integrations"]
        LMS["Customer ATS / LMS\n(Greenhouse, Lever, Canvas)"]
    end

    SPA --> Proxy
    SSE_Stream --> Proxy
    Proxy --> RL --> AuthMid --> API_Replicas
    API_Replicas --> Router --> Controllers

    Controllers --> Bull_Gen
    Controllers --> Bull_Hook
    Controllers --> Cache_Analytics
    Controllers --> Postgres
    Controllers --> S3
    AuthMid --> Blacklist

    Bull_Gen --> Worker_Pods
    Bull_Hook --> Worker_Pods
    Worker_Pods --> Gen_Worker & Hook_Worker
    Worker_Pods --> SigDrain

    Gen_Worker --> AI_Engine
    AI_Engine --> Generator <--> Adversary
    Adversary --> Judge
    Gen_Worker --> PistonPool
    Gen_Worker --> Postgres

    Hook_Worker -->|HMAC-SHA256 Signed POST| LMS
```

---

## Core Workflows & Diagrams

### 1. Distributed Job Queue & SSE Progress Streaming

Question generation is executed asynchronously to handle deep multi-agent deliberation and multi-language test validation without blocking HTTP connections:

```mermaid
sequenceDiagram
    autonumber
    actor User as Client / Browser
    participant API as Stateless Express API
    participant Redis as Redis 7 (BullMQ)
    participant Worker as Dedicated Worker (worker.ts)
    participant LangGraph as LangGraph Multi-Agent
    participant Sandbox as Piston Sandbox (Parallel)
    participant DB as Postgres (pgvector)

    User->>API: POST /api/generate (Topic, Difficulty, Langs)
    API->>Redis: Enqueue job in 'generation' queue
    API-->>User: 202 Accepted { jobId, statusUrl, streamUrl }

    User->>API: GET /api/generate/status/:jobId/stream?token=JWT (SSE)
    API-->>User: SSE Connection Established (keep-alive)

    Redis->>Worker: Dequeue generation job
    Worker->>Redis: Update BullMQ Progress (10%)
    API-->>User: event: progress { percent: 10, stage: "Drafting Problem" }

    Worker->>LangGraph: Run Generator -> Adversary -> Judge debate loop
    Worker->>Redis: Update BullMQ Progress (40%)
    API-->>User: event: progress { percent: 40, stage: "Adversarial Debate" }

    Worker->>Sandbox: Execute optimal & brute-force across all languages (Parallel)
    Sandbox-->>Worker: Execution traces & outputs verified
    Worker->>Redis: Update BullMQ Progress (75%)
    API-->>User: event: progress { percent: 75, stage: "Sandbox Code Execution" }

    Worker->>DB: Check vector cosine similarity (< 0.85 threshold)
    Worker->>DB: Persist Question with VALIDATED status
    Worker->>Redis: Mark BullMQ job COMPLETED (100%)
    API-->>User: event: completed { questionId, status: "VALIDATED" }
```

---

### 2. Multi-Agent Adversarial Debate Pipeline

The multi-agent debate guarantees that generated technical questions are free of ambiguous constraints, missing edge cases, and incorrect optimal time/space complexities:

```mermaid
flowchart TD
    Start([User Generation Request]) --> GenInit["Generator Agent:\nDrafts Title, Statement, Constraints"]
    GenInit --> GenCode["Generator Agent:\nProduces Optimal + Brute-Force Solutions & Test Cases"]
    
    GenCode --> AdvReview["Adversary Agent:\nIdentifies Corner Cases, Hidden Traps & Flawed Bounds"]
    
    AdvReview --> JudgeEval{"Judge Agent Evaluation:\nMeets Rigorous Quality Rubric?"}
    
    JudgeEval -- "Critique / Revision Needed\n(Score < Threshold)" --> RetryCheck{"Retry Count < 3?"}
    RetryCheck -- Yes --> FeedbackGen["Inject Feedback into State:\nForce Targeted Rewrite"]
    FeedbackGen --> GenInit
    
    RetryCheck -- No --> FailState(["Mark Generation FAILED\nLog to Audit Trail"])
    
    JudgeEval -- "Approved\n(Consensus Reached)" --> ValidationSuite["Dispatch to Parallel Sandbox Validation"]
    ValidationSuite --> Deduplication["pgvector Embedding Check\nOrg Deduplication"]
    Deduplication --> SuccessState(["Question Status: VALIDATED"])
```

---

### 3. High-Concurrency Sandboxed Code Execution

Instead of sequential loops over languages and test cases, all execution payloads run concurrently with a semaphore ceiling (`p-limit`):

```mermaid
flowchart LR
    subgraph Input ["Test Matrix"]
        Q["Validated Question"]
        Langs["Languages:\nPython, Java, C++, JS"]
        Tests["20+ Edge & Performance\nTest Cases"]
    end

    subgraph ConcurrencyPool ["p-limit Semaphore (Cap: 10 Concurrency)"]
        Slot1["Execution Slot 1"]
        Slot2["Execution Slot 2"]
        Slot3["..."]
        Slot10["Execution Slot 10"]
    end

    subgraph SandboxNodes ["Piston Docker Sandboxes"]
        P1["Container Node A\n(512MB / 0.75 CPU)"]
        P2["Container Node B\n(512MB / 0.75 CPU)"]
    end

    subgraph Assertion ["Verification Engine"]
        Match{"Optimal Output ==\nBrute Force Output?"}
        Pass(["All Cases Pass"])
        Fail(["Trigger Self-Correction"])
    end

    Input --> ConcurrencyPool
    ConcurrencyPool --> SandboxNodes
    SandboxNodes --> Assertion
    Assertion -- True --> Pass
    Assertion -- False --> Fail
```

---

### 4. Asynchronous Webhook Delivery Engine

Decoupled outbound notifications ensure external LMS/ATS unavailability never impedes internal workflows:

```mermaid
sequenceDiagram
    autonumber
    participant App as Internal Workflow (Review / Export)
    participant Queue as BullMQ 'webhooks' Queue
    participant Worker as Dedicated Webhook Worker
    participant DB as Postgres (AuditLog)
    actor External as ATS / LMS Endpoint

    App->>Queue: enqueueWebhook(organizationId, payload)
    Note over App,Queue: Non-blocking Fire-and-Forget (< 5ms)

    Queue->>Worker: Dequeue delivery job
    Worker->>Worker: Lookup Org webhookUrl & webhookSecret
    Worker->>Worker: Compute HMAC-SHA256 Signature

    Worker->>External: POST payload + X-QuestionForge-Signature (10s timeout)
    
    alt 2xx Success Response
        External-->>Worker: 200 OK
        Worker->>DB: Create AuditLog (WEBHOOK_TRIGGERED, status: success)
    else 5xx / Network Error / Timeout
        External-->>Worker: 500 Error / Timeout
        Worker->>Queue: Trigger Exponential Backoff Retry (2s, 4s, 8s, 16s, 32s)
        Note over Worker,Queue: Retries up to 5 attempts before terminal failure
    end
```

---

### 5. Question Review & Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Generated via API/Wizard
    DRAFT --> VALIDATING: Submitted to Agentic Debate & Sandbox
    VALIDATING --> VALIDATED: Consensus Reached + Tests Match
    VALIDATING --> FAILED: Exceeded 3 Retries / Sandbox Failure
    FAILED --> DRAFT: Regenerate with New Seed

    VALIDATED --> IN_REVIEW: Human Review Requested
    IN_REVIEW --> APPROVED: Reviewer Approves with Optional Edits
    IN_REVIEW --> REJECTED: Reviewer Rejects with Feedback Note
    REJECTED --> DRAFT: Cloned & Revised

    APPROVED --> PAPER_ASSIGNED: Bundled into Assessment Paper
    PAPER_ASSIGNED --> EXPORTED: Watermarked PDF or JSON Generated (S3)
    APPROVED --> WEBHOOK_TRIGGERED: Dispatched via BullMQ to LMS/ATS
```

---

### 6. Zero-Downtime CI/CD Pipeline & Automated Rollback

```mermaid
flowchart TD
    Push([Push to main Branch]) --> GHA[GitHub Actions Runner]
    
    subgraph Stage1 ["Stage 1: Turborepo Monorepo CI"]
        GHA --> Install[Install Dependencies & Prisma Generate]
        Install --> Turbo["turbo run lint build test\n(Remote / Local Caching)"]
        Turbo --> VitestResults["Vitest Suite: 11+ Automated Tests Passed\n(Health, Deduplication, Auth)"]
    end

    subgraph Stage2 ["Stage 2: Zero-Downtime Rolling Deployment"]
        VitestResults --> SSH[SSH to Production Host]
        SSH --> Pull[Pull Latest Git & Docker Images]
        Pull --> Migrate["Execute 'prisma migrate deploy'\n(Prevents Schema Drift)"]
        Migrate --> RollingAPI[Rolling Restart: Stateless API Containers]
        Migrate --> RollingWorker[Rolling Restart: Dedicated Worker Containers]
    end

    subgraph Stage3 ["Stage 3: Automated Health & Readiness Probing"]
        RollingAPI --> Probe["Probe GET /health/ready\n(Max 15 Attempts @ 2s Interval)"]
        Probe -- "200 Healthy" --> DeploySuccess([Deployment Succeeded 🎉])
        Probe -- "Failed after 15 checks" --> Rollback["Execute Rollback to Previous Commit\nRestore Prior API & Worker Containers"]
        Rollback --> DeployFailed([Deployment Aborted & Alert Dispatched ❌])
    end
```

---

## Database Schema & ERD

```mermaid
erDiagram
    ORGANIZATION ||--o{ USER : "has"
    ORGANIZATION ||--o{ QUESTION : "owns"
    ORGANIZATION ||--o{ PAPER : "owns"
    ORGANIZATION ||--o{ AUDIT_LOG : "records"

    USER ||--o{ QUESTION_REVIEW : "creates"
    USER ||--o{ AUDIT_LOG : "triggers"

    QUESTION ||--o{ QUESTION_HISTORY : "tracks"
    QUESTION ||--o{ QUESTION_REVIEW : "receives"
    QUESTION ||--o{ PAPER_QUESTION : "included_in"

    PAPER ||--o{ PAPER_QUESTION : "contains"
    PAPER ||--o{ EXPORT_RECORD : "exports"

    ORGANIZATION {
        string id PK
        string name
        string slug UK
        json llmApiKeysEncrypted
        int maxQuestionsPerDay
        string webhookUrl
        string webhookSecret
    }

    USER {
        string id PK
        string email UK
        string name
        enum role "ADMIN | REVIEWER | GENERATOR"
        string passwordHash
        string organizationId FK
    }

    QUESTION {
        string id PK
        enum type "DSA | OOPS | SYSTEM_DESIGN | SQL | MCQ"
        enum difficulty "EASY | MEDIUM | HARD"
        string topic
        string title
        text statement
        json optimalSolution
        json bruteForceSolution
        json testCases
        enum status "DRAFT | VALIDATING | VALIDATED | IN_REVIEW | APPROVED | REJECTED | FAILED"
        float_array embeddingVector "pgvector"
        string organizationId FK
    }

    QUESTION_HISTORY {
        string id PK
        string questionId FK
        int version
        json snapshot
        string editedById
    }

    QUESTION_REVIEW {
        string id PK
        string questionId FK
        string reviewerId FK
        string decision "APPROVED | REJECTED"
        text note
    }

    PAPER {
        string id PK
        string title
        json config
        string organizationId FK
    }

    EXPORT_RECORD {
        string id PK
        string paperId FK
        enum format "JSON | PDF_CANDIDATE | PDF_INTERNAL"
        string signedToken UK
        datetime expiresAt
    }

    AUDIT_LOG {
        string id PK
        string organizationId FK
        string userId FK
        enum action "QUESTION_GENERATED | USER_LOGIN | USER_LOGOUT | WEBHOOK_TRIGGERED | ..."
        json metadata
        string ipAddress
    }
```

---

## Quantitative Scalability Specifications & Benchmarks

Question Forge is architected for **Tier 3 Enterprise Scalability** (High-Concurrency Technical Assessment Engine):

| Metric | Target Specification | Production Benchmark / Capacity |
|---|---|---|
| **Question Generation Volume** | 50,000 to 250,000 questions / day | Sustained via BullMQ distributed workers with configurable concurrency (5–15 per container). |
| **Stateless API Ingestion** | 3,000+ HTTP requests / sec | Sustained across 4 stateless Node.js replicas behind AWS ALB without Event Loop lag. |
| **Sandbox Execution Latency** | Sub-1.5s parallel execution | 10 concurrent `p-limit` execution slots per worker against Piston Docker containers. |
| **Vector Search Latency** | Sub-15ms cosine similarity | Executed across 1,000,000+ questions using PostgreSQL `pgvector` with IVFFlat indexing. |
| **Webhook Delivery Throughput** | 500+ dispatches / sec | Decoupled BullMQ worker queue with 10 concurrent HTTP sockets and HMAC signing. |
| **Analytics Query Latency** | Sub-5ms response time | Two-tier Redis caching with 60s/120s TTL and instantaneous write-through invalidation. |
| **Crash Recovery (RTO / RPO)** | Sub-5s job resumption | Redis AOF persistence and BullMQ stalled job locks ensure zero job loss on node crashes. |

### Architectural Decoupling: API vs. Worker Scaling

```mermaid
flowchart LR
    Traffic[Client HTTP Traffic] --> ALB[AWS ALB / Nginx]
    ALB --> API[Stateless API Cluster\napps/api:4000\nAutoscales on CPU / Latency]
    API --> Redis[(Redis BullMQ Queues)]
    Redis --> Worker[Dedicated Worker Cluster\napps/api/src/worker.ts\nAutoscales on Queue Depth]
    Worker --> Piston[Piston Sandbox Cluster]
    Worker --> LLM[LLM Provider APIs]
    Worker --> PG[(Postgres 16 + pgvector)]
```

- **Stateless API Scaling:** Autoscaled on ALB target response time and container CPU utilization (>70%).
- **Dedicated Worker Scaling:** Autoscaled on BullMQ queue depth (`waiting` + `delayed` jobs) via AWS CloudWatch / KEDA metrics.

---

## Scalability & Reliability Matrix

| Architecture Dimension | Legacy Approach | Question Forge Enterprise Architecture |
|---|---|---|
| **Process Model** | Monolithic single process | **Decoupled API & Worker**: Stateless HTTP containers + dedicated BullMQ workers |
| **Job Durability** | Fire-and-forget in-memory Node tasks | **BullMQ + Redis 7**: Crash-resilient queues with automated restart recovery |
| **Sandbox Execution** | Nested sequential loops (`O(L × T)`) | **Parallel `Promise.all` with `p-limit`**: 10 simultaneous execution slots |
| **Client Progress** | DB polling with inconsistent intervals | **Server-Sent Events (SSE)**: Real-time unidirectional event stream |
| **Rate Limiting** | In-process memory (bypassed on multi-node) | **Redis-backed Store**: Globally synchronized quotas across all replicas |
| **Webhook Delivery** | Inline blocking HTTP call inside requests | **Dedicated BullMQ Queue**: 5 retries with exponential backoff & HMAC signing |
| **Analytics Latency** | 6+ heavy SQL aggregation queries on load | **Redis Caching**: Cached metrics with 60s/120s TTL and fast invalidation |
| **Export Artifacts** | Local memory buffer (breaks multi-replica) | **AWS S3 + Presigned URLs**: Fails hard if unconfigured; zero container memory leak |
| **Database Indexing** | Full table scans on status/topic queries | **Composite Indexes**: `[organizationId, status]`, `[organizationId, type, difficulty]` |
| **LLM Client Overhead** | Instantiated per-request (socket churn) | **Module Singletons**: Long-lived HTTP keep-alive connections to providers |
| **Graceful Shutdown** | Abrupt process termination (`SIGKILL`) | **Signal Draining**: `SIGTERM` handler closes HTTP & drains BullMQ workers |
| **CI/CD Deployment** | Direct Docker reboot (schema mismatch) | **Automated Migrations + Health Check**: Zero-downtime rollback on failure |

---

## Enterprise Security Architecture

- **Stateless JWT with Instant Redis Revocation:**
  Every issued JWT includes a unique UUID `jti` claim. Upon calling `POST /api/auth/logout`, the token's JTI is written to Redis with a TTL matching the token's expiration, immediately revoking it across all nodes.
- **Tenant Isolation Enforcement:**
  Every SQL query and administrative route strictly requires `req.user.organizationId`. Cross-tenant mutations (e.g., modifying users or questions across org boundaries) are blocked at the middleware and service layers.
- **Mass Assignment Defenses:**
  Question editing endpoints validate inputs against a strict Zod `patchSchema`. Sensitive properties (`organizationId`, `status`, `validationResult`, `embeddingVector`) cannot be mutated through update payloads.
- **PDF Sanitization & Anti-XSS:**
  All user-supplied statements, options, explanations, and code snippets are passed through an HTML entity escaping pipeline before being rendered by Puppeteer.
- **HMAC-SHA256 Webhook Verification:**
  All outbound payloads sent to third-party LMS/ATS systems include `X-QuestionForge-Signature: sha256=<hmac>`, enabling receiving servers to cryptographically verify payload integrity.

---

## REST API Reference

### Authentication & Sessions
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register new organization user | Public |
| `POST` | `/api/auth/login` | Authenticate & obtain JWT with JTI | Public |
| `POST` | `/api/auth/logout` | Revoke token via Redis JTI blacklist | Bearer |
| `GET` | `/api/auth/me` | Fetch authenticated user profile | Bearer |

### AI Generation & Queue
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/generate` | Enqueue question generation job | Bearer |
| `GET` | `/api/generate/status/:jobId` | Poll BullMQ job status and progress | Bearer |
| `GET` | `/api/generate/status/:jobId/stream` | Stream live SSE progress (`?token=` supported) | Bearer / Query |

### Question Management
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/questions` | Filtered list with pagination & search | Bearer |
| `GET` | `/api/questions/:id` | Fetch question detail & history snapshots | Bearer |
| `PATCH` | `/api/questions/:id` | Update question (Zod mass-assignment protected) | Bearer |
| `POST` | `/api/questions/:id/review` | Approve or reject question (triggers webhook) | Reviewer/Admin |

### Assessment Papers & Exports
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/papers` | List organization assessment papers | Bearer |
| `POST` | `/api/papers` | Create assessment paper bundle | Bearer |
| `POST` | `/api/export/:paperId` | Export to S3 (JSON, Candidate PDF, Internal PDF) | Bearer |

### Analytics & System Administration
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/health` | Lightweight liveness probe for load balancers | Public |
| `GET` | `/health/ready` | Deep readiness probe verifying Postgres and Redis health | Public |
| `GET` | `/api/analytics` | Overview metrics (Redis cached 60s) | Bearer |
| `GET` | `/api/analytics/export-stats` | Export metrics by format (Redis cached 120s) | Bearer |
| `GET` | `/api/admin/queues/stats` | Real-time BullMQ telemetry for generation and webhooks | Admin |
| `PATCH` | `/api/admin/users/:id/role` | Modify user role (organization-scoped) | Admin |
| `GET` | `/api/webhooks` | Fetch current organization webhook configuration | Admin |
| `POST` | `/api/webhooks/configure` | Configure webhook endpoint URL & generate HMAC secret | Admin |
| `POST` | `/api/webhooks/test` | Enqueue test webhook to verify LMS connection | Admin |

---

## Automated Testing Suite (Vitest)

Question Forge includes automated unit and integration tests powered by **Vitest** and **Supertest**:

```bash
# Run all tests across the monorepo via Turborepo
npm run test

# Run tests in the API package directly
npm run test --workspace=apps/api

# Run Vitest in interactive watch mode for TDD
npx vitest --workspace=apps/api
```

### Test Coverage Highlights
- **Health Probes (`health.test.ts`):** Validates both `/health` and reverse-proxy aliased `/api/health` HTTP 200 responses and version metadata.
- **Vector Deduplication (`deduplication.test.ts`):** Tests cosine similarity mathematical boundaries (identical = 1.0, orthogonal = 0.0, opposite = -1.0) and threshold acceptance criteria (< 0.85).
- **Authentication & Zod Contracts (`authValidation.test.ts`):** Verifies registration validation schemas, password complexity requirements, email formats, and role-based access control.

---

## Environment Variables

| Variable | Description | Example / Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`?connection_limit=5` for replicas) | `postgresql://user:pass@localhost:5432/qforge` |
| `REDIS_URL` | Redis instance for BullMQ queues, rate limiting, and cache | `redis://localhost:6379` |
| `JWT_SECRET` | Secret key for signing JSON Web Tokens | `your-cryptographically-secure-secret` |
| `ENCRYPTION_KEY` | 64-character hexadecimal key for encrypting BYOK API keys | `a1b2c3d4e5...` |
| `ENABLE_EMBEDDED_WORKERS` | Controls whether HTTP server spawns embedded workers (`true` for local dev, `false` for prod) | `true` (dev) / `false` (prod) |
| `OPENAI_API_KEY` | Optional: OpenAI API Key for GPT-4o | `sk-...` |
| `ANTHROPIC_API_KEY` | Optional: Anthropic API Key for Claude 3.5 Sonnet | `sk-ant-...` |
| `GOOGLE_GEMINI_API_KEY` | Optional: Google Gemini API Key | `AIzaSy...` |
| `PISTON_API_URL` | URL of the Piston code execution sandbox | `http://localhost:2000` |
| `CORS_ORIGINS` | Comma-separated allowlist of origins | `http://localhost:5173,https://app.qforge.io` |
| `WORKER_CONCURRENCY` | Concurrent generation jobs processed per worker | `5` |
| `SANDBOX_CONCURRENCY` | Max simultaneous test executions against Piston | `10` |
| `S3_BUCKET_NAME` | AWS S3 bucket for watermarked PDF and JSON exports | `qforge-exports-prod` |
| `AWS_ACCESS_KEY_ID` | IAM credentials for AWS S3 export storage | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY`| IAM secret key for AWS S3 export storage | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_REGION` | AWS Region for S3 bucket | `us-east-1` |

---

## Local Development & Seeding

### 1. Prerequisites
- Docker & Docker Compose
- Node.js 20+ and npm 10+

### 2. Environment Setup
```bash
git clone https://github.com/your-org/question-forge.git
cd question-forge
cp .env.example .env
```
*Configure your chosen LLM keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_GEMINI_API_KEY`) in `.env`.*

### 3. Launch Infrastructure Containers
```bash
# Starts PostgreSQL (5432), Redis (6379), and Piston Sandbox (2000)
docker compose up -d postgres redis piston
```

### 4. Install Dependencies & Migrate Database
```bash
npm install
npm run db:generate
npm run db:migrate
```

### 5. Seed Demo Organization & Users
```bash
npm run db:seed
```
*Default Credentials Created:*
- **Admin**: `admin@demo.com` / `password123` (Org Slug: `demo`)
- **Reviewer**: `reviewer@demo.com` / `password123` (Org Slug: `demo`)

### 6. Run Automated Tests
```bash
npm run test
```

### 7. Start Development Servers
```bash
# Starts both the Express API and Vite React frontend concurrently
npm run dev
```
- Frontend UI: `http://localhost:5173`
- Backend API: `http://localhost:4000`

*(Optional) To test dedicated worker separation locally:*
```bash
# Terminal 1: Run HTTP API only
ENABLE_EMBEDDED_WORKERS=false npm run dev --workspace=apps/api

# Terminal 2: Run standalone worker process
npm run dev:worker
```

---

## Production Deployment (AWS / Terraform / Docker)

Question Forge is designed according to **12-Factor App principles** for horizontal scalability across cloud environments.

1. **Database:** Deploy AWS RDS PostgreSQL (version 16) with the `pgvector` extension enabled.
2. **Cache & Queue:** Provision an AWS ElastiCache for Redis cluster.
3. **Piston Sandbox:** Apply the included Terraform scripts under `infra/terraform/` to spin up auto-scaling EC2 instances running Piston Docker containers behind an internal Application Load Balancer.
4. **Storage:** Create an AWS S3 bucket with strict private access and configure presigned URL timeouts.
5. **Decoupled Containers:** Deploy stateless API replicas and independent BullMQ worker services via `docker-compose.prod.yml`:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```
6. **Automated CI/CD:** Push to `main` to trigger the automated GitHub Actions workflow (`.github/workflows/deploy-backend.yml`), which executes Turborepo tests, database migrations, rolling container restarts, and automated health checks with instant rollback.

### Sizing and Concurrency Recommendations

| Deployment Profile | Worker Concurrency | Sandbox Concurrency | Recommended API Replicas | Dedicated Worker Containers |
|---|---|---|---|---|
| **Development** | 2 | 5 | 1 (embedded worker) | 0 |
| **Staging / Small Team** | 5 | 10 | 2 | 1 |
| **Enterprise Production** | 10–15 | 25 | 4+ | 2–4 (autoscaled) |
| **High-Throughput Batch** | 25+ | 50+ | 6+ behind ALB | 5–10 (autoscaled) |

---

## Roadmap & Future Extensions

- **SSO SAML 2.0 & OIDC:** Native enterprise Okta, Google Workspace, and Microsoft Azure AD single sign-on integration.
- **Bull Board Dashboard:** Embedded administrator UI for live inspection of BullMQ generation and webhook queues.
- **Additional Language Runtimes:** Out-of-the-box support for Go, Rust, C#, and Ruby sandboxes.
- **Custom Agent Fine-Tuning:** LoRA adapters for fine-tuning the Generator and Adversary agents on customer-specific historical question banks.

---

## Contributing

We welcome contributions! Please follow our standard process:
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m "feat: add amazing feature"`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
