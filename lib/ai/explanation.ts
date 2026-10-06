import { createHash } from "node:crypto";

import { AiResponseError } from "@/lib/ai/errors";
import type {
  AIProvider,
  AiExplanationInput,
  AiExplanationResult,
  AiOutcome,
} from "@/lib/ai/provider";
import { PERSONALITY_LABELS } from "@/lib/personality/labels";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { PersonalityDimension, PersonalityVector } from "@/types/personality";

/**
 * Persian «چرا این عطر؟» explanations (Phase 4).
 *
 * The AI writes copy **after** the deterministic engine has already chosen and
 * ranked the perfumes. Consequently:
 *  - scores and ranks are never sent to the model and never come back from it;
 *  - trait values are sent as qualitative bands («بالا/متوسط/پایین») so the model
 *    cannot echo numbers, and digits are rejected in the reply anyway;
 *  - a reply that mentions another product, a percentage or a made-up number is
 *    rejected, and the caller falls back to showing the deterministic result
 *    without an explanation.
 */

export const EXPLANATION_SYSTEM_PROMPT = [
  "You write short Persian (فارسی) reasons for a perfume recommendation.",
  "Reply with ONE JSON object and nothing else (no prose, no markdown).",
  "Write natural, friendly Iranian Persian in the second person (تو).",
  "Mention only the perfume you are given; never invent or name other products.",
  "Never use numbers, digits or percentages, and never claim scores or rankings.",
  "Never make medical or psychological claims; this is a taste-based suggestion,",
  "not a psychological diagnosis.",
  'Return JSON like {"explanation":"..."}.',
].join("\n");

/** Bounds keep the copy short (cheap tokens) and reject runaway replies. */
export const EXPLANATION_MIN_CHARS = 40;
export const EXPLANATION_MAX_CHARS = 400;

/** How many traits are described to the model ("top" traits by value). */
export const DEFAULT_TRAIT_LIMIT = 4;

const TRAIT_HIGH = 70;
const TRAIT_MEDIUM = 45;

/** Persian band for a 0–100 trait value — no numbers reach the model. */
export function describeTraitLevel(value: number): string {
  if (value >= TRAIT_HIGH) {
    return "بالا";
  }

  return value >= TRAIT_MEDIUM ? "متوسط" : "پایین";
}

/**
 * The user's most pronounced traits, in a stable order.
 *
 * Sorted by value descending; ties keep the canonical dimension order (the sort
 * is stable), so the prompt is deterministic for identical vectors.
 */
export function selectUserTraits(
  vector: PersonalityVector,
  limit: number = DEFAULT_TRAIT_LIMIT,
): Array<{ label: string; value: number }> {
  return PERSONALITY_DIMENSIONS.map((dimension: PersonalityDimension) => ({
    label: PERSONALITY_LABELS[dimension],
    value: vector[dimension],
  }))
    .sort((a, b) => b.value - a.value)
    .slice(0, Math.max(1, limit));
}

/** Builds the user prompt: facts + trait bands only (no scores, no ranks). */
export function buildExplanationUserPrompt(input: AiExplanationInput): string {
  const traits = input.traits
    .map((trait) => `${trait.label}: ${describeTraitLevel(trait.value)}`)
    .join("، ");

  const description = (input.perfume.description ?? "").trim().slice(0, 300);

  return [
    `پروفایل عطری کاربر: «${input.archetypeLabel}»`,
    `ویژگی‌های برجسته کاربر: ${traits || "(نامشخص)"}`,
    `عطر پیشنهادی: ${input.perfume.name} از برند ${input.perfume.brand}`,
    `خانواده رایحه: ${(input.perfume.family ?? "").trim() || "(نامشخص)"}`,
    `نُت‌های رایحه: ${(input.perfume.notes ?? []).join("، ") || "(نامشخص)"}`,
    description === "" ? "" : `توضیح فروشنده: ${description}`,
    'خروجی JSON: {"explanation":"..."}',
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const PERSIAN_LETTER = /[\u0600-\u06FF]/;
const DIGITS = /[0-9\u06F0-\u06F9\u0660-\u0669]/;
const PERCENT_SIGNS = /[%٪]/;
const QUOTED_SEGMENTS = /«([^»]+)»|"([^"]+)"/g;

