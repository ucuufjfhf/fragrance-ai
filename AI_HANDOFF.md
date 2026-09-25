# AI_HANDOFF.md — Fragrance AI

> Handoff for AI coding agents.
>
> **Current verified state: 2026-09-24 — PRODUCTION DEPLOYED**
>
> Repository root:
>
> `C:\Users\Admin\fragrance-ai`
>
> Production URL: **https://fiage.netlify.app** (deploy `6ab4b1e7eff8ea05cf01667a`,
> smoke-tested 2026-09-24 — see §16B.5).
>
> This document describes the current repository state through **Phase 16B**
> (post-Phase-12.5 hardening + first production deployment).
> It is intended to let another coding agent continue the project without
> reconstructing the entire history from scratch.
>
> The repository contains intentional uncommitted work. Do not reset, clean,
> discard, stage, or commit changes unless the user explicitly requests it.

---

# 1. Project Overview

**Fragrance AI — «عطر خودتو پیدا کن ✨»** is a B2B SaaS / embeddable,
AI-assisted perfume recommendation system for perfume e-commerce stores,
initially targeting Iranian/Persian-language merchants.

Core customer flow:

```text
Merchant Website
      ↓
Persian RTL Quiz
      ↓
10-question Personality-style Quiz
      ↓
Deterministic Personality Vector
      ↓
Fragrance Profile
      ↓
Merchant Inventory Filtering
      ↓
Deterministic Matching Engine
      ↓
Top 3–5 Recommendations
      ↓
Optional AI-generated Persian Explanation
      ↓
Merchant Product Link
```

The quiz is personality-test-style UX.

It is **not a scientifically validated psychological test** and must never be
presented as psychological diagnosis.

---

# 2. Non-Negotiable Product Principles

These rules apply to all future development.

## 2.1 Deterministic recommendation

The LLM must never:

* select perfumes
* rank perfumes
* calculate recommendation scores
* modify recommendation scores
* decide eligibility
* override inventory rules

The recommendation engine is deterministic:

```text
Quiz Answers
    ↓
Personality Vector
    ↓
Fragrance Profile
    ↓
Inventory Filtering
    ↓
Deterministic Scoring
    ↓
Ranking
```

AI only operates after deterministic recommendation.

AI may:

* enrich fragrance profile descriptors
* generate concise Persian recommendation explanations

If the AI provider is unavailable, recommendations must continue to work.

---

## 2.2 Inventory correctness

Recommendations must come from the merchant's actual inventory.

The matching path must exclude:

* products belonging to another store
* inactive products
* out-of-stock products
* products without a valid usable fragrance profile

Out-of-stock products must never be recommended.

---

## 2.3 Provider independence

The application uses a provider abstraction.

Vendor-specific implementation belongs under:

```text
lib/ai/
```

The rest of the application must depend on the provider abstraction rather than
directly coupling business logic to Qwen, GapGPT, or another vendor.

The current provider is Qwen 3.6 through GapGPT's OpenAI-compatible API.

A future provider replacement must not require rewriting the recommendation engine.

---

## 2.4 Server/client separation

Database access and AI credentials remain server-side.

Never expose:

* `DATABASE_URL`
* `QWEN_API_KEY`
* provider credentials
* Prisma client
* raw inventory data

to browser/client components.

Client components may interact with server actions or safe APIs, but they must
not directly access Prisma or AI credentials.

---

# 3. Current Phase Status

The following phases/checkpoints have been verified as complete:

| Phase   | Scope                                            | Status        |
| ------- | ------------------------------------------------ | ------------- |
| 0       | Environment / project bootstrap                  | ✅ Complete    |
| 1       | Personality quiz engine                          | ✅ Complete    |
| 2       | Database / Prisma / Supabase                     | ✅ Complete    |
| 3       | Deterministic matching engine                    | ✅ Complete    |
| 4       | AI provider abstraction + Qwen                   | ✅ Complete    |
| 5       | Results UI                                       | ✅ Complete    |
| 5A / 6A | Admin product management                         | ✅ Complete    |
| 6B      | CSV product import                               | ✅ Complete    |
| 7       | Analytics                                        | ✅ Complete    |
| 8       | Embeddable widget                                | ✅ Complete    |
| 9       | Standalone quiz store attribution                | ✅ Complete    |
| 9.5     | Supporting verification/documentation checkpoint | ✅ Complete    |
| 11      | AI-assisted fragrance profiling                  | ✅ Complete    |
| 12.1    | Bulk profiling contract/helpers                  | ✅ Complete    |
| 12.2    | Bulk profiling schema/migration                  | ✅ Complete    |
| 12.3    | Bulk job service / atomic claiming               | ✅ Complete    |
| 12.4    | Bulk AI execution / retry handling               | ✅ Complete    |
| 12.5    | Server integration + Admin UI                    | ✅ Complete    |
| 16A     | Pre-deployment hardening (store provisioning + admin access gate)| ✅ Complete |
| 16B     | Production deployment + smoke testing (Netlify)  | ✅ Complete    |
| 12.6+   | Future bulk profiling work                       | ⏳ Not started |
| 10      | First real customer                              | ⏳ Not started |

**Important:** Phase 10 is a business milestone and has not been started.

**Important:** Phase 12.6 has not been defined/approved as an implementation task.
Do not invent or start Phase 12.6 without explicit user approval.

---

# 4. Current Development State

The latest completed implementation is **Phase 16B — Production Deployment +
Smoke Testing** (2026-09-24). The site is LIVE at https://fiage.netlify.app.

The previously completed implementation phase was **Phase 12.5 — Server
Integration + Admin UI**, which connected the bulk AI profiling engine to the
Admin product workflow.

The current architecture is:

```text
Admin Product List
      ↓
Select Perfumes
      ↓
Create BulkProfileJob
      ↓
Start Job
      ↓
Process One Chunk
      ↓
AI calls outside DB transactions
      ↓
Persist item result
      ↓
Return progress
      ↓
Admin UI triggers next chunk
      ↓
Repeat
      ↓
Completed / Completed With Errors / Paused
```

There is no permanent server-side worker loop.

The browser/admin UI triggers subsequent chunks.

The database remains the source of truth.

If the browser closes or the server restarts, stale RUNNING items can be
reclaimed using the existing heartbeat/recovery mechanism.

---

# 5. Technology Stack

Current stack:

