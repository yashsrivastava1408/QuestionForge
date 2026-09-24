# Contributing to Question Forge

Thank you for your interest in contributing to **Question Forge**! We welcome community contributions to help build the open-source gold standard for enterprise technical question generation, sandboxed execution, and assessment lifecycle management.

---

## 1. Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](./CODE_OF_CONDUCT.md). Please read it before participating in discussions or submitting pull requests.

---

## 2. Monorepo Architecture Overview

Question Forge is structured as an enterprise monorepo orchestrated with **Turborepo 2.x** and **npm workspaces**:

```text
question-forge/
├── apps/
│   ├── api/                   # Express HTTP API & Dedicated BullMQ Worker
│   │   ├── src/controllers/   # Business logic (separate from routing)
│   │   ├── src/routes/        # Slim route delegators
│   │   ├── src/queues/        # BullMQ queue & worker definitions
│   │   ├── src/__tests__/     # Vitest automated test suite
│   │   ├── src/index.ts       # Stateless HTTP server
│   │   └── src/worker.ts      # Standalone worker process
│   └── frontend/              # React 18 SPA (Vite + Tailwind CSS)
│
├── packages/
│   └── shared/                # Canonical Prisma schema & domain types
│
├── docs/                      # Architectural specifications & runbooks
├── infra/                     # Terraform AWS infrastructure
└── turbo.json                 # Monorepo pipeline definitions
```

---

## 3. Local Development Setup

### Prerequisites
- **Node.js**: v20+ LTS
- **npm**: v10+
- **Docker & Docker Compose**: For local PostgreSQL, Redis, and Piston sandboxes.

### Step-by-Step Setup
```bash
# 1. Clone the repository
git clone https://github.com/yashsrivastava1408/QuestionForge.git
cd QuestionForge

# 2. Configure environment
cp .env.example .env
# Fill in your OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GEMINI_API_KEY

# 3. Start local infrastructure containers
docker compose up -d postgres redis piston

# 4. Install dependencies across all workspaces
npm install

# 5. Generate Prisma Client & apply database migrations
npm run db:generate
npm run db:migrate

# 6. Seed demo users & sample organization
npm run db:seed
# Admin: admin@demo.com / password123 (Org: demo)
# Reviewer: reviewer@demo.com / password123 (Org: demo)

# 7. Start both API (port 4000) and Frontend (port 5173) concurrently
npm run dev
```

---

## 4. Architectural Rules & Best Practices

To maintain enterprise code quality, all pull requests must respect these conventions:

1. **Keep Routes Thin**:
   HTTP route handlers (`apps/api/src/routes/`) must strictly delegate to controllers (`apps/api/src/controllers/`). Do not write raw SQL or complex business logic in route files.
2. **Strict Input Validation**:
   Every POST, PATCH, or PUT endpoint must validate input payloads using **Zod schemas**.
3. **Decoupled Worker Integrity**:
   Time-consuming tasks (AI calls, Piston code executions, S3 exports) must be enqueued via BullMQ rather than executed synchronously inside HTTP request ticks.
4. **Tenant Isolation**:
   Every database query must strictly enforce `WHERE organizationId = req.user.organizationId` to prevent cross-tenant data leakage.

---

## 5. Testing & Quality Assurance

Before submitting a Pull Request, ensure that all tests pass:

```bash
# Run automated Vitest suite across all workspaces
npm run test

# Run Turborepo incremental build verification
npm run build

# Run linting
npm run lint
```

When adding new features or fixing bugs, add corresponding unit/integration tests under `apps/api/src/__tests__/`.

---

## 6. Git Workflow & Commit Guidelines

### Branch Naming Conventions
- `feat/feature-name` (New features)
- `fix/bug-description` (Bug fixes)
- `docs/documentation-update` (Docs & diagrams)
- `refactor/component-name` (Code restructuring)
- `perf/optimization` (Performance enhancements)

### Conventional Commits
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```text
feat(worker): add dynamic concurrency scaling based on queue depth
fix(dedup): adjust cosine similarity threshold to 0.88
docs(architecture): add sequence diagram for BullMQ retry engine
test(auth): add unit tests for token revocation blacklist
```

---

## 7. Submitting a Pull Request

1. Push your branch: `git push origin feat/your-feature-name`.
2. Open a Pull Request against `main`.
3. Complete the [Pull Request Template](./.github/PULL_REQUEST_TEMPLATE.md).
4. Verify that the GitHub Actions CI pipeline passes all checks.
5. A maintainer will review your code and provide feedback.
