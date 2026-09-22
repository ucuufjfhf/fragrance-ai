import { getArchetypeById } from "@/lib/personality/archetypes";
import { MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";
import type { Archetype, PersonalityVector } from "@/types/personality";

/**
 * Pure URL contract between the quiz (client) and the results page (server).
 *
 * The quiz posts its answers to `POST /api/quiz/submit` (Phase 1), and the
 * computed profile is shared state — the same pure scorer runs on both sides.
 * Instead of persisting a session (a later phase), the results page receives
 * the profile through the URL: nine 0–100 integers, the archetype id and an
 * optional store id. This module is the only place that knows that shape.
 *
 * Pure by design (no React, no DB, no AI): it is unit-testable without a DOM
 * and safe to import from both client and server components. Validation is
 * strict — a malformed or out-of-range value is an error, never a substituted
 * number, mirroring the engine's own "no invented data" policy.
 */

/** Store used when the quiz does not carry one (Phase 1 is stateless). */
export const DEFAULT_RESULTS_STORE_ID = "store-demo-perfume-shop";

/** Upper bound on candidates shown, matching the engine's default Top-N. */
export const RESULTS_TOP_N = 5;

export interface ResultsParams {
  vector: PersonalityVector;
  archetype: Archetype;
  storeId: string;
}

export type ResultsParamsParse =
  | { ok: true; value: ResultsParams }
  | { ok: false; reason: string };

/** Query-string keys, kept in one place so both sides can never drift. */
const VECTOR_KEY_PREFIX = "v_";
const ARCHETYPE_KEY = "archetype";
const STORE_KEY = "store";

function firstValue(
  source: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = source[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

/**
 * Serialises the quiz outcome into a query string (without the leading `?`).
 *
 * Vector values are already validated 0–100 integers by the Phase 1 scorer;
 * they are emitted as-is so a round-trip is lossless.
 */
export function serializeResultsParams(
  vector: PersonalityVector,
  archetypeId: string,
  storeId?: string,
): string {
  const search = new URLSearchParams();

  for (const dimension of MATCHING_DIMENSIONS) {
    search.set(`${VECTOR_KEY_PREFIX}${dimension}`, String(vector[dimension]));
  }

  search.set(ARCHETYPE_KEY, archetypeId);

  if (storeId !== undefined && storeId !== DEFAULT_RESULTS_STORE_ID) {
    search.set(STORE_KEY, storeId);
  }

  return search.toString();
}

/**
 * Parses and validates the results query params.
 *
 * Rejected (with a developer-facing reason): missing/out-of-range/non-integer
 * vector values, an unknown or missing archetype id, an empty store id. The
 * caller shows its own Persian error state; nothing is ever substituted.
 */
export function parseResultsParams(
  input: Record<string, string | string[] | undefined> | undefined,
): ResultsParamsParse {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "results params are missing." };
  }

  const vectorEntries: Array<[keyof PersonalityVector, number]> = [];

  for (const dimension of MATCHING_DIMENSIONS) {
    const raw = firstValue(input, `${VECTOR_KEY_PREFIX}${dimension}`);

    if (raw === undefined || raw.trim() === "") {
      return { ok: false, reason: `missing vector value for "${dimension}".` };
    }

    const value = Number(raw);

    if (!Number.isInteger(value) || value < 0 || value > 100) {
      return {
        ok: false,
        reason: `vector value for "${dimension}" must be an integer between 0 and 100.`,
      };
    }

    vectorEntries.push([dimension, value]);
  }

  const archetypeId = firstValue(input, ARCHETYPE_KEY)?.trim() ?? "";
  const archetype = getArchetypeById(archetypeId);

  if (!archetype) {
    return { ok: false, reason: `unknown archetype "${archetypeId}".` };
  }

  const storeId = firstValue(input, STORE_KEY)?.trim() || DEFAULT_RESULTS_STORE_ID;

  return {
    ok: true,
    value: {
      vector: Object.fromEntries(vectorEntries) as PersonalityVector,
      archetype,
      storeId,
    },
  };
}
