# Fragrance AI — عطر خودتو پیدا کن ✨

A B2B SaaS / embeddable **AI-powered personalised perfume recommendation** system for
perfume e-commerce stores, built Persian-first (RTL) for Iranian stores.

A shopper answers a short 10-question personality-style quiz; the system derives a
**Fragrance Personality / Fragrance Profile** and recommends perfumes from the
merchant's real inventory, with a short Persian «چرا این عطر؟» explanation.

> **Not** a scientifically validated psychological test. The result is a
> product-personalisation tool and must never be presented as a psychological diagnosis.

---

## Status: Phases 0–6 complete (6A + 6B) · Phase 7 next

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Environment, Next.js/TS/Tailwind/Prisma bootstrap, folders, env files, validation | ✅ done |
| 1 | Personality quiz engine (10 questions, scoring, archetypes, Persian RTL UI, API, tests) | ✅ done |
| 2 | PostgreSQL + Prisma schema/migrations/seed, product CRUD | ✅ done |
| 3 | Deterministic fragrance matching engine | ✅ done |
| 4 | AI layer (Qwen3.6 provider behind an abstraction, Persian explanations, fallback) | ✅ done |
| 5 | Results UI (renders the deterministic Top-N + optional AI explanations) | ✅ done |
| 6A | Admin product management (list, create, edit, activate/deactivate, fragrance profile) | ✅ done |
| 6B | CSV import (preview → confirm → atomic create-only import) | ✅ done |
| 7 | Analytics foundation & admin dashboard (event tracking, KPIs, top perfumes) | ✅ done |
| 8 | Embeddable widget (iframe loader, store-scoped APIs, widget admin snippet) | ✅ done |
| 9 | MVP polish: store attribution for standalone quiz traffic | ✅ done |
| 9.5 | Matching validation: 100-perfume test dataset + out-of-stock eligibility fix | ✅ done |
| 11 | AI-assisted fragrance profiling (admin generate → review → save) | ✅ done |
| 7 | Analytics | planned |
| 8 | Embeddable `widget.js` | planned |
| 9 | MVP polish + merchant demo | planned |
| 10 | First real customer | planned |

The quiz engine (Phase 1) is live at `/quiz` with a deterministic scoring API at
`POST /api/quiz/submit`; the results experience (Phase 5) is live at `/result`; the
internal admin product management (Phase 6A) is live at `/admin/perfumes` with the
group CSV import (Phase 6B) at `/admin/perfumes/import`; the analytics dashboard
(Phase 7) is live at `/admin/analytics`; the embeddable widget (Phase 8) is served
from `/widget.js` + `/widget`; standalone quiz traffic (Phase 9) now carries store
attribution via `/quiz?store=…`. The first real customer is Phase 10.

> **Phase 6A security note:** the admin surface is an internal MVP tool.
> **Authentication and authorization are deliberately deferred** to a later phase —
> there is no login, no password, no session infra, and the page is not
> production-secure. It is marked `noindex, nofollow` and is not linked from any
> customer-facing component.

---

## Phase 5 — results UI (implemented)

The shopper-facing results experience: quiz outcome → ranked perfumes + Persian copy,
fully RTL and mobile-first, with the deterministic engine as the only source of truth.

**Flow** — the quiz result screen links to `/result` with the profile in the URL
(nine 0–100 vector values, the archetype id, an optional store id). The page is a
**server component**: it parses the params (pure, strict — malformed URLs render a
friendly back-to-quiz state), runs the Phase 3 engine server-side, optionally attaches
Phase 4 explanations, and renders. No new API endpoint, no persistence, no secret in the
browser.

| File | Role |
| --- | --- |
| `lib/results/params.ts` | pure URL contract: `serializeResultsParams` / `parseResultsParams` (strict 0–100 integer validation, known archetype, store default) |
| `lib/results/service.ts` | server-only orchestration: `getResultsViewData` = engine → optional explanations; never re-scores or re-orders |
| `app/result/page.tsx` | the route; malformed params render a back-to-quiz state |
| `app/result/loading.tsx` | «در حال پیدا کردن عطر مناسب برای تو...» |
| `app/result/error.tsx` | error boundary: «مشکلی پیش اومد» + retry/restart |
| `components/results/ResultsView.tsx` | profile header, traits, ranked list, empty state, AI-unavailable notice |
| `components/results/RecommendationCard.tsx` | rank, name, brand, image, presentation score, optional explanation, CTA |

**Determinism guarantees carried over:** recommendations render in the exact engine
order; scores display `presentationScore` only (`formatPersianScore`, one decimal,
Persian digits — never re-rounded); an empty engine result renders «فعلاً عطری مطابق با
پروفایل تو پیدا نکردیم» without fabricating perfume; a missing/failing provider renders
the identical list plus «توضیحات هوشمند فعلاً در دسترس نیست.»

**Tests** — 14 tests in `tests/results/` (Vitest, node env, SSR via `react-dom/server`):
`params.test.ts` (7: round-trip, strict validation, defaults) and `results-ui.test.tsx`
(7: engine order, deterministic scores, AI copy shown/absent, empty state, graceful field
omission).

---

## Phase 1 — quiz engine (implemented)

**Flow.** `intro → 10 questions (one per screen) → result`, fully Persian and RTL, mobile
first. Progress is shown as «سؤال ۳ از ۱۰» plus a percentage; «قبلی» is disabled on the
first question, «بعدی» unlocks once an option is chosen, the last button becomes
«دیدن پروفایل عطری من», and «شروع دوباره» always resets to the intro with cleared
answers.

