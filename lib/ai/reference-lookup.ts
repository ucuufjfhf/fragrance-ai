import referenceData from "@/data/fragrantica/reference.json";

/**
 * Fragrantica reference lookup for AI enrichment grounding.
 *
 * Data source: Kaggle "Fragrantica.com Fragrance Dataset" (fra_cleaned.csv),
 * converted to the compact `data/fragrantica/reference.json` by
 * `scripts/generate-reference-data.py` (dedupe by brand+name slug, accords
 * only — rows without accord data are dropped).
 *
 * PURPOSE AND BOUNDARIES (do not weaken):
 *  - internal AI-enrichment grounding ONLY: the matched row travels into the
 *    enrichment PROMPT as verified reference context, nothing else;
 *  - NEVER shown to customers, never exposed through any customer-facing API
 *    or the widget, and never treated as store inventory (it is not the
 *    `Perfume` model and shares nothing with the matching engine);
 *  - the 9 matching axes are user-personality-derived and are never touched
 *    by this data.
 *
 * The JSON is ~5.8 MB; the dynamic `import()` below keeps it in a lazily
 * loaded server chunk that only the enrichment path ever pulls in.
 */

export interface FragranceReferenceEntry {
  /** Brand, original Fragrantica capitalisation. */
  b: string;
  /** Perfume name, original Fragrantica capitalisation. */
  n: string;
  /** Target audience: MEN / WOMEN / UNISEX. */
  g: string;
  /** Note pyramid, flattened top → middle → base (English). */
  t: string[];
  /** Main accords, strongest first (English, ≤ 5). */
  a: string[];
  /** Release year, when present. */
  y: string | null;
}

const ENTRIES: readonly FragranceReferenceEntry[] = (
  referenceData as {
    accords: string[];
    entries: FragranceReferenceEntry[];
  }
).entries;

/** The controlled accord vocabulary (84 labels) for prompt grounding. */
export const REFERENCE_ACCORD_VOCABULARY: readonly string[] = (
  referenceData as { accords: string[]; entries: FragranceReferenceEntry[] }
).accords;

/**
 * Normalises a name/brand for comparison: lowercase, Unicode NFKD stripped of
 * diacritics (é → e), `&` → "and", any run of non-alphanumerics → a single
 * space. Slugified dataset names ("le-male-le-parfum") therefore compare equal
 * to display names ("Le Male Le Parfum").
 */
export function normalizeFragranceText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Token-set similarity in [0, 1]: |A ∩ B| / |A ∪ B| (order-independent). */
function tokenOverlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeFragranceText(value).split(" ").filter(Boolean));
}

export interface ReferenceMatch {
  entry: FragranceReferenceEntry;
  /** Match quality: exact normalised equality beats token overlap. */
  exact: boolean;
  score: number;
}

/** Below this token-overlap a candidate is considered unrelated. */
const MIN_OVERLAP_SCORE = 0.5;

/**
 * Finds the best reference entry for a perfume, or `null` when nothing is
 * close enough (the caller must then proceed exactly as before).
 *
 * Strategy (deliberately dependency-free): exact comparison of the
 * normalised brand+name first; otherwise the best token-overlap candidate
 * among entries sharing the normalised brand (falls back to name-only search
 * when the brand is unknown). Ties break deterministically by insertion order.
 */
export function findReferenceMatch(
  name: string,
  brand: string,
): ReferenceMatch | null {
  const normalizedName = normalizeFragranceText(name);
  const normalizedBrand = normalizeFragranceText(brand);

  if (normalizedName === "" || normalizedBrand === "") {
    return null;
  }

  const nameTokens = tokenSet(name);

  let exactBrandName: FragranceReferenceEntry | undefined;
  let bestOverlap: ReferenceMatch | null = null;

  for (const entry of ENTRIES) {
    const entryBrand = normalizeFragranceText(entry.b);
    const entryName = normalizeFragranceText(entry.n);

    if (
      entryBrand === normalizedBrand &&
      entryName === normalizedName
    ) {
      exactBrandName = entry;
      break;
    }

    if (entryBrand !== normalizedBrand) {
      continue;
    }

    const score = tokenOverlap(nameTokens, tokenSet(entry.n));
    if (score >= MIN_OVERLAP_SCORE && (!bestOverlap || score > bestOverlap.score)) {
      bestOverlap = { entry, exact: false, score };
    }
  }

  if (exactBrandName) {
    return { entry: exactBrandName, exact: true, score: 1 };
  }

  if (bestOverlap) {
    return bestOverlap;
  }

  // Brand unknown in the dataset: try name-only, exact first, then overlap.
  // Name-only matches above 0.5 are rare but real ("Sauvage" style names).
  let nameOnlyExact: FragranceReferenceEntry | undefined;
  let nameOnlyBest: ReferenceMatch | null = null;

  for (const entry of ENTRIES) {
    const entryName = normalizeFragranceText(entry.n);

    if (entryName === normalizedName) {
      nameOnlyExact = entry;
      break;
    }

    const score = tokenOverlap(nameTokens, tokenSet(entry.n));
    if (score >= MIN_OVERLAP_SCORE && (!nameOnlyBest || score > nameOnlyBest.score)) {
      nameOnlyBest = { entry, exact: false, score };
    }
  }

  if (nameOnlyExact) {
    return { entry: nameOnlyExact, exact: true, score: 1 };
  }

  return nameOnlyBest;
}
