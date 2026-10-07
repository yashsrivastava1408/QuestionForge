# Security Architecture

What protects a Question Forge deployment, where each control lives in the code, and what is still open. Every control listed here is exercised by a test (see [testing.md](../operations/testing.md)).

---

## 1. Tenancy

Every row that matters carries an `organizationId`, and every query filters on the `organizationId` inside the caller's verified JWT — never on anything the client sends.

- Reading or changing a question, paper, export, webhook config, LLM key or generation job from another organization returns **404**.
- A `paperId` or question id from another organization is rejected, not silently accepted.
- Generation status and its SSE stream are looked up by `(jobId, organizationId)`.

## 2. Authentication

| Control | Detail |
|---|---|
| Login | `POST /api/auth/login` — bcrypt check, returns a 24 h JWT carrying `userId`, `role`, `organizationId` and a unique `jti`. |
| Same error for every failure | Wrong password, unknown user and unknown organization all return `401 Invalid credentials`, so the endpoint cannot be used to discover tenants. |
| Logout | The `jti` is written to Redis with a TTL equal to the token's remaining life; `authenticate` rejects revoked tokens. |
| Change password | `POST /api/auth/change-password` needs the current password. Every other session of that user is signed out; the caller gets a fresh token. |
| Admin password reset | `POST /api/admin/users/:id/reset-password` sets a new password and signs the user out everywhere. |
| Deactivate a user | `PATCH /api/admin/users/:id/status`. Takes effect **immediately** — the user's existing tokens stop working, they cannot log in, and the login error is the same as for a wrong password. Reversible. |
| Role changes | The role lives inside the JWT, so changing a role retires that user's existing tokens; the new role applies from their next login. |
| Last admin | An organization's only active admin cannot be demoted or deactivated, and no admin can deactivate themselves. |
| **No public sign-up** | `POST /api/auth/register` requires an authenticated **ADMIN** and always creates the user in the admin's own organization. The first admin comes from `npm run db:seed`. |
| Scoped tokens | A JWT with a `scope` claim (the Bull Board session) is refused by the API. |

**How "sign out everywhere" works.** A per-user marker in Redis (`user:tokens-valid-after:<id>`) holds a timestamp. `authenticate` reads it in the same round-trip as the logout check and rejects any token issued before it. The marker lives a little longer than a token's 24-hour life, after which every older token has expired anyway.

> **Fixed:** registration used to be an open endpoint that accepted any organization slug and `role: "ADMIN"`, which let anyone make themselves an administrator of any tenant.

### Development login shortcut

`Authorization: Bearer mock-token` acts as the seeded admin **only** when `ALLOW_MOCK_AUTH=true` and `NODE_ENV` is not `production`. It is off by default. (It used to be on whenever `NODE_ENV` was anything other than `production`, including unset.) The frontend needs `VITE_ALLOW_MOCK_AUTH=true` to use it.

## 3. Roles

| Action | ADMIN | REVIEWER | GENERATOR |
|---|:---:|:---:|:---:|
| Start generation, complete an imported draft | ✅ | — | ✅ |
| Edit, re-validate, approve / reject questions | ✅ | ✅ | — |
| Export papers | ✅ | ✅ | — |
| Users (add, role, deactivate, reset password), audit log, webhooks, LLM keys, queue dashboard, imports | ✅ | — | — |
| Change own password | ✅ | ✅ | ✅ |
| List / read questions and papers, job status | ✅ | ✅ | ✅ |

## 4. Refusing to start insecure (`utils/config.ts`)

`assertSecureConfig()` runs at boot in both the API and the worker. With `NODE_ENV=production` the process **exits** unless:

- `JWT_SECRET` is at least 32 characters and not one of the example values;
- `ENCRYPTION_KEY` is 64 hex characters and not all zeros;
- `ALLOW_MOCK_AUTH` is not `true`;
- `SANDBOX_DRIVER` is not `local`.

### Creating organizations

`POST /api/admin/organizations` is refused unless the caller's email is listed in `SUPERADMIN_EMAILS`. By default the list is empty, so nobody can create a tenant through the API. (Previously any organization's admin could.)

## 5. Secrets at rest (`utils/crypto.ts`)

AES-256-GCM with a fresh 12-byte IV per value, keyed by `ENCRYPTION_KEY`. Stored as `enc:v1:<iv>:<tag>:<ciphertext>`.

