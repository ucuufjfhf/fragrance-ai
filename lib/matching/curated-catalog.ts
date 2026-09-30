import { clampProfileValue, toMatchingVector } from "@/lib/fragrance/profile";
import {
  axesFromAccords,
  PERSONALITY_AXES,
  type PersonalityAxis,
} from "@/lib/fragrance/axis-derivation";
import curatedData from "@/data/curated-demo-catalog.json";
import referenceData from "@/data/fragrantica/reference.json";

/**
 * CURATED DEMO CATALOG — the hand-audited 59-perfume demo pool.
 *
 * The raw reference dataset holds 23,846 rows, which is the wrong shape for a
 * demo: most rows are obscure flankers, and a name-based lookup over them is
 * forced to guess. `data/curated-demo-catalog.json` replaces that guessing with
 * an EXPLICIT, hand-verified mapping — every entry names the exact
 * `referenceBrandSlug` / `referencePerfumeSlug` pair inside the dataset, so
 * resolution here is a strict key lookup, never a similarity search.
 *
 * Design rules (all deliberate):
 *  - NO fuzzy matching, ever. The previous audit proved 20 of the 60 proposed
 *    perfumes cannot be resolved by the conservative enrichment ladder
 *    (brand '&' tokens, brand-repeated name slugs, missing "Replica" line
 *    prefixes, XJ catalogue codes, year suffixes, silent-concentration bases).
 *    Those are pinned to explicit slugs here instead of loosening the matcher.
 *  - The nine matching axes are derived by the SAME deterministic
 *    `axesFromAccords()` map used by every other reference path. No scoring,
 *    weighting or distance logic is touched by this module.
 *  - Candidates keep `REFERENCE_STORE_ID`, so demo output remains isolated from
 *    merchant inventory in both directions.
 *  - Product/image URLs stay `null`: the dataset has none and none is invented.
 *
 * Pure and deterministic: the same catalog always yields the same vectors.
 */

/** Merchandising segment a curated perfume is presented under. */
export const CURATED_TARGET_GENDERS = ["men", "women", "unisex"] as const;

export type CuratedTargetGender = (typeof CURATED_TARGET_GENDERS)[number];

/** One hand-curated demo perfume, exactly as declared in the JSON file. */
export interface CuratedDemoEntry {
  id: string;
  brand: string;
  name: string;
  referenceBrandSlug: string;
  referencePerfumeSlug: string;
  targetGender: CuratedTargetGender;
}

/** A curated perfume resolved against the reference dataset, with its profile. */
export interface ResolvedCuratedPerfume extends CuratedDemoEntry {
  /** The dataset gender tag — may differ from `targetGender` (upstream data). */
  referenceGender: string;
  referenceYear: string | null;
  referenceRating: number;
  referenceReviewCount: number;
  accords: readonly string[];
  notes: readonly string[];
  /** Deterministic 9-axis vector, always fully populated (neutral 40 if unmapped). */
  profile: Record<PersonalityAxis, number>;
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

const RAW_ENTRIES = (referenceData as { entries: ReferenceEntry[] }).entries;

/** Exact `brand/name` -> entry index, so resolution is a strict key lookup. */
const ENTRY_INDEX: ReadonlyMap<string, ReferenceEntry> = new Map(
  RAW_ENTRIES.map((entry) => [`${entry.b}/${entry.n}`, entry]),
);

/** The declared catalog, defensively narrowed to the documented shape. */
const DECLARED_ENTRIES: readonly CuratedDemoEntry[] = (
  curatedData as { entries: CuratedDemoEntry[] }
).entries;

/**
 * The curated pool size is a documented product decision (60 proposed − 1
 * dropped because Le Labo "Santal 33" is genuinely absent from the dataset).
 * It is asserted, not assumed, so a bad edit to the JSON fails loudly.
 */
export const CURATED_DEMO_COUNT = 59;

/** Raised when the curated catalog cannot be resolved — never silently degraded. */
export class CuratedCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CuratedCatalogError";
  }
}

function isTargetGender(value: unknown): value is CuratedTargetGender {
  return (
    typeof value === "string" &&
    (CURATED_TARGET_GENDERS as readonly string[]).includes(value)
  );
}

