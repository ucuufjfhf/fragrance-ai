import { AiResponseError } from "@/lib/ai/errors";
import type {
  AIProvider,
  AiOutcome,
  AiPerfumeProfileInput,
  AiPerfumeProfileResult,
} from "@/lib/ai/provider";
import {
  DESCRIPTOR_DIMENSIONS,
  MATCHING_DIMENSIONS,
  clampProfileValue,
} from "@/lib/fragrance/profile";
import type { FragranceDimension } from "@/types/fragrance";

/**
 * AI enrichment of *optional* fragrance descriptors (Phase 4).
 *
 * Scope, enforced by the validator rather than trusted from the prompt:
 *  - writable: the 10 descriptor dimensions, `family`, `notes`;
 *  - read-only: the nine matching axes — a response that tries to set them (or any
 *    other key) is rejected, so the AI can never influence the deterministic score;
 *  - never touched: name, brand, price, stock, product URLs, descriptions.
 *
 * A perfume without enrichment simply keeps its stored profile and the matching
 * engine keeps working: this module is an enhancement, never a dependency.
 */

export const PROFILE_SYSTEM_PROMPT = [
  "You enrich structured fragrance metadata for a Persian perfume shop app.",
  "Reply with ONE JSON object and nothing else (no prose, no markdown).",
  "Base every value only on the perfume information you are given.",
  "Never invent facts, performance claims, prices, stock or brand history.",
  "Never mention scores, percentages, rankings or other products.",
  'Allowed top-level keys: "descriptors", "family", "notes".',
  `"descriptors" may only contain these integer keys, each 0-100: ${DESCRIPTOR_DIMENSIONS.join(", ")}.`,
  `Never include any other key. These keys are forbidden: ${MATCHING_DIMENSIONS.join(", ")}.`,
  '"family" is a short English fragrance family label.',
  '"notes" is an array of up to 6 short Persian note names.',
].join("\n");

/** Defensive cap on the human description we forward (keeps prompts cheap). */
export const PROFILE_DESCRIPTION_MAX_CHARS = 400;

function formatDescriptors(
  descriptors: AiPerfumeProfileInput["descriptors"],
): string {
  const entries = DESCRIPTOR_DIMENSIONS.filter(
    (dimension) => typeof descriptors?.[dimension] === "number",
  ).map((dimension) => `${dimension}=${String(descriptors?.[dimension])}`);

  return entries.length > 0 ? entries.join(", ") : "none recorded";
}

/** Builds the user prompt from facts only — no scores, ranks or other products. */
export function buildProfileUserPrompt(input: AiPerfumeProfileInput): string {
  const description = (input.description ?? "")
    .trim()
    .slice(0, PROFILE_DESCRIPTION_MAX_CHARS);

  return [
    `Perfume: ${input.name}`,
    `Brand: ${input.brand}`,
    description === "" ? "Description: (none)" : `Description: ${description}`,
    `Family: ${(input.family ?? "").trim() || "(unknown)"}`,
    `Notes: ${(input.notes ?? []).join(", ") || "(unknown)"}`,
    `Existing descriptors: ${formatDescriptors(input.descriptors)}`,
    `Reference profile (read-only, do not repeat or change): ${MATCHING_DIMENSIONS.map(
      (dimension) => `${dimension}=${input.matchingProfile[dimension]}`,
    ).join(", ")}`,
    'Return JSON like {"descriptors":{"woody":70},"family":"woody amber","notes":["عود","چرم"]}.',
  ].join("\n");
}

const ALLOWED_KEYS = ["descriptors", "family", "notes"] as const;
const NOTES_MAX_ITEMS = 8;
const NOTE_MAX_CHARS = 40;
const FAMILY_MAX_CHARS = 60;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Validates and normalises a model reply into an `AiPerfumeProfileResult`.
 *
 * Throws `AiResponseError` for anything unexpected: unknown keys, forbidden
 * matching axes, non-numeric descriptor values, wrong types. Out-of-range
 * *numbers* are clamped instead, which is deterministic and stays inside the
 * documented 0–100 space — inventing a value for a non-number would not be.
 */
export function validateAiProfileResult(
  raw: unknown,
  input: AiPerfumeProfileInput,
): AiPerfumeProfileResult {
  const payload = asRecord(raw);

  if (Object.keys(payload).length === 0) {
    throw new AiResponseError("AI profile response was not a JSON object.");
  }

  for (const key of Object.keys(payload)) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(key)) {
      throw new AiResponseError(
        `AI profile response contained a forbidden key: ${key}.`,
      );
    }
  }

  const descriptors: Partial<Record<FragranceDimension, number>> = {};

  if (payload.descriptors !== undefined) {
    const record = asRecord(payload.descriptors);

    for (const [key, value] of Object.entries(record)) {
      if ((MATCHING_DIMENSIONS as readonly string[]).includes(key)) {
        throw new AiResponseError(
          `AI tried to write a read-only matching axis: ${key}.`,
        );
      }

      if (!(DESCRIPTOR_DIMENSIONS as readonly string[]).includes(key)) {
        throw new AiResponseError(
          `AI profile response contained an unknown descriptor: ${key}.`,
        );
      }

      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new AiResponseError(`descriptor ${key} must be a number.`);
      }

      descriptors[key as FragranceDimension] = clampProfileValue(value);
    }
  }

  const result: AiPerfumeProfileResult = {
    perfumeId: input.perfumeId,
    descriptors,
  };

  if (payload.family !== undefined) {
    if (typeof payload.family !== "string") {
      throw new AiResponseError("family must be a string.");
    }

    const family = payload.family.trim().slice(0, FAMILY_MAX_CHARS);

    if (family !== "") {
      result.family = family;
    }
  }

  if (payload.notes !== undefined) {
    if (!Array.isArray(payload.notes)) {
      throw new AiResponseError("notes must be an array of strings.");
    }

    const notes = payload.notes
      .map((note) => {
        if (typeof note !== "string") {
          throw new AiResponseError("notes must be an array of strings.");
        }

        return note.trim().slice(0, NOTE_MAX_CHARS);
      })
      .filter((note) => note !== "")
      .slice(0, NOTES_MAX_ITEMS);

    if (notes.length > 0) {
      result.notes = notes;
    }
  }

  return result;
}

/**
 * Runs the enrichment and never throws: a missing provider, a timeout or an
 * invalid reply all come back as `{ ok: false, reason }`, so callers keep the
 * stored profile and the deterministic recommendation untouched.
 */
export async function enrichPerfumeProfile(
  provider: AIProvider,
  input: AiPerfumeProfileInput,
): Promise<AiOutcome<AiPerfumeProfileResult>> {
  try {
    const result = await provider.generatePerfumeProfile(input);

    // Defence in depth: re-run the validator over the provider's output so a
    // forgetful or hostile implementation can never write a matching axis or an
    // unknown descriptor into a profile. Clamping is idempotent, so a compliant
    // provider passes this unchanged.
    return {
      ok: true,
      value: validateAiProfileResult(
        {
          descriptors: result.descriptors,
          family: result.family,
          notes: result.notes,
        },
        input,
      ),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "unknown AI error",
    };
  }
}
