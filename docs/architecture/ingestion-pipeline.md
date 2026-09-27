# Real-World Question Ingestion

This document specifies `packages/ingestion` and the `/api/ingestion/*` endpoints it backs — a way to seed the question bank with real, previously-published problems, distinct from the AI generation pipeline described in [`multi-agent-debate.md`](./multi-agent-debate.md).

---

## 1. Why This Is Separate From Generation

The LangGraph generate/validate pipeline produces a full question: statement, optimal and brute-force solutions, test cases, the works. Ingestion produces something more modest but genuinely useful: a **real problem statement and metadata**, scraped from a public source, with no solutions or test cases attached. It exists for the workflow where a reviewer wants to seed the bank from a known-good, already-vetted problem instead of trusting an LLM to invent one from scratch — the ingested row lands as a `DRAFT` question for a human (or a follow-up generation pass) to complete.

```mermaid
flowchart LR
    subgraph Sources ["Public Sources"]
        LC["leetcode.com/graphql\n(unofficial GraphQL API)"]
        GFG["geeksforgeeks.org/*\n(server-rendered HTML)"]
    end

    subgraph Pkg ["packages/ingestion"]
        LCA["LeetCodeAdapter"]
        GFGA["GFGAdapter"]
        Norm["IngestedQuestion\n(shared normalized shape)"]
    end

    subgraph API ["apps/api"]
        Ctrl["IngestionController"]
        DB[("Prisma: Question\nstatus = DRAFT")]
    end

    LC --> LCA --> Norm
    GFG --> GFGA --> Norm
    Norm --> Ctrl
    Ctrl -->|"save: true"| DB
    Ctrl -->|"save: false"| Preview(["Preview payload\n(nothing persisted)"])
```

Compared to generation, this pipeline is deliberately shallow — one hop from public HTML/GraphQL to a normalized shape to a `DRAFT` row, with no LLM, no sandbox, and no retry loop involved.

## 2. Adapters (`packages/ingestion/src/adapters/`)

Both adapters normalize their source into the same `IngestedQuestion` shape (`title`, `statement`, `difficulty`, `topic`, `tags`, `languages`, `sourceUrl`, `sourcePlatform`), so the controller and UI don't need to know which platform a question came from.

### `LeetCodeAdapter`
- `fetchQuestion(titleSlug)` — POSTs a GraphQL query to `leetcode.com/graphql`, strips HTML from the returned `content` field, maps LeetCode's `Easy/Medium/Hard` to this app's `EASY/MEDIUM/HARD`, and self-rate-limits with a configurable delay (2s by default; the constructor accepts an override, used in tests to run instantly).
- `fetchByCategory(category, limit)` — runs LeetCode's `questionList` GraphQL query filtered by tag, then calls `fetchQuestion` once per resulting slug. A failed list query degrades to an empty array rather than throwing; a failure on an individual slug is simply skipped.

### `GFGAdapter`
- `fetchQuestion(slug)` — fetches the GeeksforGeeks article HTML directly and parses it with Cheerio (`$('h1')` for the title, the first few `.entry-content p` paragraphs for the statement). No list/category endpoint — GFG doesn't expose one publicly the way LeetCode's GraphQL API does.

Both adapters return `null` (never throw) on a 404, a network error, or an unparseable response — the controller turns that into a normal 404, not a 500.

### `fetchByCategory` in detail

The only multi-question path is LeetCode's, and it's two sequential network stages, not one:

```mermaid
sequenceDiagram
    autonumber
    participant C as IngestionController
    participant A as LeetCodeAdapter
    participant LC as leetcode.com/graphql

    C->>A: fetchByCategory("dynamic-programming", limit=20)
    A->>LC: questionList(filters: { tags: ["dynamic-programming"] }, limit: 20)
    LC-->>A: [{ titleSlug }, { titleSlug }, ...] (up to 20)

    loop for each titleSlug
        A->>A: await delay (2s, self-rate-limited)
        A->>LC: fetchQuestion(titleSlug)
        LC-->>A: question detail or 404
    end

    A-->>C: IngestedQuestion[] (skips any slug that failed)
```