**Deterministic core** (`lib/personality/`), pure functions with no React, database or AI:

| File | Responsibility |
| --- | --- |
| `questions.ts` | the 10 Persian questions; each option carries an integer delta vector |
| `scoring.ts` | raw sums → validation → 0–100 normalisation → `scoreQuiz()` |
| `archetypes.ts` | the 8 archetypes + nearest-centroid labelling |
| `quiz-flow.ts` | the `intro/question/result` state machine (prev/next/restart) |
| `labels.ts` | Persian labels for the 9 dimensions |

**Dimensions** (0–100): `social, adventurous, expressive, mysterious, fresh, warm,
experimental, elegant, bold`.

**Normalisation.** For every dimension the engine first computes the reachable raw range
from the quiz itself (`Σ min(0, delta)` → `Σ max(0, delta)`), then maps the user's sum onto
0–100: `round((raw − min) / (max − min) × 100)`, clamped, with a neutral 50 fallback when a
dimension has no range. Picking the maximising option of every question therefore yields
exactly 100, and the minimising option yields 0.

**Archetypes.** The 0–100 vector is labelled with the archetype whose centroid is closest
under squared Euclidean distance (ties resolve to the earlier archetype in `ARCHETYPES`).
The vector stays the source of truth for Phase 3 matching; the archetype never replaces it.

**API** — `POST /api/quiz/submit`:

```jsonc
// request
{ "answers": [{ "questionId": "choice-style", "optionId": "trusted" }, /* … 10 total */ ] }
// 200
{ "result": { "answers": [...], "raw": {...}, "vector": {...}, "archetype": {...} } }
// 400
{ "error": "INVALID_JSON" | "INVALID_ANSWERS", "reason": "…" }
```

Validation is strict (an array, exactly one answer per question, string ids that exist, no
duplicates). The route is a pure function of its input — no DB, no session, no AI — and the
UI falls back to the *same* shared scoring code if the request fails, so the result screen
always works.

**Unknown/duplicate answers are ignored by the scorer** (first answer per question wins,
answer order never matters), which is covered by tests.

**Tests** — 44 tests in `tests/` (Vitest, `node` environment, no DOM):

| File | Covers |
| --- | --- |
| `tests/personality/questions.test.ts` | 10 questions, unique ids, sequential order, Persian copy, valid dimensions, reachable ranges |
| `tests/personality/scoring.test.ts` | 0–100 range, determinism, answer-order independence, 100/0 boundary sheets, duplicate/unknown answers, partial sheets, regression lock of the recorded profiles |
| `tests/personality/archetypes.test.ts` | 8 archetypes, Persian copy, centroid sanity, self-identifying centroids, distance properties |
| `tests/personality/quiz-flow.test.ts` | initial/refresh state, start, select, prev/next limits, completeness, result guard, restart, ordered answers, progress |
| `tests/api/quiz-submit.route.test.ts` | 200 with the deterministic profile, 0–100 output, 400 for malformed JSON and invalid answer sheets |
| `tests/quiz/quiz-ui.test.tsx` | SSR render smoke checks: intro copy, question + radio options, Persian progress label, result card (uses `react-dom/server`, no jsdom/browser) |

**Tuning.** Questions/deltas live in `questions.ts`, archetype centroids in
`archetypes.ts` and the recorded expected profiles in `tests/personality/scoring.test.ts`
(the tests fail loudly when the product assumptions change — update them deliberately).

**Not part of Phase 1:** season/occasion/budget questions, perfume recommendations, AI
explanations, persistence and analytics.

---

## Phase 2 — database & fragrance data (implemented)

**Schema** (`prisma/schema.prisma`) — 5 models, 4 enums, applied to Supabase via the
initial migration `20250920_phase2_init_schema`:

| Model | Purpose | Key constraints |
| --- | --- | --- |
| `Store` | Perfume shop (tenant) | `slug` unique, `active` soft-delete |
| `Perfume` | Inventory item | `@@unique([storeId, slug])`, `@@index([storeId, active, inStock])` |
| `FragranceProfile` | 9 matching axes (0–100, required) + optional descriptors | `perfumeId` unique (1:1), cascade with perfume |
| `QuizSession` | Historical quiz attempt | `@@index([storeId, status, createdAt])`, nullable vector until COMPLETED |
| `Recommendation` | Deterministic Top-N result | `@@unique([quizSessionId, rank])`, `@@index([perfumeId])`, `score` Float |

**Relationships** — Store→many Perfume (cascade), Perfume→one Store, Perfume→1:1
FragranceProfile (cascade), QuizSession→optional Store (SetNull), QuizSession→many
Recommendation (cascade), Recommendation→one Perfume (Restrict — never delete history).

**Helpers** — `lib/fragrance/profile.ts` provides pure, DB-free mapping between rows and
the app's types: `MATCHING_DIMENSIONS`, `SHARED_DIMENSIONS`, `DESCRIPTOR_DIMENSIONS`,
`toMatchingVector`, `toFragranceProfileView`, `clampProfileValue`, `isProfileValue`.

**Seed** — `npm run db:seed` (idempotent upserts, fictional demo data: 2 stores + 5
perfumes with profiles). Never required for production.

