# Question Forge

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18-blue)
![Node](https://img.shields.io/badge/Node-20%2B-green)
![Prisma](https://img.shields.io/badge/Prisma-ORM-teal)
![Docker](https://img.shields.io/badge/Docker-Enabled-blue)
![Redis](https://img.shields.io/badge/Redis-BullMQ-red)
![AWS](https://img.shields.io/badge/AWS-Terraform-orange)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

**Enterprise-Grade Multi-Agent AI Assessment Generation, Code Execution & Validation Platform**

Question Forge is an open-source, multi-agent AI orchestration platform engineered for enterprise HR and technical recruiting organizations. It automates the generation, rigorous algorithmic validation, human-in-the-loop review, and secure export of technical interview questions (Data Structures & Algorithms, Object-Oriented Design, System Design, SQL, and Conceptual MCQs).

By combining **LangGraph agentic debate**, **isolated Docker sandboxed code execution**, **Redis BullMQ asynchronous queues**, and **pgvector semantic deduplication**, Question Forge produces verified, hallucination-free technical assessments at enterprise scale without data loss.

---

## Table of Contents
- [Key Enterprise Capabilities](#key-enterprise-capabilities)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Core Workflows & Diagrams](#core-workflows--diagrams)
  - [1. Distributed Job Queue & SSE Progress Streaming](#1-distributed-job-queue--sse-progress-streaming)
  - [2. Multi-Agent Adversarial Debate Pipeline](#2-multi-agent-adversarial-debate-pipeline)
  - [3. High-Concurrency Sandboxed Code Execution](#3-high-concurrency-sandboxed-code-execution)
  - [4. Asynchronous Webhook Delivery Engine](#4-asynchronous-webhook-delivery-engine)
  - [5. Question Review & Lifecycle State Machine](#5-question-review--lifecycle-state-machine)
  - [6. Zero-Downtime CI/CD & Automated Rollback](#6-zero-downtime-cicd--automated-rollback)
- [Database Schema & ERD](#database-schema--erd)
- [Scalability & Reliability Matrix](#scalability--reliability-matrix)
- [Enterprise Security Architecture](#enterprise-security-architecture)
- [REST API Reference](#rest-api-reference)
- [Environment Variables](#environment-variables)
- [Local Development & Seeding](#local-development--seeding)
- [Production Deployment (AWS / Terraform)](#production-deployment-aws--terraform)
- [Roadmap & Limitations](#roadmap--limitations)
- [Contributing](#contributing)
- [License](#license)

---

## Key Enterprise Capabilities

1. **Multi-Agent Adversarial Validation Pipeline:**
   Rather than relying on single-shot LLM prompts, Question Forge employs a LangGraph state machine where a **Generator Agent** drafts problem specifications and optimal/brute solutions, an **Adversary Agent** identifies edge-case gaps and time/space complexity flaws, and a **Judge Agent** evaluates whether the problem passes strict quality rubrics, triggering iterative rewrites on failure.

2. **Parallel Sandboxed Code Execution:**
   Every generated coding problem is tested in an isolated Piston container sandbox across multiple languages (Python, Java, C++, JavaScript). Edge-case suites are executed against both optimal and brute-force solutions simultaneously using concurrency-capped worker pools (`p-limit`), slashing validation latency by over 10×.

3. **Crash-Resilient Distributed Queues (BullMQ + Redis):**
   Generation jobs and outbound webhook deliveries run through separate BullMQ queues backed by Redis. If an API container restarts mid-generation, jobs persist in Redis and resume automatically. Progress is streamed directly to the frontend via Server-Sent Events (SSE).

4. **Independent Asynchronous Webhook Delivery:**
   Approved questions and exported papers trigger outbound webhook notifications to customer ATS/LMS platforms. Deliveries are decoupled from HTTP request loops, signed with cryptographic HMAC-SHA256 signatures, and backed by a 5-tier exponential backoff retry mechanism.

5. **Algorithmic Semantic Deduplication (`pgvector`):**
   Every approved question is embedded into high-dimensional vector space stored in PostgreSQL via the `pgvector` extension. Prior to final insertion, cosine similarity calculations prevent duplicate problems and cross-assessment question leakage.

6. **Hardened Multi-Tenancy & Zero-Trust Security:**
   - Stateless JWT tokens paired with an **instant Redis JTI Revocation Blacklist** on logout.
   - Strict organization-boundary authorization ensuring zero cross-tenant leakage.
   - Strict Zod mutation schemas protecting against mass-assignment vulnerabilities.
   - Puppeteer PDF rendering sanitized against HTML injection and XSS.
   - Direct-to-S3 asset storage with ephemeral presigned URLs.

7. **Bring Your Own Key (BYOK) Multi-Provider Support:**
   Provider-agnostic design with first-class support for OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet), and Google (Gemini 1.5 Pro/Flash). SDK clients are instantiated as module singletons for optimal socket reuse and minimal latency.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, TanStack React Query, React Router |
| **API Server** | Node.js (v20+), Express.js, TypeScript, Zod Schema Validation |
| **AI Orchestration** | LangGraph State Machines, OpenAI SDK, Anthropic SDK, Google Gen AI SDK |
| **Queues & Caching** | Redis 7, BullMQ (Independent Generation & Webhook queues), ioredis |
| **Database & Vector** | PostgreSQL 16, Prisma ORM, `pgvector` extension, Composite Indexes |
| **Execution Sandbox** | Piston (Isolated Docker containers with 512MB RAM / 0.75 CPU quota per instance) |
| **PDF & Export** | Puppeteer (Headless Chromium with HTML entity escaping), AWS S3 SDK |
| **Infrastructure** | Docker Compose, Terraform (AWS EC2, RDS, ElastiCache, S3), GitHub Actions |

---

## System Architecture

```mermaid
flowchart TD
    subgraph Clients ["Client Layer"]
        SPA["React 18 SPA (Vite)"]
        SSE_Stream["SSE Progress Listener"]
    end

    subgraph Gateway ["Ingress & Security"]
        Proxy["Reverse Proxy / Nginx"]
        RL["Redis Rate Limiter\n(express-rate-limit)"]
        AuthMid["JWT Auth + JTI Blacklist Check"]
    end

    subgraph API_Cluster ["Express API Replicas (Stateless)"]
        API_1["API Replica 1"]
        API_2["API Replica 2"]
        Routes["Routes: Auth | Generate | Questions | Export | Webhooks"]
    end

    subgraph Queue_State ["Distributed State (Redis 7)"]
        Bull_Gen["BullMQ: 'generation' Queue"]
        Bull_Hook["BullMQ: 'webhooks' Queue"]
        Cache_Analytics["Redis Cache (Analytics TTL 60-120s)"]
        Blacklist["Redis JTI Token Blacklist"]
    end

    subgraph Workers ["Background Worker Pool"]
        Gen_Worker["Generation Worker\n(Concurrency: 5)"]
        Hook_Worker["Webhook Delivery Worker\n(Concurrency: 10)"]
    end

    subgraph AI_Engine ["Multi-Agent Orchestration (LangGraph)"]
        Generator["Generator Agent\n(Drafts Problem & Tests)"]
        Adversary["Adversary Agent\n(Edge-Case Analysis)"]
        Judge["Judge Agent\n(Consensus & Scoring)"]
    end

    subgraph Execution ["Sandboxed Execution"]
        PistonPool["Piston Docker Sandbox\n(p-limit Parallel Queue)"]
    end

    subgraph Storage ["Persistent Storage"]
        Postgres[("PostgreSQL 16 + pgvector\n(Questions, Users, Audits)")]
        S3[("AWS S3 Bucket\n(Watermarked PDFs & JSON)")]
    end

    subgraph External ["External Integrations"]
        LMS["Customer ATS / LMS\n(Greenhouse, Lever, Canvas)"]
    end

    SPA --> Proxy
    SSE_Stream --> Proxy
    Proxy --> RL --> AuthMid --> API_1 & API_2
    API_1 & API_2 --> Routes

    Routes --> Bull_Gen
    Routes --> Bull_Hook
    Routes --> Cache_Analytics
    AuthMid --> Blacklist

    Bull_Gen --> Gen_Worker
    Bull_Hook --> Hook_Worker

    Gen_Worker --> AI_Engine
    AI_Engine --> Generator <--> Adversary
    Adversary --> Judge
    Gen_Worker --> PistonPool
    Gen_Worker --> Postgres

    Hook_Worker -->|HMAC-SHA256 POST| LMS
    Routes --> S3
    Routes --> Postgres
```

---

## Core Workflows & Diagrams

### 1. Distributed Job Queue & SSE Progress Streaming

Question generation is executed asynchronously to handle deep multi-agent deliberation and multi-language test validation without blocking HTTP connections:

```mermaid
sequenceDiagram
    autonumber
    actor User as Client / Browser
    participant API as Express API
    participant Redis as Redis / BullMQ
    participant Worker as Generation Worker
    participant LangGraph as LangGraph Multi-Agent
    participant Sandbox as Piston Sandbox (Parallel)
    participant DB as Postgres (pgvector)

    User->>API: POST /api/generate (Topic, Difficulty, Langs)
    API->>Redis: Enqueue job in 'generation' queue
    API-->>User: 202 Accepted { jobId, statusUrl, streamUrl }

    User->>API: GET /api/generate/status/:jobId/stream?token=JWT (SSE)
    API-->>User: SSE Connection Established (keep-alive)

    Redis->>Worker: Dequeue generation job
    Worker->>API: Update BullMQ Progress (10%)
    API-->>User: event: progress { percent: 10, stage: "Drafting Problem" }

    Worker->>LangGraph: Run Generator -> Adversary -> Judge debate loop
    Worker->>API: Update BullMQ Progress (40%)
    API-->>User: event: progress { percent: 40, stage: "Adversarial Debate" }

    Worker->>Sandbox: Execute optimal & brute-force across all languages (Parallel)
    Sandbox-->>Worker: Execution traces & outputs verified
    Worker->>API: Update BullMQ Progress (75%)
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
    Start([User Generation Request]) --> GenInit[Generator Agent:\nDrafts Title, Statement, Constraints]
    GenInit --> GenCode[Generator Agent:\nProduces Optimal + Brute-Force Solutions & Test Cases]
    
    GenCode --> AdvReview[Adversary Agent:\nIdentifies Corner Cases, Hidden Traps & Flawed Bounds]
    
    AdvReview --> JudgeEval{Judge Agent Evaluation:\nMeets Rigorous Quality Rubric?}
    
    JudgeEval -- "Critique / Revision Needed\n(Score < Threshold)" --> RetryCheck{Retry Count < 3?}
    RetryCheck -- Yes --> FeedbackGen[Inject Feedback into State:\nForce Targeted Rewrite]
    FeedbackGen --> GenInit
    
    RetryCheck -- No --> FailState([Mark Generation FAILED\nLog to Audit Trail])
    
    JudgeEval -- "Approved\n(Consensus Reached)" --> ValidationSuite[Dispatch to Parallel Sandbox Validation]
    ValidationSuite --> Deduplication[pgvector Embedding Check\nOrg Deduplication]
    Deduplication --> SuccessState([Question Status: VALIDATED])
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
        Slot1["Execution Worker 1"]
        Slot2["Execution Worker 2"]
        Slot3["..."]
        Slot10["Execution Worker 10"]
    end

    subgraph SandboxNodes ["Piston Docker Sandboxes"]
        P1["Container Node A\n(512MB / 0.75 CPU)"]
        P2["Container Node B\n(512MB / 0.75 CPU)"]
    end

    subgraph Assertion ["Verification Engine"]
        Match{"Optimal Output ==\nBrute Force Output?"}
        Pass([All Cases Pass])
        Fail([Trigger Self-Correction])
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
    participant Worker as Webhook Worker
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

### 6. Zero-Downtime CI/CD & Automated Rollback

```mermaid
flowchart TD
    Push([Push to main Branch]) --> GHA[GitHub Actions Runner]
    
    subgraph BuildStage ["Stage 1: Build & Validate"]
        GHA --> Install[Install Dependencies]
        Install --> Typecheck[TypeScript Compilation]
        Typecheck --> Test[Run Unit & Integration Tests]
    end

    subgraph DeployStage ["Stage 2: Zero-Downtime Deployment"]
        Test --> SSH[SSH to Production Host]
        SSH --> Pull[Pull Latest Git & Docker Images]
        Pull --> Migrate["Execute 'prisma migrate deploy'\n(Prevents Schema Drift)"]
        Migrate --> RollingRestart[Docker Compose Rolling Container Restart]
    end

    subgraph HealthCheck ["Stage 3: Automated Health Probe"]
        RollingRestart --> Probe["Probe GET /api/health\n(Max 15 Attempts @ 2s interval)"]
        Probe -- "200 Healthy" --> DeploySuccess([Deployment Succeeded 🎉])
        Probe -- "Failed after 15 checks" --> Rollback["Execute Rollback to Previous Commit\nRestore Containers"]
        Rollback --> DeployFailed([Deployment Aborted & Alerted ❌])
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

## Scalability & Reliability Matrix

| Architecture Dimension | Legacy Approach | Question Forge Enterprise Architecture |
|---|---|---|
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
| `GET` | `/api/analytics` | Overview metrics (Redis cached 60s) | Bearer |
| `GET` | `/api/analytics/export-stats` | Export metrics by format (Redis cached 120s) | Bearer |
| `PATCH` | `/api/admin/users/:id/role` | Modify user role (organization-scoped) | Admin |
| `POST` | `/api/webhooks/test` | Enqueue test webhook to verify LMS connection | Admin |

---

## Environment Variables

| Variable | Description | Example / Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`?connection_limit=5` for replicas) | `postgresql://user:pass@localhost:5432/qforge` |
| `REDIS_URL` | Redis instance for BullMQ queues, rate limiting, and cache | `redis://localhost:6379` |
| `JWT_SECRET` | Secret key for signing JSON Web Tokens | `your-cryptographically-secure-secret` |
| `ENCRYPTION_KEY` | 64-character hexadecimal key for encrypting BYOK API keys | `a1b2c3d4e5...` |
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
- Node.js 20+ and npm

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

### 6. Start Development Servers
```bash
npm run dev
```
- Frontend UI: `http://localhost:5173`
- Backend API: `http://localhost:4000`

---

## Production Deployment (AWS / Terraform)

Question Forge is designed according to **12-Factor App principles** for horizontal scalability across cloud environments.

1. **Database:** Deploy AWS RDS PostgreSQL (version 16) with the `pgvector` extension enabled.
2. **Cache & Queue:** Provision an AWS ElastiCache for Redis cluster.
3. **Piston Sandbox:** Apply the included Terraform scripts under `infra/terraform/` to spin up auto-scaling EC2 instances running Piston Docker containers behind an internal Application Load Balancer.
4. **Storage:** Create an AWS S3 bucket with strict private access and configure presigned URL timeouts.
5. **API Replicas:** Run multiple stateless container replicas using `docker-compose.prod.yml`.
6. **Automated CI/CD:** Push to `main` to trigger the automated GitHub Actions workflow (`.github/workflows/deploy-backend.yml`), which executes database migrations, restarts containers with zero downtime, and validates health checks.

### Sizing and Concurrency Recommendations

| Deployment Profile | Worker Concurrency | Sandbox Concurrency | Recommended API Replicas |
|---|---|---|---|
| **Development** | 2 | 5 | 1 |
| **Staging / Small Team** | 5 | 10 | 2 |
| **Enterprise Production** | 10–15 | 25 | 4+ |
| **High-Throughput Batch** | 25+ (Dedicated Worker Nodes) | 50+ | 6+ behind ALB |

---

## Roadmap & Limitations

- **SSO SAML / OIDC:** Native enterprise Okta, Google Workspace, and Microsoft Azure AD single sign-on integration.
- **Bull Board Dashboard:** Embedded administrator UI for inspecting BullMQ generation and webhook queues.
- **Languages:** Piston sandbox is currently validated out-of-the-box for Python, Java, C++, and JavaScript. Additional language runtimes (Go, Rust, C#) require custom Docker images.
- **Dedicated Worker Containers:** For high-throughput installations (>50 concurrent generation jobs), decoupling the BullMQ worker process from the Express HTTP container is recommended.

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
