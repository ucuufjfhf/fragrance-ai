import type { Gender } from "@/types/fragrance";

/**
 * The customer's audience selection.
 *
 * This is a MERCHANDISING preference asked once, before the first personality
 * question — deliberately NOT a personality dimension:
 *  - it never enters the nine-axis personality vector;
 *  - it never influences archetype or similarity scoring;
 *  - it never changes the 10-question bank (the quiz stays exactly 10 questions).
 *
 * Its only effect is an early inventory eligibility filter inside the matching
 * engine (`lib/matching/engine.ts`), applied before any scoring happens:
 *   MEN   → MEN + UNISEX
 *   WOMEN → WOMEN + UNISEX
 *   no selection → no gender filter (legacy URLs keep behaving exactly as before)
 *
 * Pure and framework-free (no React, no Prisma, no AI), so it is importable from
 * both the client quiz flow and the server matching path.
 */

/** The two audiences a shopper can pick. */
export const AUDIENCE_GENDERS = ["MEN", "WOMEN"] as const;

export type AudienceGender = (typeof AUDIENCE_GENDERS)[number];

/** The approved customer-facing question (one screen of its own, before Q1). */
export const AUDIENCE_QUESTION =
  "عطری که می‌خواهید پیدا کنید، بیشتر برای چه کسی است؟";

/** The approved customer-facing options, in display order. */
export const AUDIENCE_OPTIONS: readonly {
  id: AudienceGender;
  label: string;
}[] = [
  { id: "MEN", label: "برای آقایان" },
  { id: "WOMEN", label: "برای خانم‌ها" },
];

/** True only for the two internal audience values. */
export function isAudienceGender(value: unknown): value is AudienceGender {
  return (
    typeof value === "string" &&
    (AUDIENCE_GENDERS as readonly string[]).includes(value)
  );
}

/**
 * Perfume genders eligible for one audience selection.
 *
 * Documented merchandising rule: a shopper looking for a men's perfume may also
 * see UNISEX perfumes (and vice versa). Anything else is excluded.
 */
export function eligibleGendersFor(
  audience: AudienceGender,
): readonly Gender[] {
  return audience === "MEN" ? ["MEN", "UNISEX"] : ["WOMEN", "UNISEX"];
}

/**
 * The engine's audience predicate.
 *
 *  - no selection (`null`/`undefined`) → every candidate stays eligible, so
 *    existing URLs, saved links and the demo experience are unaffected;
 *  - an unknown value is treated the same way (legacy) instead of throwing, so a
 *    malformed parameter can never break a recommendation run;
 *  - with a real selection, only the audience's eligible genders pass — an
 *    absent/unknown candidate gender is excluded, never guessed.
 */
export function isGenderEligibleFor(
  candidateGender: unknown,
  targetGender: AudienceGender | null | undefined,
): boolean {
  if (!isAudienceGender(targetGender)) {
    return true;
  }

  return (eligibleGendersFor(targetGender) as readonly unknown[]).includes(
    candidateGender,
  );
}

/* ------------------------------------------------------------ URL contract */

/** Compact URL tokens for the results contract (`?target=men`). */
const URL_TOKENS: Record<AudienceGender, string> = {
  MEN: "men",
  WOMEN: "women",
};

/** The `target` query value for an audience selection. */
export function audienceToUrlToken(audience: AudienceGender): string {
  return URL_TOKENS[audience];
}

/**
 * Lenient inverse of `audienceToUrlToken`.
 *
 * Missing, empty, differently-cased or unknown values all resolve to `null`
 * (= no audience selected), which is the legacy behaviour — a malformed link
 * must degrade, never crash.
 */
export function parseAudienceToken(
  raw: string | null | undefined,
): AudienceGender | null {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (value === "") {
    return null;
  }

  const match = AUDIENCE_GENDERS.find(
    (audience) => URL_TOKENS[audience] === value,
  );

  return match ?? null;
}
