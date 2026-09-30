import type { MatchCandidateInput } from "@/types/recommendation";
import {
  axesFromAccords,
  PERSONALITY_AXES,
  type PersonalityAxis,
} from "@/lib/fragrance/axis-derivation";
import { getCuratedDemoPerfumes } from "@/lib/matching/curated-catalog";

// ONE source of truth: the accord→axis map and its derivation live in the
// shared axis-derivation utility (also used by the AI fallback path).
export { axesFromAccords, PERSONALITY_AXES };
export type { PersonalityAxis };

/**
 * REFERENCE_CATALOG candidate source — the demo/recommendation-experience mode.
 *
 * Candidates come from the CURATED 59-perfume demo pool
 * (`data/curated-demo-catalog.json` + `lib/matching/curated-catalog.ts`), NOT
 * from any store's `Perfume` rows and NOT from the raw 23,846-row reference
 * dump. The matching engine is completely unaware of this: it receives plain
 * `MatchCandidateInput[]` exactly as it does for merchant inventory, so there
 * is still ONE deterministic engine and zero scoring changes (see
 * `lib/matching/engine.ts`).
 *
 * Why curated rather than the whole dataset: the raw catalog is dominated by
 * obscure flankers, and resolving a merchandising name against it forces a
 * fuzzy guess. The curated file pins every perfume to an explicit, audited
 * reference slug instead, so zero fuzzy matching happens at runtime.
 *
 * Data provenance / licensing (preserved from the grounding note):
 * the dataset is the Kaggle "Fragrantica.com Fragrance Dataset" bundled for
 * INTERNAL use only. This mode demonstrates the recommendation experience;
 * it never claims a merchant sells these perfumes, never fabricates product
 * URLs, and the underlying data is never exposed raw through a public API.
 *
 * The 9 matching axes do not exist in the reference dataset (it only has
 * accords/notes), so each perfume gets a DETERMINISTIC, DEMO-QUALITY vector
 * derived from its own accords via the fixed `axesFromAccords()` map. Two runs
 * over the same data always produce identical vectors, so rankings stay
 * byte-stable like every other engine input.
 */

/** Reference entries are always "in stock" and "active" for the engine. */
export const REFERENCE_STORE_ID = "reference-catalog";

/** The bundled, lazily-built curated demo candidates (one pass, then cached). */
let cachedCandidates: MatchCandidateInput[] | null = null;

/**
 * The curated demo pool as engine-ready candidates.
 *
 * Display names come from the curated file's own merchandising strings (never
 * reconstructed from slugs), so the demo shows intentional names rather than
 * machine-expanded ones.
 */
export function getReferenceCatalogCandidates(): MatchCandidateInput[] {
  if (cachedCandidates) {
    return cachedCandidates;
  }

  const candidates: MatchCandidateInput[] = getCuratedDemoPerfumes().map(
    (perfume) => ({
      // Stable synthetic id — never collides with cuid-style merchant ids.
      perfumeId: `ref-${perfume.id}`,
      storeId: REFERENCE_STORE_ID,
      name: perfume.name,
      brand: perfume.brand,
      slug: null,
      // NO product URL exists in the dataset: never fabricated (see module doc).
      productUrl: null,
      imageUrl: null,
      active: true,
      inStock: true,
      profile: perfume.profile,
    }),
  );

  cachedCandidates = candidates;
  return candidates;
}