**Prisma 7 notes** — `prisma migrate dev` needs a shadow database, which the Supabase
pooler does not allow creating. Phase 2 therefore used the documented hosted-database
workflow: `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`
to generate the SQL, then `prisma migrate deploy` to apply it. This is the correct Prisma
7 pattern for managed databases; it preserves the existing `prisma.config.ts` style.

**Not part of Phase 2** — matching engine, recommendation API, AI/Qwen, admin UI,
analytics, authentication, payments, ecommerce integrations.

---

## Phase 3 — deterministic matching engine (implemented)

The product's core: personality vector + store inventory → ranked Top-N, **without any AI**.

**Formula** (`lib/matching/score.ts`, documented in code):

```
difference = userValue - perfumeValue          // per dimension, 0–100 scale
distance   = sqrt(Σ difference²)               // Euclidean over the 9 axes
MAX_DISTANCE = sqrt(9 × 100²) = 300
similarity = clamp(100 × (1 − distance / MAX_DISTANCE), 0, 100)
```

An exact match is exactly **100**, the maximum possible distance is exactly **0**.
Two scores exist: the **raw score** (used for ranking, unrounded) and the
**presentation score** (`round(score × 10) / 10`, display only — rounding happens once).

**Files**

| File | Role |
| --- | --- |
| `lib/matching/score.ts` | distance → similarity conversion, `MAX_DISTANCE`, presentation rounding |
| `lib/matching/engine.ts` | validation, eligibility, deterministic sort, top N (`DEFAULT_TOP_N = 5`) |
| `lib/matching/repository.ts` | the only Prisma touchpoint: `getEligiblePerfumesForStore(storeId)` (server-side only) |
| `lib/matching/service.ts` | `getRecommendations({ storeId, personalityVector, topN })` |
| `scripts/verify-matching.ts` | `npx tsx scripts/verify-matching.ts` — live check against the seeded dev DB |
| `tests/matching/engine.test.ts` | 22 engine tests, no database required |

**Canonical dimensions** — the nine axes are imported from `MATCHING_DIMENSIONS`
(`lib/fragrance/profile.ts`, which aliases the Phase 1 `PERSONALITY_DIMENSIONS`); they are
never re-declared here.

**Determinism & ranking** — score descending; ties break by ascending `perfumeId`
(a stable field, never database row order); identical inputs give byte-identical output.

**Eligibility policy** — candidates are excluded (counted in `MatchResult.excluded`) when
they are inactive, belong to another store, or have a missing/out-of-range matching
profile. No values are ever substituted for missing data.

**Store isolation** — enforced in the SQL `where` (`storeId` + `active: true`) *and*
re-checked inside the pure engine (defence in depth); the demo seed now contains a second
store to prove isolation in both directions.

**No AI** — zero LLM calls in this phase; recommendations work with all AI services down.

---

## Phase 4 — AI layer (implemented)

The AI layer is an **optional enrichment** on top of the deterministic engine. It never
chooses, scores or ranks: the engine runs first, and the AI only writes Persian copy or
fills optional descriptor fields.

| File | Role |
| --- | --- |
| `lib/ai/provider.ts` | provider-agnostic `AIProvider` contract, config reader, null provider |
| `lib/ai/errors.ts` | leaf error classes (`AiUnavailableError`, `AiRequestError`, `AiResponseError`) — separate to avoid an import cycle |
| `lib/ai/qwen.ts` | the only vendor-aware file: Qwen3.6 over the GaptGPT API (OpenAI-style `/chat/completions`), bearer auth, `AbortController` timeout |
| `lib/ai/perfume-profile.ts` | descriptor/family/notes enrichment prompt + validator |
| `lib/ai/explanation.ts` | «چرا این عطر؟» prompt, Persian-copy validator, explanation helpers |
| `scripts/verify-ai-fallback.ts` | live check that needs no AI credentials |

**Provider selection** — `createAIProvider()` reads `AI_PROVIDER` (default `qwen`; `none`
explicitly disables AI) and returns a *null provider* whenever credentials are missing or
the provider is unknown. The null provider reports itself unavailable and throws
`AiUnavailableError` on use, so a missing key can never break a request.

**Graceful degradation** — the domain helpers return a discriminated `AiOutcome<T>`
(`{ ok: true, value }` | `{ ok: false, reason }`) instead of throwing. A missing provider,
a timeout or an invalid reply all degrade to `{ ok: false }`, and the caller keeps the
deterministic result with `aiAvailable: false`.

**Anti-hallucination, enforced by validators (not just prompts)**

* Scores, ranks and the product list are **never sent** to the model; trait values are
  reduced to Persian bands («بالا/متوسط/پایین») so no number crosses the boundary.
* A profile reply may only contain `descriptors`, `family` and `notes`. Writing any of the
  nine matching axes, or any unknown key, is rejected — the AI can never influence scoring.
* An explanation reply is rejected when it is empty/too long, contains no Persian letters,
  contains any digit or `%`/`٪`, or quotes a product other than the one being explained.
* Every validator runs twice: once in the provider and once in the domain helper, so a
  forgetful future provider still cannot emit invalid copy.
* `perfumeId` always comes from the input, never from the model.

**Tests** — 44 tests in `tests/ai/` (Vitest, `node` env, no network — the Qwen transport is
exercised through an injected fake `fetch`):

