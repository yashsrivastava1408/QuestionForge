# Database Schema, ERD & Indexing Strategy

This document details the PostgreSQL 16 relational data model, Prisma ORM mappings, composite indexing strategies, and migration safety guidelines for Question Forge.

---

## 1. Entity-Relationship Model (ERD)

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
        string id PK "cuid / uuid"
        string name "Organization Name"
        string slug UK "URL-friendly identifier"
        json llmApiKeysEncrypted "AES-256-GCM BYOK"
        int maxQuestionsPerDay "Quota"
        string webhookUrl "Outbound ATS/LMS endpoint"
        string webhookSecret "HMAC signing secret"
        datetime createdAt
    }

    USER {
        string id PK
        string email UK
        string name
        enum role "ADMIN | REVIEWER | GENERATOR"
        string passwordHash "bcrypt (cost factor 10)"
        string organizationId FK
        datetime createdAt
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
        float_array embeddingVector "pgvector(1536) / custom"
        string organizationId FK
        datetime createdAt
        datetime updatedAt
    }

    QUESTION_HISTORY {
        string id PK
        string questionId FK
        int version "Incrementing counter"
        json snapshot "Full previous state"
        string editedById FK
        datetime createdAt
    }

    QUESTION_REVIEW {
        string id PK
        string questionId FK
        string reviewerId FK
        enum decision "APPROVED | REJECTED"
        text note
        datetime createdAt
    }

    PAPER {
        string id PK
        string title
        json config "Timer, instructions, pass mark"
        string organizationId FK
        datetime createdAt
    }

    PAPER_QUESTION {
        string id PK
        string paperId FK
        string questionId FK
        int orderIndex
    }

    EXPORT_RECORD {
        string id PK
        string paperId FK
        enum format "JSON | PDF_CANDIDATE | PDF_INTERNAL"
        string s3Url
        string signedToken UK
        datetime expiresAt
        datetime createdAt
    }

    AUDIT_LOG {
        string id PK
        string organizationId FK
        string userId FK
        enum action "LOGIN | GENERATE | REVIEW | EXPORT | ..."
        json metadata
        string ipAddress
        datetime createdAt
    }
```

---

## 2. Composite Indexing Strategies

In multi-tenant systems, executing queries without composite tenant indexes results in full table scans across all organizations. Question Forge implements high-selectivity composite indexes:

### 1. `@@index([organizationId, status])` on `Question`
- **Use Case**: Filtering candidate review pools (`GET /api/questions?status=IN_REVIEW`).
- **Optimization**: Postgres performs an Index Scan on `organizationId` and immediately evaluates `status` in the index leaf without loading table rows.

### 2. `@@index([organizationId, type, difficulty])` on `Question`
- **Use Case**: Filtered search during assessment paper assembly (e.g., selecting 2 "HARD" "DSA" questions).
- **Optimization**: Satisfies compound equality predicates in a single B-Tree traversal.

### 3. `@@index([questionId, version])` on `QuestionHistory`
- **Use Case**: Fetching versioned revision history snapshots for human audit logs.
- **Optimization**: Guarantees $O(\log N)$ lookup by question ID and sequential version scanning.

---

## 3. Safe Schema Migration Protocol

To guarantee zero downtime in CI/CD pipelines, Question Forge follows backward-compatible schema changes:

1. **Step 1 (Expand)**: Add new columns as nullable (`Optional` in Prisma) or with sensible defaults.
2. **Step 2 (Deploy Code)**: Deploy API and worker containers reading from either old or new format.
3. **Step 3 (Backfill)**: Run non-blocking background script to populate existing rows.
4. **Step 4 (Contract)**: Apply migration adding `NOT NULL` constraint and drop deprecated columns.

Migrations are deployed in GitHub Actions using:
```bash
npx prisma migrate deploy
```
This applies pending migrations without attempting to generate or prompt interactively, preventing CI pipeline stalls.