* Windows 10
* Node.js 24.21.0
* npm 11.19.0
* Next.js 16.3.5 (production build: Webpack — `next build --webpack`; Turbopack kept via `build:turbo` for local use)
* React 19.2.8
* TypeScript 5.9.3 strict
* Tailwind CSS 4.3.3
* Prisma 7.10.0
* `@prisma/adapter-pg`
* `pg`
* PostgreSQL / Supabase
* Vitest 5.0.1
* ESLint 9 flat config
* tsx 4
* Qwen 3.6 through GapGPT OpenAI-compatible API
* Netlify (production host; Node Functions only, zero Edge Functions)

Do not introduce unnecessary dependencies.

---

# 6. Prisma 7 / Database Conventions

Do not "upgrade" or rewrite the Prisma setup into an older style.

Current configuration:

```text
prisma.config.ts
prisma/schema.prisma
lib/db.ts
lib/generated/prisma/
```

Prisma 7 uses:

* `prisma.config.ts`
* schema without datasource URL
* generated client output at:

```text
lib/generated/prisma
```

Runtime database access uses:

```text
lib/db.ts
```

with `PrismaPg`.

The generated client is git-ignored and must be regenerated after schema changes
or fresh setup.

---

## 6.1 Supabase migration limitation

`prisma migrate dev` is not usable against the current Supabase Session Pooler
because it requires a shadow database and the pooler rejects the required
database creation.

The established migration workflow is:

```text
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
```

then create the migration directory/SQL and deploy with:

```text
npx prisma migrate deploy
npx prisma migrate status
```

Do not switch the project to `prisma migrate dev` unless the database setup
explicitly changes.

Do not use `prisma db pull` to construct the application schema.

---

# 7. Deterministic Matching Engine

The matching engine is one of the most protected parts of the application.

Canonical dimensions:

```text
social
adventurous
expressive
mysterious
fresh
warm
experimental
elegant
bold
```

The canonical list is:

```text
MATCHING_DIMENSIONS
```

from:

```text
lib/fragrance/profile.ts
```

Do not re-declare this list elsewhere.

The Phase 1 scoring system remains the source of truth.

The matching score uses Euclidean distance across the nine dimensions.

Conceptually:

```text
distance = sqrt(Σ(userDimension - perfumeDimension)^2)

MAX_DISTANCE = 300

similarity =
  clamp(100 × (1 - distance / 300), 0, 100)
```

Exact match = 100.

Maximum possible distance = 0 similarity.

Ranking:

1. descending raw score
2. tie-break by ascending `perfumeId`

The engine returns:

* raw score for ranking
* presentation score rounded exactly once for display

The engine is deterministic and must not depend on:

* AI
* network
* clock
* randomness

---

# 8. Matching Inventory Rules

The current repository/engine path verifies:

```text
storeId
active === true
inStock === true
valid fragrance profile
```

Out-of-stock products are excluded even if they would otherwise rank highly.

Store isolation is enforced both:

1. at the database query/repository boundary
2. again in the pure matching engine

Never weaken store isolation.

Budget, season, and occasion are available data fields but should only be
introduced as matching/filtering behavior when an explicitly approved phase
requires them.

---

# 9. Personality Quiz

Phase 1 is complete.

The quiz contains approximately 10 questions with deterministic answer scoring.

Nine dimensions:

```text
social
adventurous
expressive
mysterious
fresh
warm
experimental
elegant
bold
```

Values normalize to:

```text
0–100
```

The system also calculates a primary fragrance/personality archetype.

The archetype is UX/context only.

The complete numerical profile drives recommendation matching.

Do not turn the archetype into the sole matching mechanism.

The customer experience is Persian RTL and mobile-first.

---

# 10. AI Architecture

AI provider abstraction lives under:

```text
lib/ai/
```

Important files include:

```text
lib/ai/provider.ts
lib/ai/qwen.ts
lib/ai/errors.ts
lib/ai/perfume-profile.ts
lib/ai/explanation.ts
```

Vendor-specific code belongs in `qwen.ts`.

The application uses an abstraction such as:

```text
AIProvider
```

and structured:

```text
AiOutcome<T>
```

results.

AI failures are represented as data rather than forcing every caller to
depend on exceptions.

---

## 10.1 Current Qwen / GapGPT configuration

Current provider:

```text
AI_PROVIDER=qwen
QWEN_BASE_URL=https://api.gapgpt.app/v1
QWEN_MODEL=gapgpt-qwen-3.6
QWEN_TIMEOUT_MS=15000
```

The real API path was live-verified on 2026-09-23.

Verified:

```text
GET /v1/models → HTTP 200
gapgpt-qwen-3.6 present
```

A real perfume-profile enrichment call through the provider abstraction also
succeeded and returned valid structured descriptors.

Never print the actual `QWEN_API_KEY`.

---

## 10.2 AI-writable dimensions

AI may write descriptor dimensions such as:

```text
sweet
woody
spicy
floral
citrus
aquatic
smoky
clean
projection
longevity
```

The nine matching dimensions are protected and are never AI-writable.

A provider response attempting to modify a matching dimension must be rejected.

AI output is validated both inside the provider and again in domain helpers.

---

# 11. AI Explanation Layer

AI explanations are generated only after deterministic recommendation.

The flow is:

```text
Deterministic ranking
      ↓
Selected perfume
      ↓
Structured profile + factual information
      ↓
AI explanation
```

The AI explanation:

* is Persian
* is concise
* must not invent facts
* must not contain fabricated product information
* must not modify the recommendation
* must not change the ranking
* must not be required for the recommendation to function

If AI is unavailable, the result page still renders the deterministic
recommendations.

---

# 12. AI-Assisted Single Perfume Profiling

Phase 11 is complete.

Admin can request an AI-generated fragrance profile.

Important behavior:

```text
Admin
 ↓
Generate profile
 ↓
AI provider
 ↓
Validated structured suggestion
 ↓
Admin reviews
 ↓
Normal save action
```

Generation itself does not automatically persist the profile.

The admin reviews the generated descriptors and then saves them through the
normal product/profile workflow.

AI does not touch the nine matching axes.

---

# 13. CSV Import

Phase 6B is complete.

Current workflow:

```text
CSV upload
 ↓
RFC-4180 parsing
 ↓
Header validation
 ↓
Row validation
 ↓
Preview
 ↓
Explicit confirmation
 ↓
Atomic database transaction
 ↓
Success
```

Important behavior:

* maximum file size: 5 MB
* maximum data rows: 5,000
* malformed CSV rejected
* unknown/duplicate/missing headers rejected
* `storeId` cannot be supplied by the CSV
* selected store determines ownership
* duplicate slugs are rejected
* existing perfumes are not updated
* confirm re-validates the raw CSV
* commit-time slug checks protect against races
* import is all-or-nothing
* no automatic AI profiling happens during CSV import