| File | Covers |
| --- | --- |
| `tests/ai/provider.test.ts` | config defaults, provider selection, missing creds, `none`, unknown provider, no key leakage |
| `tests/ai/qwen.test.ts` | request shape/bearer auth/token budget, base-URL trimming, JSON in prose, HTTP and non-JSON failures, timeout |
| `tests/ai/perfume-profile.test.ts` | prompt facts, description cap, validator rejects forbidden keys/axes, clamping, `ok:false` degradation |
| `tests/ai/explanation.test.ts` | trait bands, deterministic trait order, digit-free prompt, Persian/digit/foreign-product rejection, success + failure paths |
| `tests/ai/fallback.test.ts` | engine output byte-identical for missing/slow/failing/healthy providers; only `perfumeId`+`explanation` escape |

**Live verification** — `npx tsx scripts/verify-ai-fallback.ts` (read-only, needs the seeded
dev DB) recomputes recommendations before and after an AI attempt and asserts they are
byte-identical, then reports how many explanations were produced. With the current empty
`QWEN_API_KEY`/`QWEN_BASE_URL` it prints `AI available: false` and passes.

**Not part of Phase 4** — no AI is wired into any route, recommendation results are not
persisted, there is no results UI (Phase 5), and the real GaptGPT endpoint has never been
called because no credentials exist yet.

---

## Phase 6A — admin product management (implemented)

The merchant/operator side: manage a store's perfume inventory through an internal
Persian RTL admin surface at `/admin/perfumes`. **Not customer-facing; no
authentication yet** (deliberately deferred — see the note above).

**Flow** — select an active store → see that store's perfumes → create, edit,
toggle فعال/غیرفعال and موجود/ناموجود, and manage the 1:1 fragrance profile. Every
query and mutation is scoped to the selected `storeId`; no unscoped query exists.

| File | Role |
| --- | --- |
| `lib/admin/validation.ts` | pure server-boundary validation: required fields, integer 0–100 axes (from `MATCHING_DIMENSIONS`), enums, URLs, price, slug pattern, boolean strictness + `isPerfumeInStore` guard |
| `lib/admin/repository.ts` | server-only Prisma CRUD: store-scoped list/read/create/update, profile **upsert** (no duplicates), flag toggles, **no delete** |
| `app/admin/perfumes/page.tsx` | list page: store selector, scoped products, status toggles, empty states |
| `app/admin/perfumes/new/page.tsx` | create form |
| `app/admin/perfumes/[id]/edit/page.tsx` | edit form (cross-store id ⇒ «عطر پیدا نشد») |
| `app/admin/perfumes/actions.ts` | server actions: re-validate, mutate, return Persian feedback |
| `components/admin/{PerfumeForm,ProfileEditor,PerfumeToggles}.tsx` | client form/inputs/toggles (no DB access) |

**Store isolation** — enforced in the SQL `where` (`id` + `storeId`) *and* re-checked
with `isPerfumeInStore` before any write; a perfume from another store returns
`PERFUME_NOT_FOUND` and can never be read or modified through the wrong store's admin
context. Tested in `tests/admin/validation.test.ts`.

**Determinism untouched** — creating/editing writes normal application data through
Prisma; the matching engine, `MATCHING_DIMENSIONS`, scoring and ranking are unchanged.
An inactive perfume keeps its profile but disappears from recommendations via the
existing `active: true` filter. `inStock` is managed but **not** used as a filter (a
later business-filter step, per the handoff). Schema: **unchanged**.

**Tests** — 18 tests in `tests/admin/validation.test.ts` (pure, no live DB): valid
payload, required fields, non-integer/out-of-range axes, descriptor rules, enum
membership, URL/price/slug rules, boolean strictness, and the store-isolation guard.

---

## Phase 6B — CSV import (implemented)

Group product import for a selected store at `/admin/perfumes/import`. **Same admin
security posture as 6A: internal MVP, no authentication (deliberately deferred).**

**Flow** — select an active store → upload a CSV (≤ 5 MB, ≤ 5,000 data rows) →
server-side parse + validation + duplicate detection → preview table (تعداد کل / معتبر /
خطادار) → confirm → **atomic** import → success summary. Preview performs **no DB
mutation** (its only DB access is a read-only slug probe); the database changes only
when the user confirms, inside one `prisma.$transaction` — all rows or none.

**CSV contract** (delimiter `,`, first row = header, UTF-8/BOM, quoted fields, CRLF):

| Group | Columns | Rules |
| --- | --- | --- |
| Required product | `name, brand, slug, gender, price` | non-empty; `gender` ∈ `MEN/WOMEN/UNISEX`; `price` ≥ 0; `slug` matches the app slug pattern, unique per store |
| Required matching dimensions | `social, adventurous, expressive, mysterious, fresh, warm, experimental, elegant, bold` | integer 0–100, no clamping/rounding — invalid values are rejected |
| Optional product | `description, productUrl, imageUrl, inStock, active` | URLs validated when present; booleans accept only `true`/`false`; defaults `inStock=true`, `active=true` |
| Optional descriptors | `sweet, woody, spicy, floral, citrus, aquatic, smoky, clean, longevity, projection` | integer 0–100 when present; omitted ⇒ `0` |
| Optional metadata | `family, notes, season, occasion` | `notes` uses `\|` as the item separator (`Bergamot\|Lavender\|Musk`); empty ⇒ `[]`; `season`/`occasion` must be schema enums |

Unknown columns are rejected — including `storeId`: the target store always comes from
the admin selector, never from the file. Duplicate slugs (inside the file **or** against
the selected store) block the import; the same slug may exist in a **different** store
(store isolation). Import is **create-only** — existing perfumes are never updated.

