/**
 * Bottle artwork for the recommendation list, chosen by scent character.
 *
 * The demo/reference catalog stores no image URL at all (`imageUrl: null` for
 * every curated perfume), so demo cards used to fall back to the bare bottle
 * glyph. These six bundled bottle illustrations give those cards real artwork
 * WITHOUT inventing merchant data: nothing here claims a store sells a
 * perfume, and no external URL is ever referenced — the files ship in
 * `public/perfumes/bottles/`.
 *
 * The mapping is a pure function of the perfume's accords — the same scent
 * data the engine's `axesFromAccords()` reads (see
 * `lib/fragrance/axis-derivation.ts`). Each known accord votes for exactly one
 * of the six scent characters; the most-voted character wins, ties break in a
 * fixed distinctive-first order, and a perfume with no recognisable accord
 * gets the house default. The same accords always resolve to the same bottle,
 * so a card never changes its artwork between renders, servers or rebuilds.
 * No new fields are introduced and nothing is hardcoded per perfume: only the
 * accords travel, and unknown accords are simply skipped.
 *
 * Decoration only — never a scoring input. Merchant inventory keeps
 * precedence: this module is only consulted when the engine returned no
 * `imageUrl` (see `components/results/RecommendationCard.tsx`).
 *
 * Files: `public/perfumes/bottles/bottle-*.webp` — 16:10 center crops (the
 * card's image panel ratio), one shared warm/cream art direction, no brand
 * labels.
 */

/** The six scent characters, one bottle illustration each. */
export type BottleId =
  | "terracotta"
  | "wine"
  | "champagne"
  | "amber-apothecary"
  | "rose-gold"
  | "oud";

/** The bundled bottle illustration per scent character. */
export const BOTTLE_ARTWORK: Record<BottleId, string> = {
  terracotta: "/perfumes/bottles/bottle-terracotta.webp",
  wine: "/perfumes/bottles/bottle-wine.webp",
  champagne: "/perfumes/bottles/bottle-champagne.webp",
  "amber-apothecary": "/perfumes/bottles/bottle-amber-apothecary.webp",
  "rose-gold": "/perfumes/bottles/bottle-rose-gold.webp",
  oud: "/perfumes/bottles/bottle-oud.webp",
};

/**
 * Accord → scent character, in disjoint buckets over the same accord
 * vocabulary the engine's axis derivation reads. Presentation-only grouping:
 * it chooses decoration and is never an input to eligibility, scoring or
 * ranking, so the axis map itself is neither forked nor touched.
 */
const ACCORD_BOTTLE_MAP: Record<string, BottleId> = {
  // warm → terracotta
  sweet: "terracotta",
  gourmand: "terracotta",
  vanilla: "terracotta",
  honey: "terracotta",
  creamy: "terracotta",
  lactonic: "terracotta",
  musky: "terracotta",
  // oriental/rich → wine
  "warm spicy": "wine",
  spicy: "wine",
  "soft spicy": "wine",
  tobacco: "wine",
  chypre: "wine",
  mossy: "wine",
  // fresh/light → champagne
  fresh: "champagne",
  aquatic: "champagne",
  citrus: "champagne",
  aromatic: "champagne",
  green: "champagne",
  marine: "champagne",
  ozonic: "champagne",
  fruity: "champagne",
  tropical: "champagne",
  salty: "champagne",
  "fresh spicy": "champagne",
  conifer: "champagne",
  mineral: "champagne",
  // resinous → amber-apothecary
  amber: "amber-apothecary",
  balsamic: "amber-apothecary",
  woody: "amber-apothecary",
  earthy: "amber-apothecary",
  // floral → rose-gold
  floral: "rose-gold",
  "white floral": "rose-gold",
  rose: "rose-gold",
  iris: "rose-gold",
  powdery: "rose-gold",
  "yellow floral": "rose-gold",
  lavender: "rose-gold",
  aldehydic: "rose-gold",
  // smoky → oud
  smoky: "oud",
  oud: "oud",
  leather: "oud",
  animalic: "oud",
};

/**
 * Tie-break order, distinctive characters first: a tied vote resolves to the
 * most characterful scent rather than the generic fresh/warm buckets.
 */
const BOTTLE_PRIORITY: readonly BottleId[] = [
  "oud",
  "amber-apothecary",
  "rose-gold",
  "wine",
  "terracotta",
  "champagne",
];

/** The house default when no accord carries a recognisable scent signal. */
export const DEFAULT_BOTTLE: BottleId = "terracotta";

/**
 * The scent character for a perfume's accords — stable for the lifetime of
 * the accords. Unknown or absent accords are skipped, never guessed.
 */
export function bottleForAccords(
  accords: readonly string[] | null | undefined,
): BottleId {
  const votes = new Map<BottleId, number>();

  if (accords) {
    for (const accord of accords) {
      if (typeof accord !== "string") continue;
      const bottle = ACCORD_BOTTLE_MAP[accord.trim().toLowerCase()];
      if (!bottle) continue;
      votes.set(bottle, (votes.get(bottle) ?? 0) + 1);
    }
  }

  let best: BottleId = DEFAULT_BOTTLE;
  let bestVotes = 0;
  for (const bottle of BOTTLE_PRIORITY) {
    const count = votes.get(bottle) ?? 0;
    if (count > bestVotes) {
      best = bottle;
      bestVotes = count;
    }
  }
  return best;
}

/** The bundled bottle illustration for a perfume's accords. */
export function artworkForAccords(
  accords: readonly string[] | null | undefined,
): string {
  return BOTTLE_ARTWORK[bottleForAccords(accords)];
}