AI profiling after CSV import is an explicit follow-up action.

---

# 14. Bulk AI Profiling — Phase 12

The bulk system is database-backed.

No Redis, external queue, worker, WebSocket, or permanent server loop is used.

The core models are:

```text
BulkProfileJob
BulkProfileItem
```

Statuses:

```text
BulkProfileJobStatus:
PENDING
RUNNING
PAUSED_RATE_LIMITED
COMPLETED
COMPLETED_WITH_ERRORS
FAILED
```

Item statuses:

```text
BulkProfileItemStatus:
PENDING
RUNNING
SUCCEEDED
FAILED
SKIPPED
```

---

## 14.1 Phase 12.1

Complete.

Implemented:

```text
lib/admin/bulk/contract.ts
lib/admin/bulk/helpers.ts
```

Important constants include:

```text
AI_BULK_MAX_ITEMS = 500
BULK_AI_CONCURRENCY = 1
BULK_AI_CHUNK_SIZE = 10
BULK_AI_MAX_ATTEMPTS = 2
BULK_AI_CHUNK_TIME_BUDGET_MS = 120000
BULK_AI_STALE_HEARTBEAT_MS = 120000
BULK_AI_BACKOFF_BASE_MS = 2000
BULK_AI_BACKOFF_FACTOR = 4
BULK_AI_BACKOFF_MAX_MS = 60000
```

Retryable errors include:

```text
timeout
http_429
http_5xx
```

---

## 14.2 Phase 12.2

Complete.

Prisma models and enums were added for bulk profiling.

Migration:

```text
20260922_phase12_bulk_profile_jobs
```

No `aiEnrichedAt` field was added.

The schema does not use a separate enrichment timestamp for bulk profiling.

---

## 14.3 Phase 12.3

Complete.

Core service:

```text
lib/admin/bulk/service.ts
```

Implemented:

* job creation
* atomic item claiming
* heartbeats
* stale-item reclaim
* terminal state transitions
* exactly-once counters
* retry preparation
* job lifecycle
* completion derived from live item state
* store isolation

Atomic claiming uses conditional database updates and verifies the affected
row count.

Race conditions were explicitly tested.

AI/network calls do not belong in this service.

---

# 15. Phase 12.4 — Bulk AI Execution

Phase 12.4 is **COMPLETE**.

Implementation includes:

```text
lib/admin/bulk/processor.ts
```

The processor orchestrates:

```text
claim
 ↓
heartbeat
 ↓
AI request
 ↓
validate result
 ↓
persist success/failure
```

AI calls happen outside database transactions.

Per-item persistence uses small database transactions.

Concurrency remains:

```text
1
```

Chunk size remains:

```text
10
```

Chunk time budget:

```text
120 seconds
```

---

## 15.1 Retry behavior

Retryable errors:

* timeout
* HTTP 429
* HTTP 5xx

Maximum attempts:

```text
2
```

Backoff uses the established contract.

429 responses may provide `Retry-After`.

`Retry-After` is honored and takes precedence over normal backoff when
appropriate.

The processor never sleeps beyond the chunk deadline.

Two consecutive 429 responses cause a rate-limit pause.

The consecutive-429 counter is intentionally in-memory for the current chunk;
it does not require another schema field.

A success or non-429 failure resets the consecutive-429 sequence.

---

## 15.2 Non-retryable errors

Errors such as:

```text
invalid_output
http_other
unavailable
```

fail the item without retry according to the existing contract.

Stored error messages use controlled diagnostics rather than leaking raw
provider responses.

---

## 15.3 Stale item recovery

RUNNING items carry heartbeat information.

Stale RUNNING items can be reclaimed.

Stale reclaim does not incorrectly consume an additional attempt.

This protects against:

* browser closure
* server restart
* interrupted chunk processing

---

## 15.4 Fill-only profile semantics

Bulk AI profiling is intentionally conservative.

AI may fill:

* descriptor values
* family
* notes

It must not overwrite protected matching dimensions.

Existing merchant-provided non-zero descriptor values are preserved.

Existing non-empty family/notes are preserved.

New profiles can initialize required protected dimensions appropriately, but AI
never becomes the source of truth for the nine matching axes.

---

# 16. Phase 12.5 — Server Integration + Admin UI

Phase 12.5 is **COMPLETE** (implemented and verified 2026-09-23; an earlier
handoff revision falsely claimed completion before the integration existed —
the audit caught it, and this section now describes the real implementation).

This phase connected the bulk engine to the Admin interface.

The implemented architecture is:

```text
Admin Product List
      ↓
Select perfumes
      ↓
Create bulk profiling job
      ↓
Start job
      ↓
Process one chunk
      ↓
Return current progress
      ↓
UI requests next chunk
      ↓
Repeat
```

The implementation uses thin server-action adapters over the existing bulk
service/processor (no lifecycle logic is duplicated).

The browser does not call the AI provider directly.

Implementation files:

```text
app/admin/perfumes/bulk-actions.ts   (server actions — thin adapters)
components/admin/BulkProfilingPanel.tsx (client UI: selection/job/progress)
lib/admin/bulk/ui.ts                 (pure UI presentation model)
lib/admin/bulk/service.ts            (12.5 additions: failed-item list,
                                      batch retry, latest-open-job read)
```

Server actions (all store-isolated through the service; Persian feedback):

```text
createBulkJobAction            create job from selection (max enforced, no AI)
startBulkJobAction             start / resume (PAUSED_RATE_LIMITED → RUNNING)
processBulkChunkAction         one bounded chunk, returns serializable snapshot
getBulkJobProgressAction       DB-backed progress + safe failed-item views
pauseBulkJobAction             manual pause (RUNNING → PAUSED_RATE_LIMITED)
retryBulkFailedItemsAction     batch FAILED → PENDING
getOpenBulkJobForStoreAction   newest open job (restore after reload)
```

UI behavior (`BulkProfilingPanel`):

* per-product checkboxes + select-all + count/`AI_BULK_MAX_ITEMS` indicator;
* explicit «AI پروفایل‌سازی» start — never automatic;
* browser-driven chunk loop (one in-flight request per UI instance via a
  ref guard; stall guard stops after repeated zero-progress chunks);
* progress (status label, percentage, succeeded/failed/skipped/remaining)
  always rendered from the returned DB snapshots — no fake progress;
* pause / resume through the service state machine;
* failed-item list with safe Persian messages + «تلاش مجدد» batch retry;
* in-flight job restored from the DB after a page reload.

---

## 16.1 Admin capabilities

The Admin workflow now supports the bulk profiling lifecycle required by
Phase 12.5, including the appropriate actions for:

* creating a bulk job
* starting a job
* processing a chunk
* retrieving progress
* pausing
* resuming
* retrying failed items

The implementation remains store-isolated.

The Admin UI is intentionally minimal.

This phase did **not** attempt a full visual redesign.

---

## 16.2 Chunk progression

The server does not run a permanent loop.

A request processes a bounded chunk.

The Admin UI can trigger the next chunk after receiving the previous result.

This keeps the system simple and compatible with the current MVP architecture.

Overlapping chunk processing must not corrupt job state because item claiming
is atomic and the database remains the source of truth.

---

## 16.3 CSV relationship

CSV import remains:

```text
CSV import
 ↓
products created
 ↓
optional explicit AI profiling
```

AI profiling is not silently triggered by CSV confirmation.

This separation is intentional.

---

# 16A. Pre-Deployment Hardening — Store Provisioning + Admin Access

Implemented after the MVP gap audit (2026-09-23). Minimal operational layer,
NOT an authentication system: no accounts, roles, sessions or billing.

## 16A.1 Store provisioning (operator-only)

Stores are created by the operator through a server-side script — there is
deliberately no self-service onboarding UI:

```text
npx tsx scripts/create-store.ts --name "نام فروشگاه" --slug my-shop \
  [--website-url https://...] [--logo-url https://...]
```

* validation + slug normalization: `lib/admin/store-provisioning.ts` (pure);
* the id comes from the existing Prisma `@default(cuid())`;
* duplicate slugs are rejected by the DB unique constraint (P2002 → clear
  Persian message); reruns never create duplicates; the script never deletes;
* success prints the store id (used by `/admin/perfumes?store=…` and the
  widget `data-store-id`) — live-verified end to end.

## 16A.2 Admin access gate (fail-closed shared secret)

* `ADMIN_ACCESS_SECRET` (server-side env only) protects every `/admin/*`
  route through SERVER-SIDE guards (`lib/admin/server-access.ts`):
  every admin page calls `requireAdmin(next?)` and every privileged admin
  server action calls `requireAdminAction()` as its first operation
  (`/admin/access` and its unlock action stay public by design).
  This replaced the former `proxy.ts` middleware gate, which was REMOVED
  (2026-09-24) after it blocked Netlify Edge Functions bundling — see §16B.1.
* `/admin/access` is the only reachable admin path: a Persian password page
  (`app/admin/access/page.tsx` + `actions.ts`).
* The browser NEVER receives the secret: the unlock action compares
  SHA-256(submitted) with SHA-256(secret) and sets an httpOnly cookie
  carrying only the HASH. Rotating the secret instantly invalidates old
  cookies (hash no longer matches).
* FAIL-CLOSED: with the env var missing/empty, no admin route and no admin
  server action is usable — the gate page explains the configuration
  problem. Local dev sets a value in the git-ignored `.env`.
* Pure decision logic lives in `lib/admin/access.ts` (edge-safe: Web Crypto
  only, no Prisma); the Next.js server plumbing (cookies/redirect) lives in
  `lib/admin/server-access.ts` (Node runtime only).
* Tests: `tests/admin/access.test.ts` (pure helpers) and
  `tests/admin/server-access.test.ts` (14 tests: gate decision incl. secret
  rotation, page-guard redirect with safe `next`, action-guard ordering).
* Store isolation untouched: the gate only decides reachability; every
  existing per-store ownership check in the services is unchanged.

Tests: `tests/admin/access.test.ts` (16),
`tests/admin/store-provisioning.test.ts` (8),
`tests/admin/store-provisioning.live.test.ts` (3, live-DB round-trip with
self-cleanup).

---

# 16B. Production Deployment — Netlify (COMPLETE, smoke-tested 2026-09-24)

The production deployment target is **Netlify** and the deployment is
**COMPLETE AND VERIFIED**. Production URL:

```text
https://fiage.netlify.app
```

Site: `fiage` (siteId `1f00a6f8-f7e7-4f99-8b40-395b08cfa039`); final deploy
`6ab4b1e7eff8ea05cf01667a`. Project visibility was switched from Netlify's
new-project default (private) to **public** during Phase 16B.

## 16B.1 Compatibility & architecture (verified by the actual deployment)

* Netlify serves the app via its auto-installed OpenNext adapter
  (@netlify/plugin-nextjs 5.16.0); App Router, SSR, RSC, Server Actions and
  Route Handlers all work in production (all smoke-tested live).
* The project generates **ZERO Edge Functions**: `npx netlify build` packages
  only `___netlify-server-handler` (a Node Function). No middleware exists in
  the app, so no `___netlify-edge-handler-node-middleware` is emitted.
* **HISTORICAL (resolved, not current architecture):** the original admin gate
  was a Next 16 `proxy.ts` middleware. A 2026-09-23 deployment attempt failed
  at Edge Functions bundling (`___netlify-edge-handler-node-middleware` could
  not compile `.next/server/middleware.js`: missing
  `./chunks/[turbopack]_runtime.js`). The middleware was removed (2026-09-24)
  and admin auth moved server-side (§16A.2). The even older claim that
  `proxy.ts` was Netlify-compatible was WRONG.
* **Production build uses Webpack (`next build --webpack`), NOT Turbopack.**
  Root cause (verified 2026-09-24): Turbopack's output-file-tracing on
  Windows created SYMLINKS inside the staged function bundle
  (`.next/node_modules/@prisma/client-<hash>` → `node_modules/@prisma/client`,
  same for `pg`); the deploy zip preserved the broken symlink targets, which
  do not exist on Linux Lambda — every DB-touching route 500'd with
  `Cannot find module '@prisma/client-.../runtime/client'`. Webpack's tracing
  copies real files; the build was switched to
  `next build --webpack` and a `build:turbo` script keeps the Turbopack
  capability available for local use only. **DO NOT revert the Webpack
  production build.**
* No `runtime = "edge"` declarations; no Vercel APIs/env; no Node builtins in
  deployed app code; no runtime filesystem assumptions.
* Prisma 7 uses the driver-adapter client (no native engine binaries) — no
  serverless binary-target issues; `pg` runs in the Node function and is
  traced into the bundle.
* **`postinstall: prisma generate`** in `package.json` is REQUIRED (the
  generated client `lib/generated/prisma` is git-ignored) and already present.
* **`netlify.toml` is NOT required** and was deliberately NOT created
  (auto-detection + auto-installed adapter cover everything; the CLI-generated
  `.netlify/` folder is git-ignored).

## 16B.2 Runtime fixes applied