**Safety properties** — the confirm action re-parses and re-validates the raw CSV
server-side (a client "validated" flag is never trusted), re-checks active store and
slug uniqueness at commit time (race-window protection, with the DB `@@unique([storeId,
slug])` constraint as the final guard), and rolls back completely on any failure —
never a partial import. **No AI is involved anywhere in the import.**

| File | Role |
| --- | --- |
| `lib/admin/csv/contract.ts` | canonical columns + centralised limits (5 MB / 5,000 rows) |
| `lib/admin/csv/parser.ts` | pure RFC-4180 parser: quoted fields, `""` escapes, CRLF, BOM, header validation (required/unknown/duplicate) |
| `lib/admin/csv/validate.ts` | row-level validation mapping into the Phase 6A `validatePerfumePayload` (single validation authority) |
| `lib/admin/csv/service.ts` | server-only preview (read-only) + atomic confirmed import |
| `app/admin/perfumes/import/{page,actions}.tsx?` | page + server actions |
| `components/admin/CsvImportFlow.tsx` | client flow: store select, upload, preview table, confirm (disabled on any error) |

**Tests** — 57 new pure/mocked tests: parser (17), row validation (29), service with a
mocked Prisma (11) covering read-only preview, in-file + against-store duplicates,
atomicity, commit-time re-validation and rollback reporting.

---

## Phase 7 — analytics foundation & admin dashboard (implemented)

Merchant-facing analytics at `/admin/analytics`, built on **persisted events only** —
no fake data, no external analytics platform, no chart library. Same admin posture as
6A/6B: internal MVP, **no authentication (deliberately deferred)**.

**Data model** — one new table, `AnalyticsEvent` (migration
`20260922_phase7_analytics_events`, applied via `migrate diff` + `deploy`): append-only
anonymous events with optional `storeId` (SetNull FK), opaque `sessionId`, optional
`perfumeId`, `eventType`, small `metadata Json?`, `createdAt`; indexes
`(storeId, createdAt)` and `(perfumeId, eventType, createdAt)`. `QuizSession`/
`Recommendation` were **not** repurposed — Phase 5 keeps its no-persistence flow, and a
dedicated lightweight event table was the smaller change.

**Event contract** (`lib/analytics/types.ts` — the single source of truth):

| Event | Fires when | Notes |
| --- | --- | --- |
| `QUIZ_STARTED` | the shopper explicitly enters the quiz (intro → Q1 button) | never on homepage loads or renders |
| `QUIZ_COMPLETED` | a valid personality vector exists (API **and** offline fallback path) | once per attempt |
| `RESULT_VIEWED` | the result page successfully renders a valid profile | recorded **server-side** in `lib/results/service.ts` — a server component renders once per navigation, so no client dedupe needed |
| `RECOMMENDATIONS_SHOWN` | the result page has a valid recommendation list | `metadata: { count: N }` |
| `PERFUME_CLICKED` | a real click on a recommendation's product link | `onClick` only; viewing the card records nothing |

**Architecture** — `lib/analytics/` (types → pure contract; service → single validated
write path + dashboard reads; repository → the only Prisma touchpoint, append-only
create, store+time-scoped aggregation queries; client → fetch-only fire-and-forget
dispatcher; flow-tracker → once-per-attempt lifecycle guards keyed by an opaque
`sessionStorage` token). `POST /api/events` re-validates everything server-side:
unknown event types, malformed ids, foreign-store perfume ids and metadata > 1 KB are
rejected; no internals ever reach the client.

**KPI definitions** — completion rate = `QUIZ_COMPLETED / QUIZ_STARTED × 100`; click
rate = `PERFUME_CLICKED / RECOMMENDATIONS_SHOWN × 100` (the literal contract —
denominator is result pages shown, so multiple clicks on one page can exceed 100%);
zero denominators render `—`, never NaN/Infinity. Top-perfume table: recommendations
sum `metadata.count` per `RECOMMENDATIONS_SHOWN`, clicks count rows, per-perfume click
rate = `clickCount / recommendationCount` (`—` when 0). Daily roll-up table by UTC day
(the documented MVP timezone assumption); presets امروز / ۷ روز اخیر / ۳۰ روز اخیر,
default ۷ روز, inclusive-from/exclusive-to boundaries applied server-side.

**Privacy** — no IP, email, phone, name, precise location, fingerprint or advertising
IDs. The session token is a random opaque string that never leaves the visitor's own
`sessionStorage`; metadata is a small validated object (e.g. counts), never PII.
Analytics is approximate and **not fraud-proof**.

**Store isolation** — every dashboard query filters on the selected `storeId`; the
catalog join for the top-perfume table is store-scoped; the write path rejects
perfume ids that do not belong to the event's store. AI is never involved.

**Tests** — 41 new mocked/pure tests in `tests/analytics/` (types 11, repository 10,
service 12, flow-tracker 8). Suite total **250/250 across 23 files**.

---

## Phase 8 — embeddable widget (implemented)

The customer-facing quiz/result experience any perfume store can embed with one
copy/paste script tag (no npm, no build step for the merchant).

**Installation** — copied from Admin → «کد نصب ویجت» (`/admin/perfumes`), which shows
the exact snippet for the selected store with the real store ID:

```html
<script src="https://YOUR-DOMAIN/widget.js" data-store-id="YOUR_STORE_ID"></script>
```

