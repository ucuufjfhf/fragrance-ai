import type { MatchCandidateInput } from "@/types/recommendation";
import { clampProfileValue } from "@/lib/fragrance/profile";
import {
  axesFromAccords,
  PERSONALITY_AXES,
  type PersonalityAxis,
} from "@/lib/fragrance/axis-derivation";
import referenceData from "@/data/fragrantica/reference.json";

// ONE source of truth: the accord→axis map and its derivation live in the
// shared axis-derivation utility (also used by the AI fallback path).
export { axesFromAccords, PERSONALITY_AXES };
export type { PersonalityAxis };

/**
 * REFERENCE_CATALOG candidate source — the demo/recommendation-experience mode.
 *
 * Candidates come from the bundled Fragrantica reference dataset
 * (`data/fragrantica/reference.json`), NOT from any store's `Perfume` rows.
 * The matching engine is completely unaware of this: it receives plain
 * `MatchCandidateInput[]` exactly as it does for merchant inventory, so there
 * is still ONE deterministic engine and zero scoring changes (see
 * `lib/matching/engine.ts`).
 *
 * Data provenance / licensing (preserved from the grounding note):
 * the dataset is the Kaggle "Fragrantica.com Fragrance Dataset" bundled for
 * INTERNAL use only. This mode demonstrates the recommendation experience;
 * it never claims a merchant sells these perfumes, never fabricates product
 * URLs, and the underlying data is never exposed raw through a public API.
 *
 * The 9 matching axes do not exist in the reference dataset (it only has
 * accords/notes), so each perfume gets a DETERMINISTIC, DEMO-QUALITY vector
 * derived from its own accords via the fixed map below. Two runs over the
 * same data always produce identical vectors, so rankings stay byte-stable
 * like every other engine input. These are presentation-grade estimates for
 * demos — not curated product data.
 */

/** Reference entries are always "in stock" and "active" for the engine. */
export const REFERENCE_STORE_ID = "reference-catalog";

/** Title-cases a dataset slug ("le-male-le-parfum" → "Le Male Le Parfum"). */
function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** The bundled, lazily-normalized reference entries (one pass, then cached). */
let cachedCandidates: MatchCandidateInput[] | null = null;

export function getReferenceCatalogCandidates(): MatchCandidateInput[] {
  if (cachedCandidates) {
    return cachedCandidates;
  }

  const candidates: MatchCandidateInput[] = (
    referenceData as { entries: ReferenceEntry[] }
  ).entries.map((entry, index) => {
      const vector = axesFromAccords(entry.a);
      const clamped = Object.fromEntries(
        PERSONALITY_AXES.map((axis) => [axis, clampProfileValue(vector[axis])]),
      ) as Record<PersonalityAxis, number>;

      return {
        // Stable synthetic id — never collides with cuid-style merchant ids.
        perfumeId: `ref-${index}-${entry.b}-${entry.n}`,
        storeId: REFERENCE_STORE_ID,
        name: titleFromSlug(entry.n),
        brand: titleFromSlug(entry.b),
        slug: null,
        // NO product URL exists in the dataset: never fabricated (see module doc).
        productUrl: null,
        imageUrl: null,
        active: true,
        inStock: true,
        profile: clamped,
      };
  });

  cachedCandidates = candidates;
  return candidates;
}

interface ReferenceEntry {
  b: string;
  n: string;
  g: string;
  t: string[];
  a: string[];
  y: string | null;
  r: number;
  rc: number;
}