function normalise(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Rejects a reply that quotes a product other than the one being explained.
 *
 * The catalogue is not available here, so instead of trying to recognise unknown
 * perfumes we enforce a simple rule: if the model quotes a name, that name must be
 * the perfume or its brand. Models quote when they invent products, which is
 * exactly the failure this catches.
 */
function quotedSegmentsAreKnown(text: string, allowed: string[]): boolean {
  const known = allowed.map(normalise).filter((name) => name !== "");

  for (const match of text.matchAll(QUOTED_SEGMENTS)) {
    const quoted = normalise(match[1] ?? match[2] ?? "");

    if (quoted === "") {
      continue;
    }

    const isKnown = known.some(
      (name) => quoted.includes(name) || name.includes(quoted),
    );

    if (!isKnown) {
      return false;
    }
  }

  return true;
}

/**
 * Validates a model reply into an `AiExplanationResult`.
 *
 * Rejected (throws `AiResponseError`): non-object payloads, unknown keys, empty or
 * over-long text, text without Persian letters, any digits/percentages (so no
 * invented scores can leak into the UI) and quoted names that are not this perfume.
 * `perfumeId` always comes from the input, never from the model.
 */
export function validateAiExplanation(
  raw: unknown,
  input: AiExplanationInput,
): AiExplanationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AiResponseError("AI explanation response was not a JSON object.");
  }

  const payload = raw as Record<string, unknown>;

  for (const key of Object.keys(payload)) {
    if (key !== "explanation") {
      throw new AiResponseError(
        `AI explanation response contained a forbidden key: ${key}.`,
      );
    }
  }

  if (typeof payload.explanation !== "string") {
    throw new AiResponseError("AI explanation response had no explanation text.");
  }

  const explanation = normalise(payload.explanation);

  if (explanation.length < EXPLANATION_MIN_CHARS) {
    throw new AiResponseError("AI explanation was too short.");
  }

  if (explanation.length > EXPLANATION_MAX_CHARS) {
    throw new AiResponseError("AI explanation was too long.");
  }

  if (!PERSIAN_LETTER.test(explanation)) {
    throw new AiResponseError("AI explanation was not written in Persian.");
  }

  if (DIGITS.test(explanation) || PERCENT_SIGNS.test(explanation)) {
    throw new AiResponseError(
      "AI explanation contained numbers or percentages, which are never allowed.",
    );
  }

  if (
    !quotedSegmentsAreKnown(explanation, [input.perfume.name, input.perfume.brand])
  ) {
    throw new AiResponseError(
      "AI explanation mentioned a product that was not the recommended one.",
    );
  }

  return { perfumeId: input.recommendation.perfumeId, explanation };
}

/**
 * Runs one explanation and never throws: any failure (no provider, timeout,
 * invalid reply) becomes `{ ok: false, reason }` so the deterministic result is
 * still shown, just without the extra Persian copy.
 */
export async function generateExplanation(
  provider: AIProvider,
  input: AiExplanationInput,
): Promise<AiOutcome<AiExplanationResult>> {
  try {
    const result = await provider.generateRecommendationExplanation(input);

    // Defence in depth: providers are supposed to validate their own output, but
    // this layer re-checks it so no invalid copy (digits, other products, wrong
    // language) can ever escape — even if a future provider forgets to validate.
    return {
      ok: true,
      value: validateAiExplanation({ explanation: result.explanation }, input),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "unknown AI error",
    };
  }
}

/* ------------------------------------------------ explanation cache (MVP) */

/** How long a generated explanation stays reusable (1 hour). */
export const EXPLANATION_CACHE_TTL_MS = 60 * 60 * 1000;

/** Upper bound on cached explanations; the oldest entry is evicted first. */
export const EXPLANATION_CACHE_MAX_ENTRIES = 500;

interface ExplanationCacheEntry {
  explanation: string;
  createdAt: number;
  expiresAt: number;
}

interface CachedGenerationSuccess {
  ok: true;
  explanation: string;
}
interface CachedGenerationFailure {
  ok: false;
  reason: string;
}
type CachedGenerationOutcome = CachedGenerationSuccess | CachedGenerationFailure;

/**
 * In-process, content-addressed cache for generated explanations.
 *
 * The results page and the widget both regenerate the same explanations on
 * every render (up to `RESULTS_TOP_N` Qwen calls each). This cache keys
 * explanations by the *exact* prompt sent to the model — see
 * `explanationCacheKey` — so a cache hit can never return copy that was
 * written for different prompt inputs: change the perfume facts, the archetype
 * or a trait band and the key changes automatically.
 *
 * Deliberately module-local (no Redis, no database): a restart or dev module
 * reload simply clears it, which only costs another provider call — never
 * correctness. Failures are never stored, so a broken render stays retryable.
 */
const explanationCache = new Map<string, ExplanationCacheEntry>();

/**
 * Same-process stampede guard: identical concurrent requests share one
 * provider call instead of racing to spend credits. Entries are always removed
 * in `finally`, so a failed generation can never leave a promise stuck.
 */