* `lib/db.ts` caps the per-instance pg pool (`max: PG_POOL_MAX ?? 5`): on
  serverless hosts every warm function instance opens up to that many Supabase
  pooler connections, and the pg default of 10 can exhaust the Session Pooler
  under concurrency. Override with `PG_POOL_MAX` when scaling deliberately.
* Production build uses Webpack (see §16B.1 for the Turbopack symlink issue).

## 16B.3 Environment variables (names only — never commit real values)

```text
Required:  DATABASE_URL            Supabase Session Pooler string (sslmode=require)
           ADMIN_ACCESS_SECRET     admin gate secret (fail-closed when unset)
           NEXT_PUBLIC_APP_URL     public origin for the widget snippet
           AI_PROVIDER             qwen
           QWEN_API_KEY            server-side only; graceful fallback if absent
           QWEN_BASE_URL           e.g. https://api.gapgpt.app/v1
           QWEN_MODEL              gapgpt-qwen-3.6
Optional:  QWEN_TIMEOUT_MS         default 15000
           PG_POOL_MAX             default 5 (see 16B.2)
```

`.env.example` documents all of them with placeholders. Never import `.env`
into Git; never expose server-only variables through `NEXT_PUBLIC_*`.

## 16B.4 Database migration strategy

Production migrations use **`npx prisma migrate deploy`** — verified working
against the existing Supabase Session Pooler (idempotent: no-op when current).
`prisma migrate dev` remains unusable against the pooler (§6.1). Run as a
release step after any committed migration; the current production schema is
already up to date.

## 16B.5 Deployment status & smoke-test results

```text
Status: DEPLOYED & VERIFIED (2026-09-24)
Production URL: https://fiage.netlify.app
Final deploy:   6ab4b1e7eff8ea05cf01667a
Netlify env vars: POPULATED and verified (values never documented)
Database (Supabase Session Pooler): working in production
AI (Qwen/GapGPT): working in production (aiAvailable: true on /api/widget/recommend)
Project visibility: PUBLIC
```

Redeploying from the local working directory (intentionally dirty Git state,
no commit needed):

```text
npx netlify deploy --build --prod
```

If function-bundle caching ever produces a stale bundle, add
`--skip-functions-cache`.

Production smoke-test results (2026-09-24, all performed against the live site):

```text
PUBLIC
  Homepage (/) ............................ PASS (Persian RTL renders)
  10-question Persian RTL quiz (/quiz) .... PASS (start → answer → complete, in-browser)
  Result flow (/result) ................... PASS (profile + recommendations)
  Deterministic profile generation ........ PASS (archetype + 9-axis Persian percentages)
  Recommendations ......................... PASS (match %, ranks)
  AI Persian explanations ................. PASS (Qwen/GapGPT live)
  Merchant product links .................. PASS (per-merchant URLs)
  /widget (with ?store=…) ................. PASS (quiz UI; graceful no-store state)
  /widget.js loader ....................... PASS (serves, reads data-store-id)
  Widget CORS ............................. PASS (preflight 204; reflected origin)
  Public API validation ................... PASS (400s on invalid input; no admin redirect)

ADMIN
  /admin/access ........................... PASS (200 unauthenticated, form present)
  Unauthenticated protected-route redirect  PASS (→ /admin/access?next=/admin/perfumes)
  Wrong-password rejection ................ PASS (Persian error, no cookie)
  Correct authentication .................. PASS (unlock → /admin/perfumes)
  httpOnly admin cookie ................... PASS
  Product list ............................ PASS (100 perfumes, store-scoped)
  Stock toggle persistence ................ PASS (DB round-trip; state survives re-fetch)
  CSV import page ......................... PASS
  Analytics page .......................... PASS (renders; "no data yet" is expected)

SECURITY
  Client static-file scan (45 files) ...... PASS — zero occurrences of
    ADMIN_ACCESS_SECRET / QWEN_API_KEY / DATABASE_URL / ADMIN_ACCESS_COOKIE
    and no secret values.
```

For future schema changes the release step remains
`npx prisma migrate deploy` (§16B.4); nothing to run today.

---

# 17. Phase 7 — Analytics

Phase 7 is complete.

Implemented:

```text
AnalyticsEvent
lib/analytics/
app/api/events/route.ts
app/admin/analytics/
```

Tracked events include:

```text
quiz_started
quiz_completed
recommendation_viewed
recommendation_clicked
product_clicked
```

Analytics are anonymous and do not collect unnecessary personal information.

Analytics failures must never break the customer experience.

---

# 18. Phase 8 — Embeddable Widget

Phase 8 is complete.

Merchant integration uses:

```html
<script
  src="https://YOUR-DOMAIN.com/widget.js"
  data-store-id="STORE_ID">
</script>
```

The loader:

* validates the store identifier
* prevents duplicate mounting
* derives its own base URL
* mounts an iframe
* uses postMessage for resizing

The iframe provides the CSS isolation boundary.

The widget reuses the actual quiz flow and deterministic recommendation engine.

The browser never performs recommendation scoring.

---

# 19. Phase 9 — Store Attribution

Phase 9 is complete.

Standalone quiz traffic can use:

```text
/quiz?store=<storeId>
```

The store identifier is validated server-side and threaded through the quiz
flow.

Analytics events and result navigation retain the appropriate store context.

A real runtime issue involving `RecommendationCard` and `"use client"` was
found and fixed during browser verification.

---

# 20. Database State

The schema currently contains the original application models plus analytics
and bulk profiling models.

Core models include:

```text
Store
Perfume
FragranceProfile
QuizSession
Recommendation
AnalyticsEvent
BulkProfileJob
BulkProfileItem
```

Important relations include:

```text
Store → Perfume
Perfume → FragranceProfile
QuizSession → Recommendation
BulkProfileJob → BulkProfileItem
BulkProfileItem → Perfume
```

Store isolation is mandatory throughout.

The bulk tables are related to the appropriate store/job/perfume entities.

No `aiEnrichedAt` field was introduced.

---

# 21. Current Validation Status

The latest validation (Phase 16B deploy + smoke test, 2026-09-24) reported:

```text
Tests:       516/516 passing (41 files; +14 server-access gate tests)
Lint:        PASS on changed files (pre-existing warnings unchanged)
TypeScript:  PASS (tsc --noEmit)
Next build:  PASS (webpack; no Proxy/Middleware entry in the route table)
Netlify:     PASS — production deploy 6ab4b1e7eff8ea05cf01667a is LIVE
Production:  PASS — full smoke-test suite green (see §16B.5)
```

Previous Phase 12.5 baseline for reference: 502/502 (40 files).

New Phase 12.5 test suites:

```text
tests/admin/bulk-actions.test.ts   (23 adapter/UI-model tests, mocked engine)
tests/admin/bulk-panel.test.tsx    (5 SSR state-render tests)
```

The repository also contains a known nested Kilo worktree:

```text
.kilo/worktrees/zenith-shape/
```

When linting from the repository, this can cause duplicated raw warning output.

The project-level lint result remains:

```text
0 errors
5 project warnings
```

The additional duplicated warnings originate from the nested Kilo worktree.

Do not delete the nested worktree unless explicitly instructed.

---

# 22. Git State

Known baseline:

```text
HEAD:
8fbc87b74e7dbbd9caf75acfb81df3206200d200
```

Branch:

```text
master
```

Git identity:

```text
majid
majidemoon1@gmail.com
```

Do not assume the working tree is clean.

There is intentional uncommitted work.

Do not:

```text
git reset --hard
git clean
git checkout
git restore
git commit
git add
```

unless the user explicitly requests it.

Do not overwrite or discard existing work merely to make the repository look
clean.

---

# 23. Known Windows Environment Quirks

PowerShell execution policy can block npm/vitest `.ps1` shims.

Use:

```text
cmd /c "cd /d C:\Users\Admin\fragrance-ai && npm ..."
```

when necessary.

Do not change PowerShell execution policy simply to run project commands.

Long-running npm/build commands may require detached execution and polling.

Do not kill unrelated processes without a reason.

---

# 24. Environment Variables

Never print or expose values from `.env`.

Current variable names include:

```text
DATABASE_URL
AI_PROVIDER
QWEN_API_KEY
QWEN_BASE_URL
QWEN_MODEL
QWEN_TIMEOUT_MS
NEXT_PUBLIC_APP_URL
```

Current AI configuration:

```text
AI_PROVIDER=qwen
QWEN_BASE_URL=https://api.gapgpt.app/v1
QWEN_MODEL=gapgpt-qwen-3.6
QWEN_TIMEOUT_MS=15000
```

The actual API key exists locally and must remain secret.

`.env.example` must remain secret-free.

---

# 25. Known Limitations / Deliberate Decisions

These are not bugs unless a future approved phase explicitly changes them.

## Admin authentication

Admin routes ARE protected (Phase 16A): a minimal shared-secret gate
(`ADMIN_ACCESS_SECRET`, server-side env only; fail-closed when unset) enforced
SERVER-SIDE — `requireAdmin()` guards every admin page and
`requireAdminAction()` guards every privileged admin server action
(`lib/admin/server-access.ts`). No middleware is used (proxy.ts was removed;
see §16A.2). It remains deliberately minimal: no accounts, roles or sessions.

Do not add a fake authentication layer or re-introduce middleware without an
approved task.

---

## No delete action

Admin product lifecycle intentionally uses deactivation rather than destructive
delete behavior.

Do not add a delete UI casually.

---

## Budget / season / occasion

These fields exist, but they are not automatically applied as recommendation
filters unless the relevant phase explicitly implements them.

---

## AI explanations

AI explanations can legitimately be absent if validation rejects the generated
text or the provider is unavailable.

That is intentional graceful degradation.

---

## No automatic AI profiling after CSV import

CSV import does not silently invoke AI.

Bulk profiling is an explicit Admin action.

---

# 26. Files Most Relevant to Future Work

Important areas include:

```text
app/
components/
lib/
prisma/
tests/
scripts/
```

Especially:

```text
lib/personality/
lib/fragrance/
lib/matching/
lib/ai/
lib/results/
lib/admin/
lib/admin/csv/
lib/admin/bulk/
lib/admin/server-access.ts (server-side admin gate — replaces the removed proxy.ts)
lib/analytics/
lib/widget/
```

Important application areas:

```text
app/quiz/
app/result/
app/admin/perfumes/
app/admin/analytics/
app/widget/
app/api/
```

Bulk-specific files:

```text
lib/admin/bulk/contract.ts
lib/admin/bulk/helpers.ts
lib/admin/bulk/service.ts
lib/admin/bulk/processor.ts
```

---

# 27. Development Rules for the Next Coding Agent

## Rule 1 — Work phase-by-phase

Only implement the explicitly approved phase.

Do not continue automatically into another phase.

After completing a phase:

1. run validation
2. investigate failures
3. fix root causes
4. re-run validation
5. report the result
6. STOP

Wait for explicit approval before continuing.

---

## Rule 2 — Inspect before changing

Before modifying code:

* inspect the existing implementation
* understand why it exists
* check related tests
* check the phase requirements
* avoid duplicate abstractions

Prefer modifying existing architecture over creating parallel systems.

---

## Rule 3 — Do not overengineer

Do not introduce:

* Redis
* external queues
* background workers
* vector databases
* RAG
* AI agents
* unnecessary microservices
* unnecessary dependencies

unless a future explicitly approved requirement changes this.

---

## Rule 4 — Protect deterministic matching

Never allow an LLM to become responsible for recommendation selection or ranking.

Never modify the canonical nine matching dimensions without explicit approval.

---

## Rule 5 — Protect store isolation

Every merchant-facing and Admin data path must remain store-scoped.

Never trust a store ID supplied by the browser without server-side validation.

---

## Rule 6 — Protect secrets

Never:

* print API keys
* commit API keys
* put credentials into source code
* return credentials to the browser
* include secrets in documentation

---

## Rule 7 — Validate real behavior

Never claim that something works without actually testing it.

Normal gates:

```text
npm test
npm run lint
npm run typecheck
npm run build
```

After schema work:

```text
npx prisma validate
npx prisma migrate status
```

Run additional focused tests/scripts when relevant.

---

## Rule 8 — Fix root causes

If validation fails:

1. read the exact error
2. identify the root cause
3. make the smallest appropriate fix
4. rerun the failing check
5. rerun dependent checks

Do not simply report an error that can reasonably be fixed.

---

## Rule 9 — Documentation

At the end of an approved phase, update:

```text
README.md
AI_HANDOFF.md
```

with the actual verified state.

Do not leave stale phase status or test counts.

---

# 28. Current Next Step

**Phase 16B is COMPLETE: the production deployment is live and smoke-tested**
(§16B.5). There is no pending deployment task.

The next logical area is further bulk profiling work (Phase 12.6+), but
**Phase 12.6 has not yet been defined and approved**.

Therefore:

> **DO NOT IMPLEMENT PHASE 12.6 YET.**

Do not invent requirements for it.

Do not start Phase 10 unless the user explicitly asks to begin the first-real-
customer milestone.

The next coding-agent interaction should determine the exact scope of the next
explicitly approved task.