The URL comes from `NEXT_PUBLIC_APP_URL` (documented in `.env.example`; unset locally,
the admin page falls back to the request origin — no production hostname is invented).

**Architecture** — `public/widget.js` is a dependency-free vanilla loader: it locates
its own `<script>`, validates `data-store-id`, guards duplicate initialization, derives
the base URL from its own `src` (overridable via `data-base-url`), and mounts an
**iframe** at `/widget?store=…`. The iframe is the CSS isolation boundary — complete
two-way isolation from hostile merchant CSS (verified with `public/widget-demo.html`,
a deliberately hostile merchant-page simulator with a manual checklist). Shadow DOM
was evaluated and rejected: it would require shipping a separate React bundle with a
new build step, while the iframe reuses the app's real components with zero
dependencies. The page auto-sizes the frame via a `postMessage` resize bridge
(origin-checked in the loader). The customer stays on the merchant site (§31) —
product links open the merchant's own product pages.

**Public APIs** (reflected-origin CORS — `Access-Control-Allow-Origin` echoes the
request origin, never `*`; no credentials involved; OPTIONS preflight handled):

| Endpoint | Purpose | Validation |
| --- | --- | --- |
| `GET /api/widget/config?storeId=…` | store exists + active → `{ storeId, storeName, active }` only | id format, DB active check; 400/404 without internals |
| `POST /api/widget/recommend` | `{ storeId, personalityVector }` → customer-safe Top-N | store active, all nine vector axes strict 0–100 integers, then the existing Phase 3 repository + engine (untouched) |

The browser never scores anything and never receives the inventory (§13). The payload
exposes only customer-safe fields (`perfumeId` is the minimum identifier needed for
click analytics). AI explanations reuse the Phase 4 abstraction server-side; the
widget never knows a provider exists, and `aiAvailable: false` keeps the list intact.

**Analytics** — the widget passes its store id into every event: QUIZ_STARTED /\
QUIZ_COMPLETED via the once-per-attempt flow tracker (reset on widget start/restart),
RESULT_VIEWED / RECOMMENDATIONS_SHOWN emitted client-side after the recommendation
response, PERFUME_CLICKED on real product-link clicks (a card without `productUrl`
renders no CTA and invents no URL). This closes Phase 7's null-storeId limitation for
widget traffic. No new event types; no PII.

**Persian states** — «عطر خودتو پیدا کن ✨» CTA · loading «در حال پیدا کردن عطر مناسب
تو...» · unavailable «این فروشگاه در حال حاضر در دسترس نیست.» · failure «فعلاً
نتونستیم پیشنهادها رو آماده کنیم. لطفاً دوباره تلاش کن.» · empty inventory «فعلاً عطری
برای پیشنهاد در این فروشگاه ثبت نشده.»

**Tests** — 28 new tests in `tests/widget/` (contract 12, routes 12, loader/page 4),
mocked Prisma + SSR, no live DB in the suite. Suite total **278/278 across 26 files**.
Live HTTP smoke test passed (20 checks): config validation, store isolation both
directions, deterministic ranking, all five events with the widget storeId, foreign
perfume rejection, inactive exclusion, full cleanup (events back to baseline). Manual
browser verification: `public/widget-demo.html` with a 10-point checklist (automated
browser testing was not performed in this environment).

---

## Phase 9 — store attribution for standalone quiz traffic (implemented)

Closes the last recorded Phase 7/8 analytics limitation: standalone (non-widget) quiz
traffic previously recorded `QUIZ_STARTED` / `QUIZ_COMPLETED` with `storeId = null`,
because the standalone quiz had no store context.

**How it works** — `/quiz` accepts an optional `?store=<storeId>` search param (parsed
with the same allow-list validation as `/result` via `parseResultsParams` semantics in
`lib/results/params.ts`). The quiz page passes the validated store id into the existing
`Quiz` component; the pure quiz-flow state machine carries it unchanged and the result
link includes `&store=…` (omitted when it equals the default store, as with the existing
results param serializer). `QuizResultCard`'s analytics now attribute both quiz events
to that store. Widget traffic is unchanged — it already pinned its own store id.

**Bug found & fixed during live verification** — the standalone `/result` page crashed
with `Event handlers cannot be passed to Client Component props`: `RecommendationCard`
had carried a Phase 7 `PERFUME_CLICKED` `onClick` without a `"use client"` directive (the widget path used its own card, so only the standalone page was broken).
Fixed by adding `"use client"` to `components/results/RecommendationCard.tsx`; verified
live in the browser afterward.

**Verification** — live browser run through the real `/quiz` flow for both seeded demo
stores: quiz events recorded with the correct per-store attribution, results URL pins
`store=` for the non-default store, `/result` renders store-scoped recommendations
(second store showed only its own perfume), widget regression pass stayed green, and all
test events were cleaned up afterwards (DB back to its 0-event baseline).

**Tests** — 8 new tests in `tests/quiz/store-attribution.test.tsx` (param round-trips
+ store-aware SSR). Suite total **286/286 across 27 files**.

---

## Phase 11 — AI-assisted fragrance profiling (implemented)

The admin form gained one control: **«تولید پروفایل با هوش مصنوعی»**. It collects the
perfume's factual information (stored row on edit, form fields on create), calls the
existing `AIProvider` abstraction server-side (never Qwen directly, no keys in the
browser), validates the reply through the existing Phase 4 validator (unknown keys,
forbidden matching axes, non-numeric values and non-object replies are rejected;
in-range numbers are clamped to 0–100), and fills the descriptor inputs for review.