const inflightExplanations = new Map<string, Promise<CachedGenerationOutcome>>();

/**
 * Content-addressed cache key: SHA-256 over the complete prompt actually sent
 * to Qwen (system prompt, a NUL separator, then the rendered user prompt).
 * Any change to the prompt — perfume facts, archetype label, trait bands,
 * prompt wording — yields a new key without any invalidation code.
 */
export function explanationCacheKey(input: AiExplanationInput): string {
  return createHash("sha256")
    .update(EXPLANATION_SYSTEM_PROMPT)
    .update("\u0000")
    .update(buildExplanationUserPrompt(input))
    .digest("hex");
}

/** Returns the cached explanation, lazily dropping expired entries. */
function readExplanationCache(key: string): string | null {
  const entry = explanationCache.get(key);

  if (entry === undefined) {
    return null;
  }

  if (Date.now() >= entry.expiresAt) {
    explanationCache.delete(key);
    return null;
  }

  return entry.explanation;
}

/**
 * Stores a successful explanation, keeping the map bounded: re-inserting the
 * key refreshes its position, and the oldest entry is evicted before the
 * configured maximum would be exceeded. No background cleanup — expired
 * entries are removed on read or by this eviction.
 */
function writeExplanationCache(key: string, explanation: string): void {
  explanationCache.delete(key);

  while (explanationCache.size >= EXPLANATION_CACHE_MAX_ENTRIES) {
    const oldest = explanationCache.keys().next();
    if (oldest.done) {
      break;
    }
    explanationCache.delete(oldest.value);
  }

  const now = Date.now();
  explanationCache.set(key, {
    explanation,
    createdAt: now,
    expiresAt: now + EXPLANATION_CACHE_TTL_MS,
  });
}

/** Test hook: empties the cache and any in-flight promises between tests. */
export function resetExplanationCacheForTests(): void {
  explanationCache.clear();
  inflightExplanations.clear();
}

/** Test hook: current number of cached explanations. */
export function explanationCacheSizeForTests(): number {
  return explanationCache.size;
}

/**
 * One explanation with caching layered around the unchanged Phase 4 call:
 * cache hit → no provider call; concurrent identical requests → one shared
 * provider call; success (already validated by `generateExplanation`) →
 * stored; failure → never stored, so the next render retries.
 */
async function generateCachedExplanation(
  provider: AIProvider,
  input: AiExplanationInput,
): Promise<AiOutcome<AiExplanationResult>> {
  const key = explanationCacheKey(input);

  const cached = readExplanationCache(key);
  if (cached !== null) {
    return {
      ok: true,
      value: { perfumeId: input.recommendation.perfumeId, explanation: cached },
    };
  }

  const shared = inflightExplanations.get(key);
  if (shared !== undefined) {
    const outcome = await shared;
    return outcome.ok
      ? {
          ok: true,
          value: {
            perfumeId: input.recommendation.perfumeId,
            explanation: outcome.explanation,
          },
        }
      : outcome;
  }

  const generation = (async (): Promise<CachedGenerationOutcome> => {
    try {
      const outcome = await generateExplanation(provider, input);

      if (outcome.ok) {
        writeExplanationCache(key, outcome.value.explanation);
        return { ok: true, explanation: outcome.value.explanation };
      }

      // Failures are returned but never cached.
      return outcome;
    } finally {
      inflightExplanations.delete(key);
    }
  })();

  inflightExplanations.set(key, generation);

  const outcome = await generation;
  return outcome.ok
    ? {
        ok: true,
        value: {
          perfumeId: input.recommendation.perfumeId,
          explanation: outcome.explanation,
        },
      }
    : outcome;
}

/**
 * Convenience for the results layer: explanations for a ranked list, keyed by
 * perfume id. Sequential on purpose (small credit, no rate-limit surprises) and
 * resilient — failed items are simply omitted, duplicates keep the first result.
 *
 * Each item goes through the process-local prompt-hash cache (see
 * `explanationCacheKey`): identical prompts reuse the stored explanation and
 * make no provider call, while the within-batch duplicate-id skip below is
 * unchanged.
 */
export async function generateExplanations(
  provider: AIProvider,
  inputs: readonly AiExplanationInput[],
): Promise<Map<string, string>> {
  const explanations = new Map<string, string>();

  for (const input of inputs) {
    if (explanations.has(input.recommendation.perfumeId)) {
      continue;
    }

    const outcome = await generateCachedExplanation(provider, input);

    if (outcome.ok) {
      explanations.set(outcome.value.perfumeId, outcome.value.explanation);
    }
  }

  return explanations;
}