function resolveDeclaredEntries(): CuratedDemoEntry[] {
  if (DECLARED_ENTRIES.length !== CURATED_DEMO_COUNT) {
    throw new CuratedCatalogError(
      `curated demo catalog must declare exactly ${CURATED_DEMO_COUNT} entries, found ${DECLARED_ENTRIES.length}.`,
    );
  }

  const ids = new Set<string>();
  const pairs = new Set<string>();

  for (const entry of DECLARED_ENTRIES) {
    if (
      typeof entry.id !== "string" ||
      entry.id.trim() === "" ||
      typeof entry.brand !== "string" ||
      typeof entry.name !== "string" ||
      typeof entry.referenceBrandSlug !== "string" ||
      typeof entry.referencePerfumeSlug !== "string" ||
      !isTargetGender(entry.targetGender)
    ) {
      throw new CuratedCatalogError(
        `curated demo catalog contains a malformed entry: ${JSON.stringify(entry)}.`,
      );
    }

    if (ids.has(entry.id)) {
      throw new CuratedCatalogError(
        `curated demo catalog contains a duplicate id: ${entry.id}.`,
      );
    }

    const pair = `${entry.referenceBrandSlug}/${entry.referencePerfumeSlug}`;
    if (pairs.has(pair)) {
      throw new CuratedCatalogError(
        `curated demo catalog maps two entries onto the same reference record: ${pair}.`,
      );
    }

    ids.add(entry.id);
    pairs.add(pair);
  }

  return [...DECLARED_ENTRIES];
}

/**
 * Resolves one curated entry against the reference dataset.
 *
 * Strict by construction: a missing key is an error, never a partial result and
 * never a nearest-neighbour substitute.
 */
function resolveEntry(entry: CuratedDemoEntry): ResolvedCuratedPerfume {
  const key = `${entry.referenceBrandSlug}/${entry.referencePerfumeSlug}`;
  const reference = ENTRY_INDEX.get(key);

  if (!reference) {
    throw new CuratedCatalogError(
      `curated entry ${entry.id} (${entry.brand} — ${entry.name}) references ${key}, which is absent from data/fragrantica/reference.json.`,
    );
  }

  const vector = axesFromAccords(reference.a);
  const profile = Object.fromEntries(
    PERSONALITY_AXES.map((axis) => [axis, clampProfileValue(vector[axis])]),
  ) as Record<PersonalityAxis, number>;

  // Every axis must be a usable 0–100 integer before a candidate is handed to
  // the engine: the engine excludes unprofiled candidates, and a curated pool
  // must never silently shrink itself.
  if (!toMatchingVector(profile)) {
    throw new CuratedCatalogError(
      `curated entry ${entry.id} (${key}) did not derive a complete 9-axis profile.`,
    );
  }

  for (const axis of PERSONALITY_AXES) {
    if (!Number.isInteger(profile[axis])) {
      throw new CuratedCatalogError(
        `curated entry ${entry.id} (${key}) derived a non-integer ${axis} value.`,
      );
    }
  }

  return {
    ...entry,
    referenceGender: reference.g,
    referenceYear: reference.y,
    referenceRating: reference.r,
    referenceReviewCount: reference.rc,
    accords: reference.a,
    notes: reference.t,
    profile,
  };
}

/** Module-level cache: the resolution runs once per process, then is reused. */
let resolved: readonly ResolvedCuratedPerfume[] | null = null;

/**
 * All 59 curated perfumes, fully resolved with their derived 9-axis profiles.
 *
 * Throws `CuratedCatalogError` if any entry cannot be resolved — the demo must
 * never fall back to the unfiltered 23,846-row catalog.
 */
export function getCuratedDemoPerfumes(): readonly ResolvedCuratedPerfume[] {
  if (resolved) {
    return resolved;
  }

  const result = resolveDeclaredEntries().map(resolveEntry);

  resolved = result;
  return resolved;
}

/** Curated perfumes grouped by their merchandising segment. */
export function getCuratedDemoPerfumesByGender(
  targetGender: CuratedTargetGender,
): readonly ResolvedCuratedPerfume[] {
  return getCuratedDemoPerfumes().filter(
    (perfume) => perfume.targetGender === targetGender,
  );
}