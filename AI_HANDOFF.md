# AI_HANDOFF.md — Fragrance AI

> Handoff for AI coding agents. Written 2026-09-21 after Phase 6A.
> Based on the actual codebase, not assumptions. Phase 6A was authored on
> 2026-09-21; all claims below were verified against the tree and by running
> the gates (see the final note).
> Root: `C:\Users\Admin\fragrance-ai` (Windows 10, no Git installed).

---

## 1. Project overview

**Fragrance AI — «عطر خودتو پیدا کن ✨»** is a B2B SaaS / embeddable,
AI-assisted perfume-recommendation system for perfume e-commerce stores,
initially targeting Iranian/Persian-language merchants.

```
Store website → Persian RTL widget → 10-question personality quiz
  → personality vector (9 dims, 0–100) → store inventory (server-side)
  → deterministic matching engine → ranked Top-N perfumes
  → (later) AI Persian «چرا این عطر؟» → merchant product links
```

**Core principle (non-negotiable):** the LLM must never choose, rank, or score
perfumes. A pure deterministic engine owns scoring/ranking. AI (Phase 4+) only
writes explanations. With all AI down, recommendations are unchanged. This is
*not* a psychological test — never present it as one.

Phases 0–9 are complete (§4); **Phase 10 (first real customer) is next** (§11).
Do not start it unless the user asks.

## 2. Current objective

**Phase 10 — first real customer** (only when the user asks). Not started.

**Phase 9 (store attribution for standalone quiz traffic) is complete and verified**
— `/quiz` now accepts an optional `?store=<storeId>` param (validated against the
seeded stores server-side), threaded through `Quiz` → quiz-flow state machine →
`QuizResultCard`, so standalone `QUIZ_STARTED`/`QUIZ_COMPLETED` carry the store id
(the last null-storeId analytics gap, previously solved only for widget traffic in
Phase 8). The result link pins `store=` (omitted for the default store, consistent
with the results-param serializer). Browser verification exposed and fixed a real
latent bug: `RecommendationCard.tsx` had a Phase 7 `PERFUME_CLICKED` onClick without
`"use client"` — the standalone `/result` page threw at runtime; fixed by adding the
directive (widget path unaffected, uses its own card). Live-verified for both seeded
stores with full event cleanup. The `<img>` revisit remains deferred (no merchant
image domains known).

**Phase 8 (embeddable widget) is complete and verified** — merchants embed via one
script tag (`public/widget.js`: vanilla, zero-dependency loader that validates
`data-store-id`, guards duplicates, derives the base URL from its own src, and mounts
an **iframe** at `/widget?store=…` with a postMessage resize bridge). The iframe is
the CSS isolation boundary (Shadow DOM was evaluated and rejected — it would have
required a separate React bundle + build step). Inside, `components/widget/WidgetApp`
reuses the one real quiz flow/scorer and fetches customer-safe Top-N recommendations
from `POST /api/widget/recommend` (server-side store + vector validation → existing
Phase 3 repository/engine → optional Phase 4 explanations; the browser never scores,
never sees inventory). `GET /api/widget/config` validates the store (exists + active)
and returns only `{storeId, storeName, active}`. Both endpoints use **reflected-origin
CORS** (never `*`). Analytics: all five events carry the widget storeId — Phase 7's
null-storeId limitation is solved for widget traffic. Admin gained «کد نصب ویجت»
(`components/admin/WidgetEmbedCode.tsx`) using `NEXT_PUBLIC_APP_URL` (documented in
`.env.example`; local fallback = request origin; no production hostname invented).
No schema change. Manual browser verification via `public/widget-demo.html`
(hostile-CSS merchant simulator + 10-point checklist); automated browser testing not
performed. Live HTTP smoke test passed (20 checks) with full cleanup.