**Generation never writes.** The admin reviews the suggestion and saves through the
normal form, so the `Perfume 1 → 1 FragranceProfile` relation stays intact and a
manual profile is never overwritten without an explicit save. When AI is unavailable,
timed out, or returned garbage, the admin sees a Persian recoverable message and the
manual profile editor remains fully usable — the feature is an enhancement, never a
dependency.

**Factual-safety note:** the numeric profile is an *internal recommendation-model
estimate* inferred from the supplied facts — not manufacturer data and not a measured
claim about longevity, projection or ingredients. The prompt forbids inventing notes,
claims or facts; the validator enforces the field contract.

---

## Matching validation — 100-perfume test dataset (implemented)

The deterministic engine was validated at scale against a synthetic 100-perfume
test inventory in a dedicated, clearly-identified store (**Matching Test Store**,
`store-matching-test`) — the existing demo stores are untouched.

**Out-of-stock eligibility fix** — the documented contract "out-of-stock products
are never recommended" was previously unenforced (`inStock` was never read by the
matching path; an out-of-stock perfume could rank first). Minimal fix:
`MatchCandidateInput.inStock` (required), loaded by the matching repository, and
one eligibility check in the engine — scoring, ranking, tie-breaks and store
isolation unchanged. Regression tests cover exclusion even when an out-of-stock
perfume would otherwise rank first.

**Dataset** — `scripts/seed-matching-dataset.ts` (idempotent, safe to re-run):
100 fictional perfumes (`mt-###-<cluster>`, brand "MT Synthetic Lab", URLs under
`matching-test.invalid`) in 10 clusters (fresh/citrus, aquatic, woody/elegant,
woody/smoky, sweet/floral, sweet/bold, spicy/bold, clean/minimal, dark/smoky,
balanced/unisex), spanning MEN/WOMEN/UNISEX, with 9 inactive, 14 out-of-stock
(1 both) → 78 eligible. Test data only — not a real merchant's inventory.

**Verification** — matrix tests A–L in `tests/matching/dataset-matrix.test.ts`
(the project's only live-DB suite, read-only) plus the reporting script
`scripts/verify-matching-dataset.ts`: per-cluster top-5 rankings, zero
out-of-stock/inactive/foreign-store leaks across every profile, byte-identical
deterministic repeats, topN behavior, clean empty-inventory handling.

---

## Architecture principles

```
Store website → Persian RTL widget → 10-question quiz → personality vector
   → fragrance profile → inventory filters → deterministic matching engine
   → Top 3–5 perfumes → AI-written Persian explanation → product links
```

* **The LLM never decides the recommendation.** Scoring, filtering and ranking are
  deterministic application code (`lib/matching/**`). AI only enriches perfume profiles
  and writes explanations; if the AI provider is down, recommendations still render.
* **Provider-agnostic AI.** Application code depends on an `AIProvider` interface in
  `lib/ai/`, not on a vendor SDK. Current provider: **Qwen3.6 via the GaptGPT API**,
  selected through the `AI_PROVIDER` env var, with DeepSeek-style providers addable later.
* **No local model/server infrastructure.**

---

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Next.js 16.3.5 (App Router, Turbopack) |
| UI | React 19.2.8, TypeScript 5 (strict), Tailwind CSS v4 |
| Fonts | Vazirmatn via `next/font/google` (Persian, RTL) |
| Lint | ESLint 9 + `eslint-config-next` (flat config) |
| Tests | Vitest 5 (`node` environment, `tests/**/*.test.ts`) |
| Database | PostgreSQL via Prisma ORM 7.10.0 + `@prisma/adapter-pg` |
| Runtime | Node.js 20.9+ (developed on Node 24.21.0) |

---

## Prerequisites

* Node.js 20.9+ and npm
* A PostgreSQL database (Phase 2+): local server, Docker container or a hosted instance
* Git (optional — not installed on the current dev machine)

---

## Setup

```bash
npm install                 # install dependencies
copy .env.example .env      # Windows; use `cp` on bash
npm run db:generate         # generate the Prisma client into lib/generated/prisma
npm run dev                 # http://localhost:3000
```

Validation commands:

```bash
npm test            # Vitest (152 tests, 16 files)
npx tsx scripts/verify-matching.ts  # live matching-engine check against the seeded dev DB
npx tsx scripts/verify-ai-fallback.ts  # Phase 4: AI fallback (needs no AI credentials)
npm run lint        # ESLint
npm run typecheck   # next typegen && tsc --noEmit
npm run typegen     # generate Next.js route types only
npm run build       # production build
npm run db:validate # prisma validate
```

> **Windows note:** if `npm` fails in PowerShell with
> *"npm.ps1 cannot be loaded because running scripts is disabled"*, either run npm from
> `cmd.exe` (as done during Phase 0) or set
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

> **Prisma client is generated code.** `lib/db.ts` imports from
> `lib/generated/prisma/client`, which is git-ignored and created by
> `npm run db:generate`.

> **npm 11 `allowScripts` note:** `npm install` warned that 3 packages have install
> scripts not covered by npm's `allowScripts` gate (`prisma`, `@prisma/engines`,
> `unrs-resolver`). The toolchain works without them (Prisma 7 uses the WASM query
> compiler plus the schema-engine binary shipped inside `@prisma/engines`, and ESLint
> resolved normally), but on a machine where the native postinstall steps are required,
> run `npm install-scripts approve prisma @prisma/engines unrs-resolver` and re-install.

