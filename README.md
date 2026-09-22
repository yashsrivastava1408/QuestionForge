# Question Forge

**Enterprise-Grade AI Assessment Question Generator with Multi-Layer Validation**

Question Forge is an open-source platform designed for enterprise HR and university placement teams to generate, rigorously validate, and export technical interview questions (Data Structures and Algorithms, Object-Oriented Programming, System Design, SQL). It solves the core problem of AI-generated assessments: ensuring technical accuracy and avoiding ambiguous questions through an automated, multi-layer validation pipeline.

---

## High-Level Architecture

```mermaid
flowchart TD
    subgraph Frontend [Frontend Application - React/Vite]
        UI[User Interface]
        Wiz[Generation Wizard]
        Rev[Review Queue]
    end

    subgraph Backend [Backend API - Node.js/Express]
        API[Express Router]
        GenService[Generation Service]
        ValService[Validation Service]
        ExpService[Export & Webhook Service]
    end

    subgraph Orchestration [AI Orchestration - LangGraph]
        AgentGen[Generator Agent]
        AgentAdv[Adversary Agent]
        AgentJudge[Judge Agent]
    end

    subgraph Infrastructure [Data & Execution]
        DB[(PostgreSQL + pgvector)]
        Sandbox[Piston Execution Sandbox]
        LMS[External LMS/ATS]
    end

    UI --> API
    Wiz --> GenService
    Rev --> ExpService

    GenService <--> Orchestration
    Orchestration --> ValService
    ValService <--> Sandbox
    ValService <--> DB
    ExpService --> LMS
```

---

## What This Project Does

Question Forge provides an end-to-end pipeline for technical question creation:

1. **Parameter-Driven Generation**: Users configure target profiles (e.g., Senior Backend Engineer), topics, difficulty distribution, and programming languages. The platform estimates the token cost before generating the batch.
2. **Deterministic Code Validation**: For Data Structures and Algorithms (DSA) questions, the system generates both an optimal solution and a brute-force solution, along with over 20 test cases. It then executes both solutions in a securely isolated Docker sandbox to ensure outputs match perfectly.
3. **Adversarial Agent Validation**: For Object-Oriented Programming (OOPS) and conceptual questions, a LangGraph-powered adversarial debate is initiated. An Adversary Agent actively tries to find loopholes, ambiguity, or missing constraints in the generated question, while a Judge Agent makes the final determination on whether the question passes.
4. **Vector Deduplication**: Every approved question is embedded into a vector space using PostgreSQL and `pgvector`. New questions are compared against the existing bank using cosine similarity to prevent duplicates.
5. **Human-in-the-Loop Review**: Human reviewers are presented with a queue of only pre-validated questions. The interface highlights validation results, injected edge cases, and provides a streamlined approval process.
6. **Secure Export and Integration**: Approved questions can be organized into Papers and exported as raw JSON, watermarked Candidate PDFs, or Internal PDFs containing solutions. Alternatively, webhooks can be configured to push questions directly to an external Learning Management System (LMS) or Applicant Tracking System (ATS).

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

### 2. OOPS Adversarial Debate

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

## Monorepo Structure

The repository is managed using npm workspaces, cleanly separating the frontend, backend, and modular internal packages.

* **apps/frontend**: React Single Page Application utilizing Vite, React Router, and React Query. Provides the user interface for all configuration and review tasks.
* **apps/api**: Node.js and Express REST API. Manages database connections, authentication, authorization, and exposes endpoints for the frontend.
* **packages/shared**: Contains the central Prisma schema, generated database client, and shared TypeScript types ensuring strict typing across the stack.
* **packages/ai-orchestration**: Encapsulates LangGraph workflows, defining the state machines for multi-agent generation and validation processes.
* **packages/sandbox**: A secure wrapper for communicating with the Piston code execution API.
* **packages/ingestion**: Adapters for parsing and normalizing questions scraped from external sources for ingestion into the question bank.

---

## Security Model

* **Execution Isolation**: The Piston code execution sandbox runs in a dedicated Docker network. It has no inbound or outbound internet access and cannot reach the PostgreSQL database or the main API.
* **Role-Based Access Control**: Strict enforcement of Administrator, Reviewer, and Generator roles at the API middleware layer.
* **Audit Logging**: Immutable audit logs track every question view, edit, approval, rejection, and export event.
* **Ephemeral Exports**: Generated PDF and JSON export URLs are signed and automatically expire after a configured duration (default 5 minutes).

---

## Deployment and Configuration

### Prerequisites
* Node.js (version 20 or higher)
* Docker and Docker Compose
* LLM Provider API Key (Anthropic or OpenAI)

### Running Locally

1. Clone the repository and configure the environment:
```bash
git clone https://github.com/your-org/question-forge.git
cd question-forge
cp .env.example .env
```

2. Add your required environment variables to `.env` (e.g., `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `ENCRYPTION_KEY`).

3. Start the infrastructure components (Database and Sandbox):
```bash
docker-compose up -d postgres piston
```

4. Install dependencies and run database migrations:
```bash
npm install
npm run db:generate
npm run db:migrate
```

5. Start the development servers:
```bash
npm run dev
```

* Frontend Application: `http://localhost:5173`
* Backend API: `http://localhost:4000`

---

## License

This project is licensed under the MIT License.