A 20-item category fetch therefore takes roughly 20 × 2s ≈ 40 seconds end-to-end — that's the deliberate trade-off for not getting rate-limited by an unofficial API, not an oversight; the endpoint is meant for occasional bulk seeding, not a hot path.

## 3. API Surface (`apps/api/src/controllers/ingestionController.ts`)

| Endpoint | Body | Behavior |
|---|---|---|
| `POST /api/ingestion/fetch` | `{ platform: "leetcode" \| "gfg", slug, save?: boolean }` | Fetches one question. `save: false` (default) returns a preview only; `save: true` persists it as `status: "DRAFT"`, scoped to the caller's `organizationId`. |
| `POST /api/ingestion/fetch-category` | `{ platform: "leetcode", category, limit?: number, save?: boolean }` | Same preview/save split, batched — LeetCode only, since GFG has no list endpoint. |

Both routes require `authenticate` + `authorize('ADMIN')` — ingestion is an administrative bulk-loading action, not a per-user one. Validation is Zod-based (`fetchOneSchema`/`fetchCategorySchema`), matching the rest of the controller layer's conventions.

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant UI as Admin Console\n(Import Questions tab)
    participant API as POST /api/ingestion/fetch
    participant Ctrl as IngestionController
    participant Adapter as LeetCodeAdapter / GFGAdapter
    participant DB as Prisma (Question)

    Admin->>UI: Enter platform + slug, click "Preview"
    UI->>API: { platform, slug, save: false }
    API->>Ctrl: fetchOne(req, res, next)
    Ctrl->>Adapter: fetchQuestion(slug)
    Adapter-->>Ctrl: IngestedQuestion | null
    alt not found
        Ctrl-->>UI: 404 AppError
    else found
        Ctrl-->>UI: 200 { saved: false, question }
        UI-->>Admin: Render preview card

        Admin->>UI: Click "Save as Draft"
        UI->>API: { platform, slug, save: true }
        API->>Ctrl: fetchOne(req, res, next)
        Ctrl->>Adapter: fetchQuestion(slug)  %% fetched again, not cached
        Adapter-->>Ctrl: IngestedQuestion
        Ctrl->>DB: question.create({ ...data, status: "DRAFT", organizationId })
        DB-->>Ctrl: created row
        Ctrl-->>UI: 201 { saved: true, question }
    end
```

Note the "Save as Draft" step re-fetches from the source rather than trusting the previewed payload round-tripped through the browser — a deliberate choice: the server is always the one deciding what actually gets persisted, not the client.

## 4. Frontend

The Admin console's **Import Questions** tab (`apps/frontend/src/pages/AdminPage.tsx`) is a thin client over the two endpoints above: pick a platform, enter a slug, **Preview** (calls with `save: false`), review the fetched statement, then **Save as Draft** (calls again with `save: true`). It deliberately doesn't call `fetch-category` from the UI yet — the endpoint exists and is tested, but a bulk-import review UI (letting an admin pick which of N fetched questions to keep) is a natural follow-up rather than something built speculatively ahead of a need.

## 5. What This Does Not Do

- It does not generate solutions, test cases, or MCQ options — an ingested question is a `DRAFT` with a statement and metadata only.
- It does not deduplicate against the existing question bank the way the generation pipeline does (see [`vector-deduplication.md`](../database/vector-deduplication.md)) — nothing currently stops the same LeetCode problem from being ingested twice. Wiring `checkDuplicate` into `persistAsDraft` is a small, scoped addition if that becomes a real problem.
- It respects LeetCode's rate limits by design (2s delay between requests) but is still hitting an unofficial API — treat it as best-effort, not an SLA-backed integration.
