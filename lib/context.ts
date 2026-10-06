import type { Occasion, Season } from "@/types/fragrance";

/**
 * The shopper's optional purchase context (season + occasion).
 *
 * These are merchandising preferences asked ONCE, on an optional step after
 * the personality result and before recommendations:
 *  - they never enter the nine-axis personality vector;
 *  - they never influence the archetype or the similarity score;
 *  - they never change the 10-question bank or the audience step.
 *
 * Their only effect is a hard eligibility filter inside the matching engine
 * (`lib/matching/engine.ts`), applied BEFORE any scoring, in the documented
 * order: store → active → inStock → audience → season → occasion → complete
 * profile → 5-axis similarity.
 *
 * Semantics (documented, deterministic):
 *  - season: the shopper's choice narrows candidates to perfumes tagged with
 *    that season OR tagged `ALL`; `null`/«فرقی نمی‌کنه» = no season filter;
 *  - occasion: the shopper's choice narrows candidates to perfumes tagged with
 *    exactly that occasion (the schema has NO "all occasions" value, so
 *    «فرقی نمی‌کنه» = no occasion filter — no ALL token is ever invented);
 *  - a perfume with no stored tag is UNKNOWN and is excluded when a filter is
 *    active — never guessed, mirroring the audience policy.
 *
 * Pure and framework-free (no React, no Prisma, no AI), importable from both
 * the client quiz flow and the server matching path.
 */

/** Seasons the shopper can pick (the stored `ALL` tag is not a choice here). */
export type SeasonFilter = Exclude<Season, "ALL">;

/** The four restrictive season choices, in display order. */
export const SEASON_FILTERS: readonly SeasonFilter[] = [
  "SPRING",
  "SUMMER",
  "AUTUMN",
  "WINTER",
];

/** Every occasion stored on a profile — the schema has no ALL value. */
export const OCCASIONS: readonly Occasion[] = [
  "DAILY",
  "DATE",
  "PARTY",
  "OFFICE",
  "FORMAL",
];

/** The approved heading for the optional context step. */
export const CONTEXT_HEADING = "حالا کمی دقیق‌ترش کنیم";

/** The approved season question. */
export const SEASON_QUESTION = "بیشتر برای چه فصلی می‌خوای؟";

/** The approved occasion question. */
export const OCCASION_QUESTION = "بیشتر برای چه موقعیتی می‌خوای؟";

/** «فرقی نمی‌کنه» — the explicit "no filter" choice in both groups. */
export const NO_PREFERENCE_LABEL = "فرقی نمی‌کنه";

/** Internal option id for the «فرقی نمی‌کنه» choice (maps to `null`). */
export const NO_PREFERENCE_ID = "NONE";

/** Season options with the approved Persian labels, in display order. */
export const SEASON_OPTIONS: readonly {
  id: SeasonFilter;
  label: string;
}[] = [
  { id: "SPRING", label: "بهار" },
  { id: "SUMMER", label: "تابستان" },
  { id: "AUTUMN", label: "پاییز" },
  { id: "WINTER", label: "زمستان" },
];

/** Occasion options with the approved Persian labels, in display order. */
export const OCCASION_OPTIONS: readonly { id: Occasion; label: string }[] = [
  { id: "DAILY", label: "روزمره" },
  { id: "DATE", label: "قرار" },
  { id: "PARTY", label: "مهمانی" },
  { id: "OFFICE", label: "محل کار" },
  { id: "FORMAL", label: "رسمی" },
];

/** True only for the four restrictive season values. */
export function isSeasonFilter(value: unknown): value is SeasonFilter {
  return (
    typeof value === "string" &&
    (SEASON_FILTERS as readonly string[]).includes(value)
  );
}

/** True only for the five stored occasion values. */
export function isOccasion(value: unknown): value is Occasion {
  return (
    typeof value === "string" && (OCCASIONS as readonly string[]).includes(value)
  );
}

/**
 * The engine's season predicate.
 *
 *  - no selection (`null`/`undefined`/invalid) → every candidate stays
 *    eligible, so existing URLs and flows behave exactly as before;
 *  - with a selection, a perfume is eligible when it is tagged with that
 *    season OR tagged `ALL`;
 *  - an absent/unknown candidate tag is excluded when a filter is active —
 *    unknown is never guessed to be a match.
 */
export function isSeasonEligible(
  candidateSeason: unknown,
  targetSeason: SeasonFilter | null | undefined,
): boolean {
  if (!isSeasonFilter(targetSeason)) {
    return true;
  }

  return candidateSeason === targetSeason || candidateSeason === "ALL";
}

/**
 * The engine's occasion predicate.
 *
 *  - no selection → every candidate stays eligible (legacy behaviour);
 *  - with a selection, only exactly that occasion passes — the schema has no
 *    "all occasions" value, so nothing else widens the set;
 *  - an absent/unknown candidate tag is excluded when a filter is active.
 */
export function isOccasionEligible(
  candidateOccasion: unknown,
  targetOccasion: Occasion | null | undefined,
): boolean {
  if (!isOccasion(targetOccasion)) {
    return true;
  }

  return candidateOccasion === targetOccasion;
}

/* ------------------------------------------------------------ URL contract */

/** Compact URL tokens for the results contract (`?season=summer`). */
const SEASON_TOKENS: Record<SeasonFilter, string> = {
  SPRING: "spring",
  SUMMER: "summer",
  AUTUMN: "autumn",
  WINTER: "winter",
};

/** Compact URL tokens for the results contract (`?occasion=date`). */
const OCCASION_TOKENS: Record<Occasion, string> = {
  DAILY: "daily",
  DATE: "date",
  PARTY: "party",
  OFFICE: "office",
  FORMAL: "formal",
};

/** The `season` query value for a season choice. */
export function seasonToUrlToken(season: SeasonFilter): string {
  return SEASON_TOKENS[season];
}

/** The `occasion` query value for an occasion choice. */
export function occasionToUrlToken(occasion: Occasion): string {
  return OCCASION_TOKENS[occasion];
}

/**
 * Lenient inverse of `seasonToUrlToken`.
 *
 * Missing, empty, differently-cased, unknown or `all` values all resolve to
 * `null` (= no season filter) — a malformed link must degrade, never crash,
 * exactly like the existing `target` token behaviour.
 */
export function parseSeasonToken(
  raw: string | null | undefined,
): SeasonFilter | null {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (value === "") {
    return null;
  }

  const match = SEASON_FILTERS.find(
    (season) => SEASON_TOKENS[season] === value,
  );

  return match ?? null;
}

/**
 * Lenient inverse of `occasionToUrlToken`.
 *
 * Missing, empty, differently-cased or unknown values all resolve to `null`
 * (= no occasion filter) instead of failing the page.
 */
export function parseOccasionToken(
  raw: string | null | undefined,
): Occasion | null {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (value === "") {
    return null;
  }

  const match = OCCASIONS.find((occasion) => OCCASION_TOKENS[occasion] === value);

  return match ?? null;
}