---

## Environment variables

| Variable | Phase | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | 2+ | PostgreSQL connection string (read by `prisma.config.ts`) |
| `AI_PROVIDER` | 4+ | Selects the AI provider implementation (`qwen`) |
| `QWEN_API_KEY` | 4+ | GaptGPT API key for Qwen3.6 — **server-side only** |
| `QWEN_BASE_URL` | 4+ | Base URL of the GaptGPT API endpoint |
| `QWEN_MODEL` | 4+ | Model identifier (`qwen3.6`) |
| `QWEN_TIMEOUT_MS` | 4+ | Hard timeout for AI calls, in milliseconds |

`.env` is git-ignored; `.env.example` holds placeholders. Secrets are never hardcoded and
never exposed to the browser. Prisma ORM 7 does **not** auto-load `.env`, which is why
`prisma.config.ts` imports `dotenv/config`.

---

## Project structure

```
fragrance-ai/
├── app/
│   ├── layout.tsx            # Persian RTL root layout (lang="fa" dir="rtl")
│   ├── page.tsx              # Phase 0 status page (becomes the widget entry point)
│   ├── globals.css           # Tailwind v4 theme tokens (premium dark, Persian typography)
│   ├── quiz/page.tsx         # Phase 1: quiz route (renders components/quiz/Quiz.tsx)
│   ├── result/               # Phase 5: page, loading, error boundary
│   ├── admin/{,perfumes,analytics}                       # Phases 6–7
│   └── api/{quiz/submit,recommendations,perfumes/import,events}   # submit is Phase 1
├── components/quiz/          # Phase 1: Quiz, Question, QuizOption, ProgressBar, QuizResultCard
├── components/{results,widget}/              # results = Phase 5; widget = Phase 8
├── lib/
│   ├── db.ts                 # Prisma client singleton (lazy, PostgreSQL driver adapter)
│   ├── personality/          # Phase 1: questions, scoring, archetypes, quiz-flow, labels
│   ├── persian.ts            # Persian digit / percentage formatting helpers
│   ├── fragrance/            # Phases 2–3: profile helpers, categories
│   ├── matching/             # Phase 3: filters, score, ranking
│   ├── ai/                   # Phase 4: provider.ts, qwen.ts, perfume-profile.ts, explanation.ts
│   └── analytics/            # Phase 7
├── prisma/
│   ├── schema.prisma         # Phase 0: datasource + generator; models land in Phase 2
│   └── migrations/           # Phase 2
├── public/                   # Phase 8: widget.js
├── types/                    # Shared domain contracts (personality, fragrance, recommendation)
├── tests/                    # Vitest suites (personality + API route) — Phase 1
├── prisma.config.ts          # Prisma ORM 7 config (schema path, migrations, datasource)
├── vitest.config.mts         # Vitest config (`@/*` alias, node environment)
└── .env.example
```

Directories reserved for later phases are committed with a `.gitkeep` placeholder.

---

## Domain contracts (Phase 0 scope)

`types/` holds provider- and database-agnostic contracts only — no behaviour:

* `types/personality.ts` — the 9 dimensions (`social, adventurous, expressive,
  mysterious, fresh, warm, experimental, elegant, bold`), `PersonalityVector` (0–100),
  answer scoring vectors, the 8 archetypes, and quiz question/option shapes.
* `types/fragrance.ts` — the 15 fragrance dimensions (0–100), `Gender` / `Occasion` /
  `Season` unions, and `PerfumeRecord`, the shape the matching engine consumes.
* `types/recommendation.ts` — `ScoredRecommendation`, request/response shapes, and the
  `aiAvailable` flag used for graceful AI degradation.

Scoring/ranking logic (Phases 1 & 3) and the Prisma models (Phase 2) are intentionally
absent.

---

## AI provider notes

* Qwen3.6 is reached through the **GaptGPT API** provider: `$0.25 / 1M` input tokens and
  `$2.00 / 1M` output tokens. A typical request (~2,000 in / 500 out) costs ≈ `$0.0015`, so
  the current promotional credit (≈ `$0.50`) covers roughly 300+ requests of that size, and
  the credit is temporary. Prompts must therefore stay small.
* The API key stays server-side (only `lib/ai/**` reads it) and the deterministic
  recommendation flow must remain fully functional without the provider.

---

## Open items carried into the next phases

1. **No local `psql`, Docker or Git on this machine** — the database is a hosted Supabase
   instance, and `prisma migrate dev` is unusable there (see the Prisma 7 note in Phase 2).
2. `QWEN_BASE_URL` (GaptGPT API endpoint) and a real `QWEN_API_KEY` are still missing; the
   values in `.env` are empty placeholders, so the live AI path is unverified.
3. The AI layer is now consumed by the results page only; recommendation results are
   still never persisted (sessions/recommendations tables remain unwritten).
4. **Test runner:** Vitest 5 (Phase 1). Node's built-in `node --test` was rejected because
   its native TypeScript execution cannot resolve the `@/*` alias or extensionless imports.
   Installing Vitest required bumping `@types/node` from `^20` to `^24` — its peer range is
   `^22 || >=24`, and Node 24 is the actual runtime.
5. Phase 1 is stateless: no session persistence, no analytics events, and
   `POST /api/quiz/submit` stores nothing.
6. Season / occasion / budget inputs are not part of the Phase 1 quiz — they belong to the
   filtering step (Phase 3).


