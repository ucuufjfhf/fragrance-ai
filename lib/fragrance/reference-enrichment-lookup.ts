import {
  concentrationsCompatible,
  normalizePerfumeIdentity,
} from "@/lib/fragrance/identity";
import type { FragranceReferenceEntry } from "@/lib/ai/reference-lookup";
import referenceData from "@/data/fragrantica/reference.json";

/**
 * Conservative reference-catalog lookup for MERCHANT PROFILE ENRICHMENT.
 *
 * Deliberately DISTINCT from the AI-grounding matcher
 * (`lib/ai/reference-lookup.ts`, fuzzy token overlap): enrichment drives
 * PERSISTED product data, so a wrong match is far more harmful than no match.
 * This service only accepts high-confidence, variant-aware identities and
 * returns NOT_FOUND for anything ambiguous.
 *
 * Matching ladder (conservative, in order):
 *  1. exact normalized brand + exact normalized identity + concentration-compatible
 *     → HIGH confidence;
 *  2. exact brand + exact name where BOTH sides are concentration-silent
 *     → HIGH confidence;
 *  3. anything else (token overlap, partial names, ambiguous variants) →
 *     NOT_FOUND — never a forced match, AI fallback takes over.
 *
 * The bundled dataset is the Kaggle Fragrantica reference (internal use only,
 * provenance preserved in `reference.json::_meta`).
 */

export interface ReferenceIdentityMatch {
  entry: FragranceReferenceEntry;
  /** Which rung of the conservative ladder produced the match. */
  tier: "EXACT_WITH_CONCENTRATION" | "EXACT_CONCENTRATION_SILENT";
  /** Normalized identity of the dataset entry (for diagnostics). */
  matchedIdentity: string;
}

export type ReferenceIdentityLookup =
  | { ok: true; match: ReferenceIdentityMatch }
  | { ok: false; reason: "NOT_FOUND" };

interface CatalogEntry extends FragranceReferenceEntry {
  /** Lazily-populated normalized identity (brand + name). */
  identity?: string;
}

const ENTRIES: CatalogEntry[] = (
  referenceData as { entries: CatalogEntry[] }
).entries;

function identityOf(entry: CatalogEntry): string {
  // Memoized per entry for the process lifetime (23,846 cheap normalizations).
  entry.identity ??= normalizePerfumeIdentity(`${entry.b} ${entry.n}`);
  return entry.identity;
}

/**
 * Finds the high-confidence reference entry for a merchant perfume identity,
 * or reports NOT_FOUND. `merchantIdentity` must already be normalized
 * (`normalizePerfumeIdentity`); `brandIdentity` is the normalized brand alone.
 *
 * Linear scan over the catalog — same cost profile as the grounding matcher,
 * performed at most once per enrichment (never per recommendation request).
 */
export function findReferenceIdentityMatch(
  merchantIdentity: string,
  merchantBrandIdentity: string,
): ReferenceIdentityLookup {
  if (
    merchantIdentity.trim() === "" ||
    merchantBrandIdentity.trim() === ""
  ) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  // Rung 1 + 2 in a single pass: exact brand + exact full identity, gated by
  // concentration compatibility.
  let exactHit: CatalogEntry | undefined;

  for (const entry of ENTRIES) {
    const entryBrand = normalizePerfumeIdentity(entry.b);

    if (entryBrand !== merchantBrandIdentity) {
      continue;
    }

    const entryIdentity = identityOf(entry);

    if (entryIdentity !== merchantIdentity) {
      continue;
    }

    if (!concentrationsCompatible(entryIdentity, merchantIdentity)) {
      // Same brand+name but a different declared variant (EDT vs Elixir):
      // treat as NOT_FOUND rather than guess.
      continue;
    }

    exactHit = entry;
    break;
  }

  if (exactHit) {
    const entryIdentity = identityOf(exactHit);
    const bothSilent =
      extractSilentCheck(entryIdentity) && extractSilentCheck(merchantIdentity);

    return {
      ok: true,
      match: {
        entry: exactHit,
        tier: bothSilent
          ? "EXACT_CONCENTRATION_SILENT"
          : "EXACT_WITH_CONCENTRATION",
        matchedIdentity: entryIdentity,
      },
    };
  }

  return { ok: false, reason: "NOT_FOUND" };
}

/** True when the identity string carries no canonical concentration token. */
function extractSilentCheck(identity: string): boolean {
  const canonicalForms = new Set([
    "edt",
    "edp",
    "edc",
    "extrait",
    "elixir",
    "intense",
    "absolu",
    "le-parfum",
  ]);
  return !identity.split(" ").some((token) => canonicalForms.has(token));
}