**Phase 7 (analytics) is complete and verified** — anonymous append-only events in the
new `AnalyticsEvent` table (migration `20260922_phase7_analytics_events`, applied via
the established `migrate diff` + `deploy` workflow); canonical 5-type contract in
`lib/analytics/types.ts`; single validated write path (`lib/analytics/service.ts`) that
checks active store + perfume ∈ store; `POST /api/events` (defensive, never leaks
internals); dashboard `/admin/analytics` (store selector, UTC-day range presets 7d
default, KPI cards, top-perfume table, daily roll-up, honest empty state). KPIs:
completion = completed/started; click rate = clicks/**result pages shown** (literal
contract — can exceed 100%); zero denominators render `—`. RESULT_VIEWED and
RECOMMENDATIONS_SHOWN (metadata `{count}`) are recorded **server-side** in
`lib/results/service.ts` — one per navigation, no client dedupe needed; QUIZ_STARTED/
QUIZ_COMPLETED fire from explicit user actions client-side with once-per-attempt
guards (`lib/analytics/flow-tracker.ts`, opaque sessionStorage token, reset on
restart/CTA navigation); PERFUME_CLICKED only on real product-link clicks. Privacy:
no IP/email/phone/name/location/fingerprint/ad-ids; approximate, not fraud-proof.
Live smoke test passed (6 test events via the real service, dashboard aggregation
verified, foreign-perfume rejection verified, cleanup by session token, DB back to
0 events). Analytics never calls AI and never breaks the customer flow (all recorder
failures are swallowed).

**Phase 6B (CSV import) is complete and verified** — group import at
`/admin/perfumes/import`: upload (≤ 5 MB / ≤ 5,000 rows) → server-side RFC-4180
parse → row validation via the Phase 6A `validatePerfumePayload` (single
validation authority) → read-only preview (totals + per-row errors + duplicate
detection; **no DB mutation**) → explicit confirm → **atomic**
`prisma.$transaction` import (all rows or none) → success summary. Create-only:
existing perfumes are never updated; duplicate slugs (in-file or against the
selected store) block the import; `storeId` in the file is rejected — the target
store comes from the admin selector; the confirm action re-validates the raw CSV
server-side and re-checks slugs at commit time (race protection, backed by the
`@@unique([storeId, slug])` constraint). **No AI anywhere in the import.**
Authentication/authorization remain **deliberately deferred** (internal MVP,
not production-secure).

**Phase 6A (admin product management) is complete and verified** — internal admin
surface at `/admin/perfumes`: store-scoped list, create, edit, فعال/غیرفعال and
موجود/ناموجود toggles, full fragrance-profile management with upsert. **No delete
action** (deactivation only). Phase 5 (`/result`) untouched and verified after the change.

## 3. Architecture and important technical decisions

**Stack (installed):** Next.js **16.3.5** (App Router, Turbopack) · React
**19.2.8** · TypeScript **5.9.3** (strict) · Tailwind **4.3.3** ·
Prisma CLI/client **7.10.0** + `@prisma/adapter-pg` + `pg` · Vitest **5.0.1**
(`node` env) · tsx **4** · ESLint 9 flat (`eslint-config-next`) · Node **24.21.0**.

**Prisma 7 conventions (do NOT "fix" to older styles):**

* `prisma.config.ts` at root: `schema`, `migrations.path`,
  `migrations.seed: "tsx prisma/seed.ts"`, `datasource.url = env("DATABASE_URL")`,
  plus `import "dotenv/config"` (Prisma 7 does **not** auto-load `.env`).
* `prisma/schema.prisma` has **no datasource URL**; generator `prisma-client`
  requires `output = "../lib/generated/prisma"`.
* Runtime: `lib/db.ts` lazy `getPrisma()` with `new PrismaPg(...)` (Prisma 7
  requires a driver adapter), cached on `globalThis`.
* Generated client (`lib/generated/prisma`, git-ignored) must be regenerated via
  `npm run db:generate` after cloning or schema changes, or typecheck fails.
* **Migrations:** `prisma migrate dev` is unusable — it needs a shadow DB and the
  Supabase Session Pooler forbids `CREATE DATABASE` (fails as misleading P1001).
  Working pattern (already used): generate SQL with
  `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`,
  write to `prisma/migrations/<name>/migration.sql`, then
  `npx prisma migrate deploy`, verify with `npx prisma migrate status`.
  Never use `prisma db pull` to build schema.

**Deterministic core:**

* Pure functions only — no AI, clock, randomness, network.
* **Canonical 9 dimensions:** `MATCHING_DIMENSIONS` in
  `lib/fragrance/profile.ts` (aliases Phase 1 `PERSONALITY_DIMENSIONS`):
  `social, adventurous, expressive, mysterious, fresh, warm, experimental,
  elegant, bold`. **Never re-declare it.**
* Formula (`lib/matching/score.ts`):
  `distance = sqrt(Σ(user−perfume)²)`; `MAX_DISTANCE = sqrt(9×100²) = 300`;
  `similarity = clamp(100 × (1 − distance/300), 0, 100)`.
  Exact match ⇒ exactly 100; max distance ⇒ exactly 0.
* Two scores: **raw** (ranking, unrounded) and **presentation**
  (`round(score × 10) / 10`, display only, rounded exactly once).
* Ranking: score desc; ties → ascending `perfumeId`. `topN` default 5, must be a
  positive integer.
* Eligibility: excluded (counted in `MatchResult.excluded`) when inactive, from
  another store, or missing/invalid profile. Invalid user vector throws loudly.
* Store isolation (hard): Prisma `where` (`storeId`, `active: true`) **and**
  re-checked in the pure engine.
* Prisma is imported only by `lib/db.ts` and `lib/matching/repository.ts`.
  Client components never touch the DB.
* Phase 1 scoring is the source of truth — never change it.

**Persian/RTL:** `app/layout.tsx` (`<html lang="fa" dir="rtl">`, Vazirmatn via
`next/font/google`); tokens in `app/globals.css` (dark, accent `#d9a24a`);
digits via `lib/persian.ts`. Conversational Iranian Persian copy.

**Provider-agnostic AI (Phase 4) — decided, implement it the same way:**

* Vendor code lives **only** in `lib/ai/qwen.ts`. `lib/ai/provider.ts` holds the
  `AIProvider` interface, config reading and the null provider; nothing else in
  the app may import a vendor. `AI_PROVIDER` (default `qwen`, `none` = off)
  selects the implementation inside `createAIProvider()`.
* `lib/ai/errors.ts` is a deliberate **leaf module** (`AiUnavailableError`,
  `AiRequestError`, `AiResponseError`). Importing these from `provider.ts` created
  a provider → qwen → domain → provider cycle that broke module init once. Do not
  merge them back.
* Failure is modelled as data, not exceptions: domain helpers return
  `AiOutcome<T>` = `{ ok: true, value } | { ok: false, reason }`. Callers never
  need try/catch and the deterministic result always survives.
* **Validation runs twice** — inside the provider and again in the domain helper
  (`validateAiProfileResult` / `validateAiExplanation`), so a forgetful future
  provider still cannot emit a matching axis, a digit or a foreign product.
* Only `DESCRIPTOR_DIMENSIONS` are AI-writable (`AI_WRITABLE_DIMENSIONS` in
  `provider.ts`). The nine `MATCHING_DIMENSIONS` are read-only context; a reply
  that sets one is rejected with `AiResponseError`.
* Transport: plain `fetch` to `${QWEN_BASE_URL}/chat/completions` (trailing
  slashes trimmed), bearer auth, `response_format: { type: "json_object" }`,
  `temperature: 0.2`, `max_tokens: 500`, `AbortController` timeout from
  `QWEN_TIMEOUT_MS`. Numeric replies are clamped to 0–100
  (`clampProfileValue`) rather than invented. `fetchImpl` is the test seam.
* Economics drive prompt size: ≈ $0.25/1M in, $2.00/1M out, ≈ $0.50 temporary
  credit — trait values are sent as Persian bands and descriptions are capped
  (300 chars in explanations, 400 in enrichment) to keep prompts small.

**Windows quirks:** PowerShell blocks `npm.ps1` → use
`cmd /c "cd /d C:\Users\Admin\fragrance-ai && npm …"`. npm 11 `allowScripts`
skips postinstalls for prisma/engines/unrs-resolver/esbuild (works without them).
Leftover node/esbuild processes can fail installs with EBUSY — kill node first.
Long npm installs exceed short command timeouts → run detached to a log, poll.

## 4. Completed work

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Bootstrap: Next.js 16 + TS + Tailwind 4 + Prisma 7, RTL, env files | ✅ |
| 1 | 10-question Persian quiz: scoring, 9 dims, archetypes, UI, `/api/quiz/submit` | ✅ |
| 2 | Supabase schema, initial migration, seed, profile helpers | ✅ |
| 3 | Deterministic matching engine, repository, service, 22 tests, live verify | ✅ |
| 4 | AI layer: provider abstraction, Qwen3.6/GaptGPT, enrichment, explanations, fallback, 44 tests | ✅ |
| 5 | Results UI: /result server page, params contract, loading/error/empty states, 14 tests | ✅ |
| 6A | Admin product management: store-scoped list/create/edit/toggles + profile upsert, 18 tests | ✅ |
| 6B | CSV import (preview → confirm → atomic create-only import) | ✅ done |
| 7 | Analytics: AnalyticsEvent model, /api/events, /admin/analytics dashboard, 41 tests | ✅ done |
| 8 | Embeddable widget: widget.js loader, /widget iframe, widget APIs, admin snippet, 28 tests | ✅ done |
| 9 | Store attribution for standalone quiz traffic (`/quiz?store=`), 8 tests, `"use client"` render fix | ✅ done |
| 10 | First customer | not started |

* **Phase 1:** integer-delta questions (`questions.ts`); raw sums → 0–100
  normalization (`scoring.ts`); 8 Persian archetypes (`archetypes.ts`); pure
  `intro→question→result` state machine (`quiz-flow.ts`); RTL UI
  (`components/quiz/*`, `app/quiz/page.tsx`); `POST /api/quiz/submit` (strict
  validation, 200/400); client falls back to the shared scorer if the API fails.
* **Phase 2:** 5 models, 4 enums, justified indexes/uniques, deliberate delete
  behaviour, migration `20250920_phase2_init_schema` applied, fictional seed.
* **Phase 3:** pure engine (`lib/matching/{score,engine}.ts`), repository +
  service, store isolation, 22 unit tests, `scripts/verify-matching.ts` (live).
* **Phase 4:** provider-agnostic `AIProvider` + null provider
  (`lib/ai/provider.ts`); leaf error classes (`lib/ai/errors.ts`); the only
  vendor file `lib/ai/qwen.ts` (OpenAI-style `/chat/completions`, bearer auth,
  `AbortController` timeout, `fetchImpl` test seam); descriptor enrichment
  (`lib/ai/perfume-profile.ts`); Persian «چرا این عطر؟» copy
  (`lib/ai/explanation.ts`); 44 tests in `tests/ai/`;
  `scripts/verify-ai-fallback.ts` (live, needs no credentials). No SDK, no route,
  no persistence.
* **Phase 5:** pure URL contract (`lib/results/params.ts`: nine 0–100 integers +
  archetype id + optional store id; strict parse, demo-store default);
  server-only orchestration (`lib/results/service.ts`: engine → optional
  explanations, never re-scores); `/result` route (`app/result/page.tsx` +
  `loading.tsx` + `error.tsx`); presentational components
  (`components/results/{ResultsView,RecommendationCard}.tsx`); quiz result card
  links to `/result` with the profile in the URL; `formatPersianScore` added to
  `lib/persian.ts`; 14 tests in `tests/results/`. **No new API endpoint, no
  persistence, no dependency, no change to any Phase 1–4 file's behaviour**
  (QuizResultCard gained the results CTA; `lib/ai/*`, `lib/matching/*`,
  `lib/personality/*` untouched).
* **Phase 6A:** pure validation (`lib/admin/validation.ts`:
  `validatePerfumePayload` — required fields, nine required integer 0–100 axes
  from `MATCHING_DIMENSIONS`, ten optional descriptors, enums, URLs, price,
  slug pattern, boolean strictness; plus `isPerfumeInStore` guard);
  server-only CRUD (`lib/admin/repository.ts`: store-scoped list/read/create/
  update, profile **upsert** keyed on the unique `perfumeId`, flag toggles, no
  delete); server actions (`app/admin/perfumes/actions.ts` — re-validate then
  mutate, Persian feedback); pages (`app/admin/perfumes/{page,new/page,
  [id]/edit/page,loading,error}.tsx`); client components
  (`components/admin/{PerfumeForm,ProfileEditor,PerfumeToggles}.tsx` — form
  interaction only, never the DB). **Schema unchanged; no new dependency; no
  CSV code** (`app/api/perfumes/import/.gitkeep` still untouched).

## 5. Current implementation state

* **Tests:** 16 files, **152/152 passing**: personality (36), matching engine
  (22), fragrance-profile (10), quiz-submit route (4), quiz UI SSR smoke (4),
  AI 44, results 14, **admin 18** (validation + store-isolation guard, pure).
  Phase 6A added the 18 and changed no existing test.
* **Gates (Phase 6A close, this machine, 2026-09-21):** `npm test` ✅ 152/152 ·
  `npm run lint` ✅ (exit 0, 0 warnings) · `npm run typecheck` ✅ (exit 0) ·
  `npm run build` ✅ (exit 0; routes: `/`, `/_not-found`, `/quiz` static;
  `ƒ /api/quiz/submit`, `ƒ /result`, **`ƒ /admin/perfumes`,
  `ƒ /admin/perfumes/new`, `ƒ /admin/perfumes/[id]/edit`** dynamic) ·
  `npx prisma validate` ✅ ("schema is valid") · `npx prisma migrate status` ✅
  ("Database schema is up to date!" — no migration was needed or created) ·
  `npx tsx scripts/verify-matching.ts` ✅ (determinism true, isolation true) ·
  `npx tsx scripts/verify-ai-fallback.ts` ✅ (recommendations unchanged).
* **Live DB (Supabase dev, queried for this doc):** 2 stores, 5 perfumes,
  5 profiles, 0 sessions, 0 recommendations (idempotent fictional seed).
* **Routes:** `GET /` (status/landing + Link to /quiz), `GET /quiz` (static),
  `POST /api/quiz/submit` (dynamic), `GET /result` (dynamic, Phase 5),
  **`GET /admin/perfumes` + `/new` + `/[id]/edit` (dynamic, Phase 6A)** —
  server components with server-action mutations; every admin query/mutation is
  store-scoped; `app/admin/perfumes/error.tsx` is a client error boundary.
  **No authentication exists on the admin routes — internal MVP only.**
* **Nothing in progress** — no half-finished edits. Two leftover validation logs
  from the Phase 4 implementation run sit in the project root (`build-p4.log`,
  `lint-p4.log`); they are plain text, unused by the app, and were left in place
  rather than deleted by this agent.
* **DB row counts were not re-queried this phase** (no DB work); the seeded dev
  database is the same one Phases 2–3 populated and the live scripts still read it.
* **Current Qwen connection status (2026-09-21): NOT CONNECTED.** `QWEN_API_KEY` and
  `QWEN_BASE_URL` are both empty in `.env` (presence checked only; values never read
  or printed). The provider correctly reports itself unavailable for this reason and
  every downstream consumer degrades to `aiAvailable: false` — this is the intended
  Phase 4 behaviour, not a defect. The real GaptGPT HTTP path remains **unverified
  against reality**; transport is covered only by `tests/ai/qwen.test.ts` via an
  injected fake `fetch`. `AI_PROVIDER=qwen`, `QWEN_MODEL=qwen3.6`,
  `QWEN_TIMEOUT_MS=15000` are set. Unblocking requires only the two missing env
  values (§11); no code change is needed.

## 6. Files and directories that matter

```
fragrance-ai/
├── app/
│   ├── layout.tsx, page.tsx, globals.css
│   ├── quiz/page.tsx            # renders components/quiz/Quiz.tsx
│   ├── api/quiz/submit/route.ts # POST 200/400 contract (see §7)
│   ├── result/{page,loading,error}.tsx  # ✅ Phase 5
│   ├── admin/perfumes/{page,loading,error}.tsx + new/, [id]/edit/, actions.ts  # ✅ 6A
│   ├── admin/analytics/.gitkeep                     # ❌ Phase 7
│   └── api/{recommendations,perfumes/import,events}/.gitkeep  # ❌ later (import flow = 6B via server actions)
├── components/quiz/             # Quiz, Question, QuizOption, ProgressBar, QuizResultCard
│   ├── results/.gitkeep         # ❌ Phase 5
│   └── widget/.gitkeep          # ❌ Phase 8
├── lib/
│   ├── db.ts                    # getPrisma() singleton + PrismaPg adapter
│   ├── persian.ts               # Persian digit/percentage helpers
│   ├── fragrance/profile.ts     # ★ canonical MATCHING_DIMENSIONS + mappers
│   ├── matching/{score,engine,repository,service}.ts  # Phase 3
│   ├── personality/{questions,scoring,archetypes,quiz-flow,labels}.ts
│   ├── ai/{errors,provider,qwen,perfume-profile,explanation}.ts  # Phase 4
│   ├── results/{params,service}.ts  # Phase 5: pure URL contract + server orchestration
│   ├── admin/{validation,repository}.ts  # Phase 6A: pure validation + server-only CRUD
│   ├── generated/prisma/        # git-ignored client output (regenerate!)
│   └── analytics/.gitkeep       # ❌ Phase 7
├── prisma/{schema.prisma,seed.ts,migrations/}
├── prisma.config.ts             # Prisma 7 config
├── scripts/verify-matching.ts   # live DB check (tsx)
├── scripts/verify-ai-fallback.ts # Phase 4 fallback check (no creds needed)
├── tests/{personality,matching,db,api,quiz,ai,results,admin}/  # ai/=P4, results/=P5, admin/=P6A
├── types/{personality,fragrance,recommendation}.ts  # pure contracts
├── vitest.config.mts            # include tests/**/*.test.{ts,tsx}, "@" alias
└── README.md                    # detailed phase docs — KEEP UPDATED
```

`.gitkeep` = deliberately unimplemented (per the phase plan). `AGENTS.md` /
`CLAUDE.md` point to Next 16's bundled docs in `node_modules/next/dist/docs/`.

## 7. Database / schema / API information

**Schema (`prisma/schema.prisma`, applied):**

* Enums: `Gender {MEN,WOMEN,UNISEX}`, `Occasion {DAILY,DATE,PARTY,OFFICE,FORMAL}`,
  `Season {SPRING,SUMMER,AUTUMN,WINTER,ALL}`,
  `QuizSessionStatus {STARTED,COMPLETED,ABANDONED}`.
* `Store`: id, name, **slug `@unique`**, websiteUrl?, logoUrl?, active, timestamps.
* `Perfume`: id, storeId(FK), name, brand, slug?, description?, productUrl?,
  imageUrl?, gender (default UNISEX), price? (IRR default), inStock (default true),
  active (default true), timestamps; `@@unique([storeId, slug])`;
  `@@index([storeId, active, inStock])`.
* `FragranceProfile`: id, **perfumeId `@unique`** (1:1), nine required `Int`
  matching axes (0–100), optional descriptors (`sweet, woody, spicy, floral,
  citrus, aquatic, smoky, clean, longevity, projection`), `family String?`,
  `notes String[]`, `season?`, `occasion?`, timestamps.
* `QuizSession`: id, storeId? (FK), `answers Json`, nine nullable `Int?` vector
  columns (present only when COMPLETED), `archetypeId?`, `status`, `season?`,
  `occasion?`, `budget?`, timestamps; `@@index([storeId, status, createdAt])`.
* `Recommendation`: id, quizSessionId (FK), perfumeId (FK), `rank Int`,
  `score Float`, `explanation String?`, createdAt;
  `@@unique([quizSessionId, rank])`, `@@index([perfumeId])`.
* Delete matrix: Store→Perfume **Cascade**; Perfume→Profile **Cascade**;
  QuizSession.store → **SetNull**; QuizSession→Recommendation **Cascade**;
  Recommendation.perfume → **Restrict** (history never silently deleted; soft
  deactivation via `active`).
* Migration: `20250920_phase2_init_schema` (in `prisma/migrations/` with
  `migration_lock.toml`).

**API:** only `POST /api/quiz/submit` exists. Request: `{ answers:
[{ questionId, optionId }] }` (exactly 10, known ids, no duplicates) →
`200 { result: { answers, raw, vector, archetype } }`;
malformed JSON → `400 { error: "INVALID_JSON", reason }`;
invalid answers → `400 { error: "INVALID_ANSWERS", reason }`.
No recommendations/submit API exists; the Phase 3 service is invoked directly from
the Phase 5 results page (server-side) and the verify scripts. Phase 5 deliberately
added **no** endpoint — the profile travels in the URL (`lib/results/params.ts`)
and everything sensitive stays server-side.

The **`GET /result`** page consumes the Phase 4 layer exactly as designed: it calls
`createAIProvider()` + `generateExplanations(...)` (via `lib/results/service.ts`)
after the engine has already ranked; a missing/failing provider degrades to
`aiAvailable: false` and the identical list renders without copy.

**Admin API surface (Phase 6A):** none over HTTP — mutations go through Next.js
server actions in `app/admin/perfumes/actions.ts`, which call the pure validator and
the server-only repository. The repository functions are the only Prisma touchpoint
besides `lib/db.ts` and `lib/matching/repository.ts`.

**Seed** (`npm run db:seed`, idempotent upserts, fictional): 2 stores
(`demo-perfume-shop`, `demo-second-shop`), 5 perfumes, 5 profiles, 0 sessions.

## 8. Environment / configuration (no secrets below)

* Runtime: Node.js 20.9+ (dev runs 24.21.0). Fresh checkout: `npm install` →
  `npm run db:generate` → copy `.env.example` to `.env` and fill values.
* Env vars (names only; values live in `.env`, never commit/print it):
  `DATABASE_URL` (Supabase **Session Pooler, port 5432** — do NOT switch to
  localhost or 6543; plain connection string, no `sslmode`/`pgbouncer` params);
  `AI_PROVIDER` (set, `qwen`); `QWEN_API_KEY` (**empty**, confirmed 2026-09-21);
  `QWEN_BASE_URL` (**empty** — **obtain from the user**); `QWEN_MODEL` (set,
  `qwen3.6`); `QWEN_TIMEOUT_MS` (set, 15 s). `.env.example` holds secret-free
  placeholders (`sk-replace-me`, an `.example` URL). Note: `.env` also carries a
  `DIRECT_URL` that no code reads and that `.env.example` does not document —
  leave it alone.
* Scripts: `dev`, `build`, `start`, `lint`, `test` (`vitest run`),
  `typegen`, `typecheck` (`next typegen && tsc --noEmit`),
  `db:validate`, `db:generate`, `db:studio`, `db:seed`.
* Extra commands: `npx tsx scripts/verify-matching.ts` (live engine check);
  `npx tsx scripts/verify-ai-fallback.ts` (Phase 4 fallback check, no AI creds
  needed, read-only); `npx prisma migrate status`; `npx prisma migrate deploy`.
* Env files: verify presence/shape only (e.g. is `DATABASE_URL` set? port?).
  Never echo values into logs, files, or chat.

## 9. Known bugs and issues

**No open functional bugs** — every known issue from Phases 0–3 was fixed and
validated:

* `migrate dev` P1001 on Supabase → use `migrate diff` + `migrate deploy` (§3).
* `toMatchingVector` once crashed on null → now returns null; regression-tested.
* npm EBUSY on reinstall → kill node, remove esbuild dirs, reinstall.

Conscious limitations / quirks (not bugs, don't "fix" without a phase task):

* No Git on this machine — no VCS history; extra care with destructive commands
  (`db push --accept-data-loss`, manual SQL, deletes) is mandatory.
* npm 11 `allowScripts` skips several postinstalls (warning only; documented in §3).
* eslint 9 prints a "no longer supported" deprecation warning (pinned by
  create-next-app; ESLint 10 + `eslint-config-next` compatibility unverified).
* Prisma's `prisma db seed` also prints an "update available 8.0.0-rc" notice —
  ignore it; **do not upgrade to an RC**.
* `inStock`, `price`, `season`, `occasion` columns exist but the Phase 3 engine
  deliberately filters only on `active` (+ `storeId`) — applying stock/budget/
  season/occasion filters is a later filter step, not a bug.
* `QuizSession`/`Recommendation` rows are **never written yet** (no persistence,
  no recommendations API); only the tables exist. Phases 5–6A keep it that way.
* **Admin authentication/authorization is deferred (Phase 6A).** `/admin/perfumes`
  is a functional internal MVP surface with **no login, no password, no session
  infra** — it is `noindex, nofollow`, unlinked from customer pages, and must not
  be described as production-secure. Adding auth is its own later task; do not
  bolt on a fake gate.
* **Phase 6A has no delete action** — deactivation (`active = false`) is the only
  lifecycle operation, matching the delete matrix (history is preserved). Adding a
  delete UI would contradict the schema's Restrict intent.
* **`inStock` is admin-managed but not a recommendation filter** — the Phase 3
  engine still filters only on `storeId` + `active`; stock/budget/season filters
  are a later business-filter step.
* **The admin form validates twice**: HTML5 attributes client-side (UX only) and
  `validatePerfumePayload` server-side (source of truth). The server never trusts
  the browser; booleans from checkboxes are computed server-side, not coerced.
* **Profile upsert semantics**: descriptors absent from a submitted payload are
  written as **0**, not left untouched (the form always posts all ten). If a future
  partial-profile editor is added, revisit `toProfilePayload` first.
* **The AI layer is wired into exactly one place**: `lib/results/service.ts`
  (consumed by `GET /result`). Everything else still reaches it only through
  `tests/ai/*` and `scripts/verify-ai-fallback.ts`.
* **The live GaptGPT endpoint has never been called** — `QWEN_API_KEY` and
  `QWEN_BASE_URL` are empty, so the results page currently always renders the
  AI-unavailable notice (verified). The real HTTP shape is covered solely by
  `tests/ai/qwen.test.ts` via an injected fake `fetch`. Treat the first
  credentialed run as a genuine integration step.
* **Explanation rejection is deliberately aggressive**: any digit, `%`/`٪`, a
  quoted product other than the one being explained, or non-Persian text makes
  `validateAiExplanation` throw and that explanation is silently omitted. Some
  results legitimately ship without AI copy — intended trade-off, not a bug.
* **Trait values never reach the model as numbers** — they are reduced to Persian
  bands («بالا/متوسط/پایین», thresholds 70 / 45). Changing those thresholds changes
  prompt content only, never a score.
* `README.md` test-count comments can drift after test changes — update them in
  the same phase that changes tests.
* Shell cap: long commands (>~30 s) in this agent shell die silently — run
  long jobs detached to a log file and poll (see §12).

## 10. Work currently in progress

None. Phase 5 is complete on disk; every gate was run and passed (§5). The only
loose ends are the two harmless `*-p4.log` files in the root and the still-empty
QWEN credentials (§9).

## 11. Exact next steps

**Phase 4 leftover — credentials only (no code change needed):**

1. Obtain `QWEN_BASE_URL` (GaptGPT endpoint) and `QWEN_API_KEY` from the user and
   place them in `.env` (never commit or print them). Do not invent values.
2. With credentials present, re-run `npx tsx scripts/verify-ai-fallback.ts`. It
   should print `AI available: true` and one explanation per ranked perfume
   (`AI explanations generated: 4`). That is the **only** unverified Phase 4 path
   (§9); if it fails, fix `lib/ai/qwen.ts` only — never the engine.

**Phase 5 leftover (only when the user asks):** nothing blocking. Optional
polish: wire a real store id/slug into the quiz flow once multi-tenant routing
exists (the params contract already carries `store`), and revisit
`RecommendationCard`'s plain `<img>` if/when merchant image domains are known.

**Phase 6B — CSV import (COMPLETED 2026-09-21):** implemented as specified and
verified. Key files: `lib/admin/csv/{contract,parser,validate,service}.ts`,
`app/admin/perfumes/import/{page,actions}.ts`, `components/admin/CsvImportFlow.tsx`,
tests in `tests/admin/{csv-parser,csv-validate,csv-service}.test.ts` (57 new tests;
suite total 209/209 across 19 files). Row-error policy: **fail-closed** — any invalid
row disables the confirm action; the import never runs partially. Reused
`validatePerfumePayload` (no forked validation path). All gates green (§5); schema
unchanged; `prisma validate` + `migrate status` clean; both smoke scripts pass.

**Phase 7 — analytics (COMPLETED 2026-09-22):** implemented as specified and verified.
Key files: `lib/analytics/{types,service,repository,client,flow-tracker}.ts`,
`app/api/events/route.ts`, `app/admin/analytics/page.tsx`,
`components/admin/AnalyticsRangeNav.tsx`; integration edits in
`lib/results/service.ts` (server-side RESULT_VIEWED + RECOMMENDATIONS_SHOWN),
`components/quiz/Quiz.tsx` (start/complete), `components/quiz/QuizResultCard.tsx`
(CTA resets the attempt), `components/results/RecommendationCard.tsx` (click). Tests
in `tests/analytics/{types,repository,service,flow-tracker}.test.ts` — 41 new, suite
total 250/250 across 23 files. Schema changed: `AnalyticsEvent` + migration
`20260922_phase7_analytics_events` (applied; `migrate status` clean). The
`app/api/events/.gitkeep` and `lib/analytics/.gitkeep` placeholders were consumed by
this phase; `app/admin/analytics/.gitkeep` likewise. All gates green; both smoke
scripts pass; live event smoke test passed with full cleanup.

**Phase 8 — embeddable widget (COMPLETED 2026-09-22):** implemented as specified and
verified. Key files: `public/widget.js` (loader), `app/widget/page.tsx` (iframe
document), `components/widget/{WidgetApp,WidgetRecommendationCard}.tsx`,
`app/api/widget/{config,recommend}/route.ts`, `lib/widget/contract.ts`,
`components/admin/WidgetEmbedCode.tsx`, `public/widget-demo.html` (manual
verification page), tests in `tests/widget/{contract,routes,loader}.test.ts` (28 new;
suite total 278/278 across 26 files). Schema unchanged (no migration). All gates
green; both verify scripts pass; live HTTP smoke test passed with full cleanup.
`NEXT_PUBLIC_APP_URL` added to `.env.example` (empty by default — local fallback is
the request origin).

**Phase 9 — store attribution (COMPLETED 2026-09-22):** implemented as specified and
verified. Key files: `app/quiz/page.tsx` (reads/validates `?store=`),
`components/quiz/Quiz.tsx` + `components/quiz/QuizResultCard.tsx` (store threading +
attribution), `components/results/RecommendationCard.tsx` (`"use client"` runtime fix
found during browser verification), tests in `tests/quiz/store-attribution.test.tsx`
(8 new; suite total 286/286 across 27 files). Schema unchanged. All gates green; both
verify scripts pass; live browser verification passed for both seeded stores with full
event cleanup (DB back to 0 events).

**Matching validation + 100-perfume dataset (COMPLETED 2026-09-22):** the documented
inventory contract "out-of-stock is never recommended" was found UNENFORCED — `inStock`
appeared nowhere in the matching path. Fixed minimally: `MatchCandidateInput` gained a
required `inStock: boolean`, `lib/matching/repository.ts` selects/passes it, and the
engine excludes `inStock !== true` (after the active check, before profile validation;
scored `excluded`). Scoring/ranking/tie-break/store-isolation untouched. Regression
tests added in `tests/matching/engine.test.ts` (incl. "OOS excluded even when it would
rank first"). Test dataset: `scripts/seed-matching-dataset.ts` (idempotent upserts) —
dedicated store `store-matching-test` ("Matching Test Store") with 100 synthetic
perfumes (`mt-001..mt-100-<cluster>`, brand "MT Synthetic Lab", fictional URL
`matching-test.invalid`) across 10 clusters, 9 inactive / 14 out-of-stock (1 both) /
78 eligible. Test matrix (A–L) lives in `tests/matching/dataset-matrix.test.ts` — the
project's ONLY live-DB test suite (read-only; deliberately not mocked). Dedicated
reporter: `scripts/verify-matching-dataset.ts` (all checks PASS). Suite total
**302/302 across 28 files**. Schema unchanged; no UI file touched.
Known geometry note: the fresh/clean/citrus and aquatic/fresh clusters overlap in the
9-D space — a fresh-leaning user vector legitimately ranks aquatic members first.

**Admin perfumes runtime-error fix (2026-09-22):** `/admin/perfumes/new` and the edit
page crashed with "Functions cannot be passed directly to Client Components —
`action={function boundAction}`": the pages wrapped their server actions in inline
closures (not serializable across the Server → Client boundary). Fixed with the
supported `.bind(null, …)` pattern on the genuine `"use server"` exports. A second,
related latent bug surfaced during verification: `formDataToPayload` never assembled
the nested `payload.profile` from the flat form fields, so every create/edit failed
validation («پروفایل عطری الزامی است») despite a filled form — the CSV converter had
its own nesting, the HTML form path did not. Fixed in `formDataToPayload` (assembles
profile from `MATCHING_DIMENSIONS`/`DESCRIPTOR_DIMENSIONS` + metadata, deletes the
flat keys). Regression tests: `tests/admin/actions.test.ts` (4). Suite total
**306/306 across 29 files**. Browser-verified: create (including validation), edit,
both toggles, store isolation.

**Phase 11 — AI-assisted fragrance profiling (COMPLETED 2026-09-22):** admin-facing
profiler built entirely on the existing Phase 4 contract — no new provider, no
schema change. `generateProfileAction` in `app/admin/perfumes/actions.ts` collects
facts (stored row on edit via the store-isolated `getPerfumeForStore`; form fields on
create), runs `enrichPerfumeProfile` with `createAIProvider()` (server-side only, no
keys in the client), and returns validated descriptors/family/notes. **Generation
never writes** — the admin reviews the suggestion and saves through the normal
create/update form (single FragranceProfile preserved). Minimal UI: a «تولید پروفایل
با هوش مصنوعی» button + feedback area in `ProfileEditor` (client component fills the
descriptor inputs from the suggestion; matching axes are never touched by AI).
Failure states are Persian and recoverable: unavailable («هوش مصنوعی در دسترس
نیست…»), invalid/timeout (generic recoverable message); manual profile entry always
remains usable. Tests: `tests/ai/profiler.test.ts` (11, pure, spec §14 A–K). Suite
total **317/317 across 30 files**. Live Qwen NOT tested (credentials still absent);
all AI paths verified through the provider abstraction with injected mocks and the
real unavailable-provider path in the browser.

**Phase 10 — first real customer (do not start unless asked):**

1. Read §2/§4 first. Remaining recorded candidates: revisit
   `RecommendationCard`'s plain `<img>` once merchant image domains are known;
   obtain Qwen credentials (§9 leftover).
2. Same conventions: pure tests first, all gates + `prisma validate` +
   `migrate status`, update README (test counts!) and this handoff; then STOP.

**Later phases (only when asked):** first real customer (10).

## 12. Important instructions for the next AI agent

1. **Read before writing:** `README.md` (phases + commands), this handoff,
   `prisma/schema.prisma`, `lib/personality/*`, `lib/fragrance/profile.ts`,
   `lib/matching/*`, `lib/ai/*`, `types/*`, `prisma/seed.ts`,
   `scripts/verify-matching.ts`, `scripts/verify-ai-fallback.ts`.
2. **Work strictly phase-by-phase.** Implement only the assigned phase; STOP when
   done and report files/commands/results/errors/fixes. Never build future
   phases early.
3. **Deterministic core is untouchable.** No changes to Phase 1 scoring, the
   matching formula, canonical dimensions, ranking, or the P1001 migration
   workaround unless the user explicitly orders it — and then explain why.
4. **Never claim success without running it.** Gates: `npm test`,
   `npm run lint`, `npm run typecheck`, `npm run build` (+ `prisma validate`
   after schema work). If a gate fails: read the exact error, find the root
   cause, apply the smallest fix, re-run the gate and its dependants.
5. **Tests:** Vitest `node` env, `@/*` alias, colocate under `tests/<area>/`;
   pure logic only (no live DB in tests) — the single deliberate exception is
   `tests/matching/dataset-matrix.test.ts` (read-only live-DB matching matrix
   over the seeded 100-perfume test store); update README test counts when
   adding suites. The project's test count is **302 across 28 files**
   (`tests/ai/*`: 44; `tests/results/*`: 14; `tests/admin/*`: 18; `tests/analytics/*`:
   41; `tests/widget/*`: 28; `tests/quiz/*` incl. store-attribution: 8+ — pure
   validation + store isolation, no live DB).
6. **Server/client separation:** Prisma and AI keys stay in server-side modules
   only. Never expose either to browser components.
7. **Secrets:** read from `.env` at runtime; verify presence/shape only; never
   print or commit them; keep `.env.example` secret-free.
8. **No new dependencies** unless genuinely required (a test runner is already
   chosen; a seed runner already exists). Phase 4 added **no** dependency: the
   Qwen client is plain `fetch`. Keep it that way — no LLM/vendor SDKs.
9. **Keep docs in sync.** Update `README.md` and append to this `AI_HANDOFF.md`
   (bump phase table, state, known issues) at the end of each phase.
10. **Prefer small, typed, server-safe modules;** follow the existing comment
    style (explain *why* in comments, keep them honest); single canonical list
    for the nine dimensions (`MATCHING_DIMENSIONS`); stable tie-breaks; clear
    error messages over silent fallbacks — except AI, where graceful fallback
    is required.
11. **Destructive ops need explicit user approval first** (`migrate dev`
    resets, `db push`, manual deletes, dropping data) — no Git safety net on
    this machine.

*Verification note (author of this file): every claim above was checked against
the code on disk on 2026-09-21 rather than carried over. The Phase 4 sources were
read end to end (`lib/ai/{errors,provider,qwen,perfume-profile,explanation}.ts`,
`tests/ai/*`, `scripts/verify-ai-fallback.ts`), then all gates were re-run:
`npm test` → 13 files, **120 passed**; `npm run lint` → exit 0;
`npm run typecheck` → exit 0; `npm run build` → exit 0 with the same four routes;
`npx tsx scripts/verify-ai-fallback.ts` → exit 0 (`AI available: false`, 0
explanations, "recommendations unchanged" true). `.env` was inspected for
**presence only** (`QWEN_API_KEY`/`QWEN_BASE_URL` empty; no value was read,
printed or written) and `.env.example` was confirmed secret-free.
`prisma validate` / `migrate status` were not re-run because Phase 4 touched no
schema or database work. `AI_HANDOFF.md` was re-read top to bottom after writing;
all 12 sections are present and no secrets were included. **Unverified:** the real
GaptGPT HTTP path (no credentials exist yet) — see §9.*





