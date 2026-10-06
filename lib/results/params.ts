import { getArchetypeById } from "@/lib/personality/archetypes";
import {
  audienceToUrlToken,
  parseAudienceToken,
  type AudienceGender,
} from "@/lib/audience";
import { PROFILE_AXES } from "@/lib/fragrance/profile";
import type { Archetype, PersonalityVector } from "@/types/personality";

/**
 * Pure URL contract between the quiz (client) and the results page (server).
 *
 * The quiz posts its answers to `POST /api/quiz/submit` (Phase 1), and the
 * computed profile is shared state — the same pure scorer runs on both sides.
 * Instead of persisting a session (a later phase), the results page receives
 * the profile through the URL: nine 0–100 integers, the archetype id, an
 * optional store id and an optional compact audience token
 * (`?target=men|women`). This module is the only place that knows that shape.
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

/** Query-string key for the recommendation source (demo vs merchant). */
const SOURCE_KEY = "source";
/** The two candidate sources the results page can render from. */
const VALID_SOURCES = ["REFERENCE_CATALOG", "MERCHANT_INVENTORY"] as const;

export type ResultsRecommendationSource = (typeof VALID_SOURCES)[number];

/** The default is the demo experience. */
export const DEFAULT_RESULTS_SOURCE: ResultsRecommendationSource = "REFERENCE_CATALOG";

function parseSource(raw: string | undefined): ResultsRecommendationSource | null {
  if (raw === undefined || raw.trim() === "") {
    return null;
  }
  return (VALID_SOURCES as readonly string[]).includes(raw)
    ? (raw as ResultsRecommendationSource)
    : null;
}

export type ResultsParamsParse =
  | { ok: true; value: ResultsParams }
  | { ok: false; reason: string };

export interface ResultsParams {
  vector: PersonalityVector;
  archetype: Archetype;
  storeId: string;
  /** Where the ranked candidates come from; defaults to the demo catalog. */
  source: ResultsRecommendationSource;
  /**
   * The audience the shopper selected on its own step before Q1
   * (`?target=men|women`).
   *
   * `null` = no selection → the engine applies no gender filter at all, exactly
   * like before the audience feature. It is NOT part of the personality vector
   * and never affects scoring.
   */
  audience: AudienceGender | null;
}

/** Query-string keys, kept in one place so both sides can never drift. */
const VECTOR_KEY_PREFIX = "v_";
const ARCHETYPE_KEY = "archetype";
const STORE_KEY = "store";
const TARGET_KEY = "target";

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
  source?: ResultsRecommendationSource,
  audience?: AudienceGender | null,
): string {
  const search = new URLSearchParams();

  for (const dimension of PROFILE_AXES) {
    search.set(`${VECTOR_KEY_PREFIX}${dimension}`, String(vector[dimension]));
  }

  search.set(ARCHETYPE_KEY, archetypeId);

  if (storeId !== undefined && storeId !== DEFAULT_RESULTS_STORE_ID) {
    search.set(STORE_KEY, storeId);
  }

  // The default source is omitted to keep demo URLs short and unchanged.
  if (source !== undefined && source !== DEFAULT_RESULTS_SOURCE) {
    search.set(SOURCE_KEY, source);
  }

  // The audience is an optional add-on: without one the query string stays
  // byte-identical to the pre-audience contract, so existing links keep their
  // legacy (unfiltered) behaviour.
  if (audience === "MEN" || audience === "WOMEN") {
    search.set(TARGET_KEY, audienceToUrlToken(audience));
  }

  return search.toString();
}

/**
 * Parses and validates the results query params.
 *
 * Rejected (with a developer-facing reason): missing/out-of-range/non-integer
 * vector values, an unknown or missing archetype id, an empty store id. A
 * malformed or unknown `target` is NEVER a rejection — it degrades to "no
 * audience" so legacy links keep working. The caller shows its own Persian
 * error state; nothing is ever substituted.
 */
export function parseResultsParams(
  input: Record<string, string | string[] | undefined> | undefined,
): ResultsParamsParse {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "results params are missing." };
  }

  const vectorEntries: Array<[keyof PersonalityVector, number]> = [];

  for (const dimension of PROFILE_AXES) {
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

  const rawStore = firstValue(input, STORE_KEY)?.trim() || "";
  const storeId = rawStore || DEFAULT_RESULTS_STORE_ID;

  // Source default is store-presence aware: a URL that carries a real store
  // context is a merchant embed (MERCHANT_INVENTORY), while the storeless
  // default experience is the demo catalog (REFERENCE_CATALOG). An explicit
  // valid `source` param always wins.
  const source =
    parseSource(firstValue(input, SOURCE_KEY)) ??
    (rawStore ? "MERCHANT_INVENTORY" : DEFAULT_RESULTS_SOURCE);

  // Deliberately lenient: an absent, empty, differently-cased or malformed
  // `target` resolves to `null` (no audience) instead of failing the page, so a
  // legacy or hand-edited link keeps rendering unfiltered recommendations.
  const audience = parseAudienceToken(firstValue(input, TARGET_KEY));

  return {
    ok: true,
    value: {
      vector: Object.fromEntries(vectorEntries) as PersonalityVector,
      archetype,
      storeId,
      source,
      audience,
    },
  };
}
