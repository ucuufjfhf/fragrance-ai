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

/**
 * Convenience for the results layer: explanations for a ranked list, keyed by
 * perfume id. Sequential on purpose (small credit, no rate-limit surprises) and
 * resilient — failed items are simply omitted, duplicates keep the first result.
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

    const outcome = await generateExplanation(provider, input);

    if (outcome.ok) {
      explanations.set(outcome.value.perfumeId, outcome.value.explanation);
    }
  }

  return explanations;
}