---

# 29. Handoff Checklist

Before beginning any future implementation, the agent should confirm:

* [ ] Read `README.md`
* [ ] Read `AI_HANDOFF.md`
* [ ] Inspect current Git status
* [ ] Inspect the relevant source code
* [ ] Identify the explicitly approved phase
* [ ] Confirm no future phase is being implemented accidentally
* [ ] Confirm deterministic matching remains untouched unless explicitly required
* [ ] Confirm AI remains provider-agnostic
* [ ] Confirm store isolation
* [ ] Confirm secrets are not exposed
* [ ] Confirm current tests/gates before making risky changes

After the phase:

* [ ] Tests pass
* [ ] Lint passes
* [ ] TypeScript passes
* [ ] Build passes
* [ ] Prisma validation passes if schema changed
* [ ] Documentation updated
* [ ] Git state preserved
* [ ] Final report provided
* [ ] STOP and wait for approval

---

# 30. Final Current-State Summary

As of **2026-09-24**:

```text
Phase 0       ✅
Phase 1       ✅
Phase 2       ✅
Phase 3       ✅
Phase 4       ✅
Phase 5       ✅
Phase 6A      ✅
Phase 6B      ✅
Phase 7       ✅
Phase 8       ✅
Phase 9       ✅
Phase 9.5     ✅
Phase 11      ✅
Phase 12.1    ✅
Phase 12.2    ✅
Phase 12.3    ✅
Phase 12.4    ✅
Phase 12.5    ✅
Phase 16A     ✅
Phase 16B     ✅  (PRODUCTION DEPLOYED: https://fiage.netlify.app)

Phase 12.6+   ⏳ Not started / not approved
Phase 10      ⏳ Not started
```

Current verified test suite:

```text
516/516 passing
41 test files
```

Current AI provider:

```text
Qwen 3.6
via GapGPT OpenAI-compatible API
```

Current bulk architecture:

```text
Database-backed
Concurrency: 1
Chunk size: 10
Max job size: 500
AI outside transactions
Atomic claiming
Heartbeat/recovery
Retry handling
Rate-limit pause
Fill-only semantics
Admin-triggered chunk progression
Thin server-action adapters (bulk-actions.ts)
Minimal admin panel (BulkProfilingPanel.tsx)
```

The project is ready for the next explicitly approved development task.
# Current working-tree changelog — 2026-09-25

This entry records the current working-tree implementation independently of earlier historical handoff sections.

- **Phase 12.6-A — rate limiting:** Implemented process-local fixed-window throttling for widget recommendations, analytics events, quiz submission, and admin unlock. The limiter fails open on internal bookkeeping errors, returns HTTP 429 with `Retry-After`, and has focused tests.
- **Phase 12.6-B — AI cost controls and circuit breaker:** Implemented configurable process-local global/per-store AI request limits and a Qwen provider circuit breaker with `CLOSED`, `OPEN`, and `HALF_OPEN` states, bounded usage state, safe fallback, and tests. This is process-local, not distributed quota state.
- **Phase 12.6-C — observability and health checks:** Implemented request correlation IDs, safe structured server logging, latency context, and `GET /api/health`. Health checks use a bounded read-only Prisma connectivity query and expose coarse database, AI-configuration, and circuit-state status without making a paid Qwen request. Logs remain platform-local; there is no external monitoring or persistent metrics store.
- **Admin access control:** The current gate is a minimal shared-secret access mechanism, not a merchant account system. `lib/admin/access.ts` provides fail-closed secret configuration, an httpOnly hash cookie, and redirect validation; `lib/admin/server-access.ts` guards admin pages and privileged server actions. There are no user accounts, roles, or merchant authentication sessions.
- **Bulk profiling:** The current implementation is database-backed with job/item persistence, atomic claiming, heartbeat/stale recovery, bounded browser-driven processing, retry/pause/resume actions, rate-limit pause handling, and admin progress UI. It is not a background worker or external queue.
- **Store provisioning:** The current operator flow validates store name/slug/URLs and creates stores through `scripts/create-store.ts` with Prisma-generated ids and duplicate-slug protection. It is an operator script, not a merchant-facing account or self-service onboarding flow.
- **Widget CORS:** `lib/widget/cors.ts` centralizes permissive widget API CORS headers for merchant-page embedding.
- **Test stabilization:** The two long-running live-database matching tests G and H now have a local 15,000 ms per-test timeout; no global Vitest timeout was changed. The lint configuration and Git ignore rules exclude generated `.kilo/` and `.netlify/` artifacts.
- **Current validation:** 47 test files, 536 tests passing. Lint reports 0 errors and 5 existing warnings; typecheck and production build pass. These results describe the working tree, not a new deployment.

---



# Current working-tree update — CORS, shared quotas, and admin hardening

This entry records the combined uncommitted implementation currently present in the working tree.

- **Widget CORS:** Public widget endpoints now allow only the origin configured in `Store.websiteUrl`; missing or mismatched website origins receive no `Access-Control-Allow-Origin` header. Localhost, `127.0.0.1`, and `::1` are recognized by hostname, including development ports such as `:3000`, while mismatched local ports remain rejected.
- **PostgreSQL-backed rate limiting:** Public request limits and AI global/per-store usage quotas use the `RateLimitCounter` table and an atomic PostgreSQL upsert, with bounded window cleanup. Database counter failures fail open and emit a safe structured log event. The AI circuit breaker remains process-local.
- **Phase 12.6-D admin hardening:** Shared-secret authentication comparison is constant-time, the admin cookie is restricted to `/admin` while retaining HttpOnly/SameSite/Secure and bounded lifetime, and a logout action invalidates the cookie. The existing shared/global secret model remains; this is not per-merchant identity or a full authentication system. No CSRF token infrastructure was added; current mutations remain protected by server-side guards and `SameSite=Lax` server actions.
- **Current validation target:** 47 test files and 538 tests, with Prisma validation, typecheck, lint, and production build required before commit.

---

# Current working-tree update — Fragrantica reference grounding for AI enrichment (2026-09-25)

## What this is

The AI enrichment flow (Phase 11 single-perfume and Phase 12.4 bulk profiling, both reached
through `AIProvider.generatePerfumeProfile`) can now ground its descriptor output in a real
fragrance database when the perfume being enriched is known to it. This reduces LLM
hallucination and improves descriptor consistency. It is prompt-context only:

* the **output contract is unchanged** — same 10 writable descriptors, same `family`/`notes`,
  same `validateAiProfileResult` validation, same clamping;
* the **9 matching axes are untouched** — they remain user-personality-derived; the reference
  data never touches them and the matching engine never reads it;
