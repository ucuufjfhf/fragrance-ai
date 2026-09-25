# PROMPT-ENGINEERING HANDOFF — Fiyazh (فیاژ) / fragrance-ai

> **Purpose:** This document is NOT for coding agents (see AI_HANDOFF.md for that).
> This document is for the AI models acting as PROMPT ENGINEERS / PROJECT MANAGERS
> for Majid — Claude, ChatGPT, and Gemini — who take turns writing prompts for
> coding agents based on Majid's free-tier usage limits across the three services.
>
> **How this works:** Majid cannot use one model continuously due to free-tier
> limits, so he rotates between Claude, ChatGPT, and Gemini throughout a work
> session. Each model has NO memory of what the other models did. This document
> is the shared memory layer. Whichever model Majid is currently talking to
> should:
> 1. Read this entire document FIRST before writing any new prompts.
> 2. At the end of a session (or whenever Majid says he needs to switch), output
> an updated version of the relevant sections (mainly "Current State" and
> "Session Log") for Majid to save back into this file.
> 3. Never assume Majid remembers a decision himself — always check this doc.
>
> **Majid's role:** Majid is the product owner and decision-maker. He does not
> write code himself. He relays prompts from us (Claude/GPT/Gemini) to a coding
> agent (Claude Code / similar, running locally at C:\Users\Admin\fragrance-ai),
> and relays the coding agent's reports back to us. We are the "prompt engineers"
> — we design what the coding agent should do, review its reports, and decide
> next steps. Majid speaks Persian; we communicate with him in Persian, and
> write prompts to the coding agent in English.

---

## 1. PROJECT IDENTITY

**Product:** Fiyazh (فیاژ), formerly named `fragrance-ai`. An AI-powered
Persian-language fragrance recommendation platform for Iranian perfume
e-commerce stores. Customers take a 10-question Persian personality quiz;
the system matches them to one of 8 fragrance "archetypes" and recommends
perfumes from the store's own inventory.

**Local project path:** `C:\Users\Admin\fragrance-ai`

**GitHub repo:** `https://github.com/ucuufjfhf/fragrance-ai`

**Business model intent:** B2B SaaS — embed a widget into perfume stores.
Currently pre-first-customer. Majid is in Iran and cannot hold a
Visa/Mastercard, which affects what paid services can be added to the
stack (Postgres-backed rate limiting chosen over external paid services).

**Majid's constraints:**
- Persian speaker; communicate in Persian.
- Relies on coding agents and AI prompt engineers for technical implementation.
- Cannot use foreign payment cards (sanctions).
- Rotates between Claude, ChatGPT, and Gemini free tiers.

---

## 2. HOW WE (CLAUDE / GPT / GEMINI) OPERATE

1. Majid describes the goal.
2. We ask clarifying questions only when critical.
3. We write complete, self-contained, copy-pasteable English prompts for the coding agent with strict validation and constraint rules.
4. Majid relays prompts and returns full agent output.
5. We review and verify independently.
6. Commit discipline: Never commit without passing all gates (test, lint, typecheck, build, prisma validate). Always verify `git log origin/master..HEAD` is empty after pushing.

---

## 3. DECISION LOG SUMMARY

- **#1 The Phase 12.6-C Hallucination Incident:** Always verify claims against actual git tree and real command outputs.
- **#2 Rate Limiting:** Postgres-backed shared counter table (`RateLimitCounter`), no external Redis.
- **#3 Admin Auth:** Global shared-secret (`ADMIN_ACCESS_SECRET`) for single-merchant operation. Revisit if onboarding multi-tenant third-party stores.
- **#4 Widget CORS:** Locked strictly to `Store.websiteUrl`.
- **#5 Warm Visual Redesign:** Warm ivory (`#FAF7F2`), copper accent (`#B5652D`), forest green secondary (`#4A5D4E`). Persian fonts: SG Kara (SemiBold) & Estedad (Regular). Zero-dependency custom SVG icons in `components/ui-icons.tsx`.
- **#6 Dynamic Archetype Colors:** Scoped CSS variables applied dynamically across results & recommendation views.
- **#7 Animated Trait Bars:** Scroll-triggered bar fill implemented. Missing: synchronized counting numbers and trailing pulse effect.
- **#8 Ambient Background:** Planned blurred radial-gradient accent blobs + subtle SVG noise overlay.
- **#9 Fragrantica Grounding:** Internal reference data (`data/fragrantica/reference.json`) used purely for prompt enrichment grounding, not inventory import.

---

## 4. TECHNICAL REFERENCE

- **Stack:** Next.js 16.3.5, React 19.2, Prisma 7.10.0, Supabase PostgreSQL, TypeScript, Tailwind CSS v4, Netlify. Node v24.21.0, npm 11.19.0.
- **Tests baseline:** 556 passing across 49 test files.

---

## 5. CURRENT STATE

**Last updated by:** Gemini
**Current Commit:** `8b76d8f` (Merged visual redesign baseline + Fragrantica reference-data grounding).
**Git State:** Pushed and clean on `master`.

**In-flight / Next Priorities:**
1. Progress bar enhancement (Decision #7): Synchronized counting-number animation + trailing glow/pulse.
2. Ambient background treatment (Decision #8): CSS/SVG radial blobs + noise overlay for archetype results.
3. Production deployment: Netlify deployment (`npx netlify deploy --build --prod`) to sync live site with master (`8b76d8f`).
