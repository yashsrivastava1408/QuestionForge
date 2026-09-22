# Question Forge

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18-blue)
![Node](https://img.shields.io/badge/Node-20%2B-green)
![Prisma](https://img.shields.io/badge/Prisma-ORM-teal)
![Docker](https://img.shields.io/badge/Docker-Enabled-blue)
![AWS](https://img.shields.io/badge/AWS-Terraform-orange)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

**Enterprise-Grade AI Assessment Generation & Validation Platform**

Question Forge is an open-source, multi-agent AI platform built for enterprise HR and technical recruiting teams. It automates the generation, rigorous technical validation, and secure export of interview questions (Data Structures and Algorithms, Object-Oriented Programming, System Design, SQL). By leveraging agentic debate and sandboxed code execution, Question Forge drastically reduces the factual errors and ambiguities commonly found in standard LLM outputs.

---

## Table of Contents
- [Key Enterprise Capabilities](#key-enterprise-capabilities)
- [Technology Stack](#technology-stack)
- [High-Level Architecture](#high-level-architecture)
- [Component Architecture and Data Flow](#component-architecture-and-data-flow)
- [Environment Variables](#environment-variables)
- [Deployment and Configuration](#deployment-and-configuration)
- [Roadmap & Known Limitations](#roadmap--known-limitations)
- [Contributing](#contributing)

---

## Key Enterprise Capabilities

1. **Multi-Agent Validation Pipeline:** 
   Question Forge does not rely on a single LLM prompt. It utilizes an advanced **Agentic Debate** workflow powered by LangGraph. An Adversary Agent actively attempts to find factual errors or missing constraints in the generated question, while a Judge Agent forces the Generator to rewrite until the question passes strict criteria, eliminating the vast majority of hallucinations.

2. **Sandboxed Code Execution:** 
   For DSA (Data Structures and Algorithms) questions, the platform generates both an optimal solution and a brute-force solution alongside edge-case test suites. It executes this code in an isolated Docker sandbox to mathematically verify correctness, time complexity constraints, and ensure outputs match perfectly.

3. **Algorithmic Deduplication via Vector Embeddings:** 
   Every approved question is embedded into a vector space using PostgreSQL and `pgvector`. New questions are compared against the entire organizational bank using cosine similarity to minimize duplicates and prevent question leakage.

4. **Secure Export & LMS Integration:** 
   Generate full assessment papers and export them as watermarked PDFs, internal solution guides, or raw JSON. Webhooks allow seamless synchronization with existing ATS (Applicant Tracking Systems) and LMS platforms.

5. **Bring Your Own Key (BYOK):** 
   Completely provider-agnostic. Configure API keys for OpenAI (GPT-4o), Anthropic (Claude 3.5), or Google (Gemini) simply by setting the corresponding variables in your `.env` file. The engine will automatically detect and route to the configured provider.

---

## Technology Stack

Question Forge is a modern, full-stack monorepo designed for high availability and strict security.

### Core Stack
- **Frontend**: React 18, Vite, React Router, React Query
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL, Prisma ORM, `pgvector` extension

### AI & Orchestration
- **Agent Framework**: LangGraph (Multi-Agent State Machines)
- **LLM Integrations**: OpenAI SDK, Anthropic SDK, Google Gen AI SDK

### Infrastructure & Security
- **Execution Sandbox**: Piston (Isolated Docker containers with zero network access)
- **Cloud Infrastructure**: AWS (EC2, RDS, S3)
- **Infrastructure as Code**: Terraform
- **CI/CD**: GitHub Actions

---

## High-Level Architecture

```mermaid
flowchart TD
    subgraph Frontend [React SPA]
        UI[User Interface]
        Wiz[Generation Wizard]
    end

    subgraph Backend [Node.js API]
        API[Express Router]
        GenService[Generation Pipeline]
        ValService[Validation Suite]
    end

    subgraph AI_Orchestration [LangGraph Agents]
        AgentGen[Generator]
        AgentAdv[Adversary]
        AgentJudge[Judge]
    end

    subgraph Infrastructure [Data & Sandbox]
        DB[(PostgreSQL + pgvector)]
        Sandbox[Piston Execution Sandbox]
    end

    UI --> API
    Wiz --> GenService
    GenService <--> AI_Orchestration
    AI_Orchestration --> ValService
    ValService <--> Sandbox
    ValService <--> DB
```

---

## Component Architecture and Data Flow

### 1. Generation and Validation Pipeline

```mermaid
sequenceDiagram
    participant User
    participant API
    participant LangGraph
    participant Piston Sandbox
    participant Database

    User->>API: Initiate Generation Job (Parameters)
    API->>LangGraph: Dispatch Generation Workflow
    LangGraph->>LangGraph: LLM Generates Question + Solutions + Tests
    LangGraph->>Piston Sandbox: Execute Optimal & Brute-Force Code
    Piston Sandbox-->>LangGraph: Execution Results
    
    alt Outputs Match
        LangGraph->>Database: Store Draft Question
        LangGraph->>Database: Generate and Store Embedding Vector
    else Outputs Mismatch
        LangGraph->>LangGraph: LLM Self-Correction Loop (Max 3 Retries)
    end
```

### 2. OOP Adversarial Debate

```mermaid
flowchart LR
    Start([Start Debate]) --> Generator[Generator Agent\nDrafts Question]
    Generator --> Adversary[Adversary Agent\nCritiques Question]
    Adversary --> Judge[Judge Agent\nEvaluates Debate]
    
    Judge -- "Passes Criteria" --> Approved([Validation Passed])
    Judge -- "Fails Criteria" --> Generator
```

### 3. Review and Export Workflow

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Generated
    DRAFT --> VALIDATING: Sent to Sandbox/Debate
    VALIDATING --> VALIDATED: Passed Validation
    VALIDATING --> FAILED: Failed 3 Retries
    VALIDATED --> IN_REVIEW: Human Review Requested
    IN_REVIEW --> APPROVED: Reviewer Approves
    IN_REVIEW --> REJECTED: Reviewer Rejects
    APPROVED --> PAPER_ASSIGNED: Added to Paper
    PAPER_ASSIGNED --> EXPORTED: PDF/JSON Generation
    APPROVED --> WEBHOOK_TRIGGERED: Sent to LMS
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string (must include pgvector) | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret key for signing auth tokens | `your-secure-secret-key` |
| `ENCRYPTION_KEY` | 64-char hex string for encrypting API keys at rest | `597d4ecba...` |
| `OPENAI_API_KEY` | Optional: OpenAI API Key for GPT models | `sk-...` |
| `ANTHROPIC_API_KEY` | Optional: Anthropic API Key for Claude models | `sk-ant-...` |
| `GOOGLE_GEMINI_API_KEY` | Optional: Google Gemini API Key | `AIzaSy...` |
| `PISTON_API_URL` | URL to the Piston code execution sandbox | `http://localhost:2000` |

---

## Deployment and Configuration

Question Forge is designed according to the **12-Factor App** principles, making it infrastructure-agnostic and easy to deploy on any modern cloud provider.

### Local Development Setup

1. **Clone and Configure:**
```bash
git clone https://github.com/your-org/question-forge.git
cd question-forge
cp .env.example .env
```

2. **Add Environment Variables:** Provide your `DATABASE_URL`, `JWT_SECRET`, and chosen LLM API keys in your `.env` file.

3. **Start Infrastructure Services:**
```bash
docker-compose up -d postgres piston
```

4. **Run Migrations and Install Dependencies:**
```bash
npm install
npm run db:generate
npm run db:migrate
```

5. **Start Application:**
```bash
npm run dev
```
*Frontend: `http://localhost:5173` | API: `http://localhost:4000`*

### Production Deployment (AWS / Terraform)

Question Forge includes native support for AWS via Terraform and GitHub Actions.

1. **Database:** Provision an AWS RDS PostgreSQL instance and update your `.env` with the new `DATABASE_URL`.
2. **Execution Sandbox (Terraform):** Navigate to `infra/terraform`. Running `terraform apply` provisions a VPC, Security Groups, and an EC2 instance that automatically installs Docker and runs the Piston sandbox image via user data scripts. Once provisioned, update your `.env` with the new `PISTON_API_URL`.
3. **Storage:** Create an AWS S3 bucket for secure PDF exports and update `S3_BUCKET_NAME` alongside your IAM credentials in `.env`.
4. **CI/CD:** Utilize the included `.github/workflows/deploy-backend.yml` to automatically deploy API updates to your production EC2 instances on push to `main`.

---

## Roadmap & Known Limitations

- **Roadmap:** Enterprise SSO integration (Google/Microsoft Workspace), ATS plugin integrations (Greenhouse, Lever), and multi-tenant billing support.
- **Limitation:** The Piston sandbox currently only guarantees robust support for Python, Java, C++, and JavaScript. Additional languages require custom Docker configurations and adapters.

---

## Contributing

We welcome contributions from the community! To get started:
1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature-name`)
3. Commit your changes and push to your branch
4. Open a Pull Request detailing your changes

---

## License

This project is licensed under the MIT License.