* when **no match** is found, the enrichment prompt is **byte-identical** to the previous
  behaviour (tested).

## Data source and location

* Source: Kaggle **"Fragrantica.com Fragrance Dataset"** (`fra_cleaned.csv`, 2024-09 snapshot,
  English-language, 24,063 rows). The original CSV is kept at
  `data/fragrantica/fra_cleaned.csv` (6.5 MB, Windows-1252 encoding, `;`-separated).
* The compact, project-owned form is **`data/fragrantica/reference.json`** (~5.8 MB):
  **23,846 unique perfumes** (deduplicated by normalized brand+name slug; the better-rated
  duplicate row wins) with brand, name, gender, flattened top/middle/base notes, main accords
  (≤ 5) and release year. Rows without any accord data are dropped.
* The file also carries an `_meta` block documenting source/purpose/license. **The Kaggle
  dataset license must be verified before any production/commercial use of this data.**

## Implementation map

```text
data/fragrantica/reference.json      the reference data (generated, committed)
scripts/generate-reference-data.py   one-off converter (CSV → JSON); re-run to refresh
lib/ai/reference-lookup.ts           lazy loader, fuzzy matcher, accord vocabulary export
lib/ai/perfume-profile.ts            buildReferenceGrounding() + optional prompt parameter
lib/ai/qwen.ts                       resolves the match per request and passes it in
tests/ai/reference-lookup.test.ts    matcher + vocabulary tests
tests/ai/reference-grounding.test.ts prompt grounding tests (with/without match)
```

* `findReferenceMatch(name, brand)` normalizes both sides (lowercase, diacritics stripped,
  `&` → "and", non-alphanumerics → spaces) so the dataset's slugified names compare equal to
  display names. Exact normalized brand+name wins; otherwise the best token-overlap candidate
  (≥ 0.5 Jaccard) sharing the brand; if the brand is unknown in the dataset, name-only exact
  then overlap. Dependency-free — no ML/fuzzy npm packages.
* `REFERENCE_ACCORD_VOCABULARY` (84 controlled accord labels, e.g. "woody", "warm spicy") is
  exported and appended to `PROFILE_SYSTEM_PROMPT`: the model is asked to prefer these terms
  when describing scent character.
* The lookup is wrapped defensively in `qwen.ts`: any failure (e.g. chunk load error) degrades
  to "no reference" — enrichment never breaks because of grounding.

## Hard boundaries (do not violate)

* This reference data is for **internal AI grounding only**. It must **never** be shown
  directly to customers, never exposed through any customer-facing API or the widget, and
  never treated as verified store inventory (it is not the `Perfume` model and is not
  importable through the merchant CSV path).
* The reference rows are community-sourced Fragrantica data, not our curation; note names and
  accords are English. The AI already writes Persian copy on top — the grounding context
  stays English, the output stays Persian where required.

## How to refresh the data later

1. Place an updated `fra_cleaned.csv` at `data/fragrantica/fra_cleaned.csv`.
2. Run `python scripts/generate-reference-data.py` (Python 3, stdlib only).
3. Re-run `npm test` — the reference tests (Sauvage/Dior, Lancome, Jean Paul Gaultier
   entries and the 84-label accord list) will fail loudly if the vocabulary or the lookup
   contract changed shape.

## Validation after this change

`npx vitest run tests/ai/*` — 38 tests across 4 files pass, including all pre-existing
enrichment contract suites (`perfume-profile.test.ts`, `profiler.test.ts`) **unmodified**.

---

# Current working-tree update — Warm visual redesign (2026-09-25)

This entry records the uncommitted customer-facing visual work present in the working tree,
implemented independently of the historical handoff sections above (which describe the
deployment-era UI).

## Scope

A complete warm-cream visual redesign of the shopper-facing and admin surfaces, with no
changes to any deterministic logic, contract or database schema:

* **Color system (`app/globals.css`):** the palette moved from the previous premium dark
  theme to a warm cream theme (`--background: #faf7f2`, `--foreground: #2a2420`, layered
  `--surface` / `--surface-2` / `--border-soft`, `--accent: #b5652d`, `--forest` support
  color, soft shadow tokens). Tailwind v4 `@theme inline` tokens map them to utility
  classes. `prefers-reduced-motion` is respected for all new animation.
* **Custom fonts:** two local woff2 fonts are wired via `@font-face` and the theme tokens —
  **SG Kara** (headings, `public/fonts/SGKara-SemiBold.woff2`) and **Estedad** (body,
  `public/fonts/Estedad-Regular.woff2`), with Vazirmatn as fallback. Vazirmatn remains the
  only `next/font/google` font; the two new fonts are self-hosted static assets.
* **Per-archetype accent colors:** all 8 archetypes in `lib/personality/archetypes.ts` now
  carry an `accentColor` hex field (typed in `types/personality.ts`, format-locked in
  `tests/personality/archetypes.test.ts`). `components/results/ResultsView.tsx` and
  `components/quiz/QuizResultCard.tsx` apply it as a **scoped CSS custom-property override**
  (`--accent`, `--accent-soft`, plus a per-archetype `--accent-contrast` for readability),
  so every surface below the scope inherits the archetype's color without global restyling.
* **Animated trait bars:** new `components/results/TraitBars.tsx` renders the nine-dimension
  profile with an IntersectionObserver scroll-triggered fill (1000 ms ease-out, 90 ms
  staggered per bar, Persian percent labels, `role="progressbar"` ARIA attributes, and a
  reduced-motion bypass). It replaced the old static traits block in `ResultsView`.
* **Local SVG icons:** `components/ui-icons.tsx` (`BrandMark`, `BottleMark`) replaces
  external/emoji icon usage in the results surfaces.
* **Structural fix:** `app/globals.css` was restructured (font-face declarations moved above
  the Tailwind import boundary, token definitions consolidated) — this was the fix the
  redesign depended on.
* The same styling pass touched the admin pages, quiz components, widget shell and error
  boundaries for consistency; behavior of those screens is unchanged.

## Boundaries

* No matching-engine, scoring, quiz-flow, API or persistence changes — visual only plus the
  `accentColor` data field on the (UX-only) archetypes.
* `ui-audit/` at the repo root is a throwaway screenshot folder from the redesign review;
  it is NOT part of the project source and must not be committed (git-ignore or delete).

## Validation status

Tests 556/556 across 49 files, lint 0 errors / 6 pre-existing warnings, typecheck pass,
production build (webpack) pass — measured with this redesign and the Fragrantica
reference-grounding feature combined in one working tree (see the entry below).