| Secret | Notes |
|---|---|
| Webhook signing secret | Shown to the admin once when the webhook is configured; only the ciphertext is stored. |
| Per-organization LLM API keys | `PUT /api/admin/llm-keys`. Write-only: `GET` returns whether a key exists, where it comes from (`org` or `env`) and its last 4 characters — never the key. |

Values written before encryption existed (no `enc:v1:` prefix) are still readable and are re-encrypted the next time they are set. Rotating `ENCRYPTION_KEY` makes stored secrets unreadable; re-enter them afterwards.

**Key lookup order for LLM calls:** the organization's own key, then the server-wide environment key.

## 6. Outbound webhooks

- **SSRF guard** (`utils/urlSafety.ts`): the URL must be `https` (`http` is allowed outside production), carry no credentials, and every address its host resolves to must be public. Loopback, RFC 1918, link-local (including the cloud metadata address `169.254.169.254`), CGNAT, unique-local and IPv4-mapped IPv6 ranges are refused. Checked when the URL is saved **and again before every delivery**.
- Redirects are not followed.
- Each delivery is signed: `X-QuestionForge-Signature: sha256=<HMAC-SHA256 of the raw body>`.
- `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` permits localhost targets for development; it is ignored in production.

*Known gap:* there is a short window between our DNS check and the lookup `fetch` performs (DNS rebinding). Closing it needs an egress proxy or an HTTP agent pinned to the checked IP.

## 7. Queue dashboard (Bull Board)

A browser tab cannot send an `Authorization` header, and the previous design put the login JWT in the URL (`/admin/queues?token=…`), where it ends up in access logs and browser history. Now:

1. The admin console calls `POST /api/admin/queues/ticket` (normal bearer auth) and gets a random ticket stored in Redis for 60 seconds.
2. The browser opens `/admin/queues?ticket=…`. The ticket is consumed atomically (`GETDEL`), so it works once.
3. The server sets an `HttpOnly`, `SameSite=Strict` cookie scoped to `/admin/queues` holding a 1-hour JWT with `scope: "bullboard"`, and redirects to the clean URL.

That cookie opens the dashboard only; the API rejects it.

## 8. Input handling

- **Zod on every body.** Invalid input returns `400` with the offending fields. (It used to surface as a 500.)
- **Mass assignment:** `PATCH /api/questions/:id` uses a strict allow-list; `status`, `organizationId`, `validationResult` and anything else unknown is rejected.
- **Edits cannot bypass validation:** changing a question's statement, answer, options, solutions, test cases or difficulty sets it back to `VALIDATING` and queues a re-validation. It cannot be approved until it passes again.
- **PDF export:** all question content is HTML-escaped before it reaches Puppeteer; the template loads nothing from the network.
- **Error responses:** in production, only messages written for the client (4xx `AppError`s) are returned; everything else is "An internal server error occurred".

## 9. LLM-written code

Generated solutions are untrusted code. They run in the Piston container on a network with no route to the database — see [sandboxed-execution.md](../architecture/sandboxed-execution.md). SQL drafts are screened for sqlite dot-commands and file/extension access before they run.

## 10. Exports

- With S3: uploaded and served through a presigned URL (default 300 s).
- Without S3 (`EXPORT_STORAGE=local`): written to `EXPORT_LOCAL_DIR` and served at `/api/export/download/<64-hex token>` until `expiresAt`. The random token is the credential, exactly like a presigned URL. Tokens are matched against the database, and the file name is server-generated.

## 11. Rate limiting

Redis-backed, shared across replicas: a global limit per client address (`RATE_LIMIT_MAX_REQUESTS` per `RATE_LIMIT_WINDOW_MS`) and a stricter one on starting or retrying generation, counted **per signed-in user** (`GENERATE_RATE_LIMIT_PER_MIN`).

## 12. Not done

| Item | Status |
|---|---|
| SSO (SAML / OIDC) | Not implemented. The `ssoProvider` / `ssoId` columns exist; nothing uses them. |
| Token in `localStorage` | The SPA keeps the JWT in `localStorage`, so an XSS bug in the frontend could read it. Moving to an `HttpOnly` cookie session would remove that. |
| Content-Security-Policy | Helmet's CSP is disabled on the API. |
| DNS-rebinding-proof webhooks | See §6. |
| Self-service password reset | There is no "forgot password" email flow. A locked-out user needs an admin to reset their password. |
| Password policy | Minimum 8 characters; no complexity rules, breach check or lockout after repeated failures. |
| Imported content rights | Statements imported from LeetCode / GeeksforGeeks belong to those platforms. The app warns; it cannot check your licence. |
