import { normalizeFragranceText } from "@/lib/ai/reference-lookup";
import {
  PROFILE_AXES,
  SHARED_DIMENSIONS,
  clampProfileValue,
} from "@/lib/fragrance/profile";
import type { PersonalityDimension } from "@/types/personality";
import type { FragranceDimension } from "@/types/fragrance";

/**
 * Deterministic, TESTABLE derivation of the nine matching axes from
 * *structured scent data* — the single source of truth shared by:
 *
 *  - the REFERENCE_CATALOG demo source (accords from the bundled Fragrantica
 *    reference dataset) and the merchant REFERENCE-first enrichment HIT path;
 *  - the AI fallback (REFERENCE MISS): the AI structurally CANNOT write the
 *    nine axes (the Phase 4 validator rejects them), so a pure mapping here —
 *    never the model — converts its structured output into axes.
 *
 * NON-NEGOTIABLE BOUNDARIES (do not weaken):
 *  - the AI never chooses, ranks or outputs axis values; it only supplies
 *    descriptors/family/notes and THIS mapping decides the axes;
 *  - nothing here invents a value: an axis with no signal gets the documented
 *    calm neutral (`UNMAPPED_AXIS_NEUTRAL`), identical to the REFERENCE
 *    convention for unmapped accords;
 *  - when the structured data carries NO usable scent signal at all, the
 *    derivation FAILS — callers must not persist a fabricated profile.
 *
 * Pure and deterministic: same inputs, same axes, every run.
 */

/** One stored profile axis (mirrors `types/personality.ts`). */
export type PersonalityAxis = PersonalityDimension;

/**
 * The nine axes a derived profile row carries — NOT the matching metric. The
 * derivation must still fill every stored column, so the four personality-only
 * axes are emitted as `UNMAPPED_AXIS_NEUTRAL`; matching simply never reads them.
 */
export const PERSONALITY_AXES: readonly PersonalityAxis[] = [...PROFILE_AXES];

/**
 * The documented calm neutral for an axis with no signal (REFERENCE and AI
 * derivations share it). 40 — not 50 — keeps an unmapped axis gently below
 * the midpoint, exactly as shipped and live-verified for the reference path.
 */
export const UNMAPPED_AXIS_NEUTRAL = 40;

/** Axes the scent data can never speak to (pure personality dimensions). */
const PERSONALITY_ONLY_AXES: readonly PersonalityAxis[] = [
  "social",
  "adventurous",
  "expressive",
  "experimental",
] satisfies readonly PersonalityAxis[];

/** The five axes that ARE scent-identity dimensions (shared descriptors). */
const SCENT_AXES = SHARED_DIMENSIONS as readonly PersonalityAxis[];

/**
 * Deterministic accord → matching-axis contributions (0–100 scale).
 * The canonical map for EVERY consumer — reference catalog, enrichment HIT
 * and AI fallback alike. Never fork this map.
 */
export const ACCORD_AXIS_MAP: Record<string, Partial<Record<PersonalityAxis, number>>> = {
  fresh: { fresh: 90, warm: 10, bold: 30 },
  aquatic: { fresh: 85, warm: 5, bold: 25 },
  citrus: { fresh: 80, warm: 10, bold: 35 },
  aromatic: { fresh: 60, warm: 40, bold: 45 },
  lavender: { fresh: 50, warm: 40, elegant: 60 },
  woody: { warm: 65, bold: 55, elegant: 55 },
  oud: { warm: 80, bold: 80, mysterious: 70 },
  amber: { warm: 80, bold: 50, mysterious: 45 },
  "warm spicy": { warm: 75, bold: 65 },
  "fresh spicy": { fresh: 55, warm: 45, bold: 55 },
  spicy: { warm: 70, bold: 60 },
  sweet: { warm: 65, bold: 30 },
  gourmand: { warm: 60, bold: 40 },
  vanilla: { warm: 70, bold: 25 },
  floral: { elegant: 70, fresh: 40, warm: 40 },
  "white floral": { elegant: 70, fresh: 50 },
  rose: { elegant: 75, warm: 45 },
  iris: { elegant: 80, fresh: 30 },
  powdery: { elegant: 70, fresh: 20 },
  musky: { warm: 45, elegant: 55 },
  smoky: { bold: 70, warm: 60, mysterious: 65 },
  leather: { bold: 75, warm: 55 },
  tobacco: { warm: 70, bold: 55 },
  green: { fresh: 70, warm: 15 },
  marine: { fresh: 85, bold: 20 },
  ozonic: { fresh: 75, bold: 20 },
  fruity: { fresh: 55, bold: 30 },
  tropical: { fresh: 65, bold: 35 },
  chypre: { elegant: 65, bold: 45 },
  mossy: { elegant: 55, warm: 35 },
  honey: { warm: 60 },
  balsamic: { warm: 65, mysterious: 40 },
  animalic: { bold: 65, mysterious: 70 },
  aldehydic: { elegant: 55, fresh: 45 },
  conifer: { fresh: 55, warm: 40 },
  earthy: { warm: 50, mysterious: 45 },
  mineral: { fresh: 45, mysterious: 40 },
  salty: { fresh: 65 },
  creamy: { warm: 55 },
  lactonic: { fresh: 45, warm: 35 },
  "soft spicy": { warm: 50 },
  "yellow floral": { fresh: 50, warm: 40 },
};

/**
 * Scent-descriptor → axis contributions for the AI fallback, aligned with
 * `ACCORD_AXIS_MAP`'s philosophy. The AI's numeric descriptors
 * (sweet/woody/spicy/floral/citrus/aquatic/smoky) are the same concepts as
 * accords — they simply arrive as intensities instead of labels.
 */
const DESCRIPTOR_AXIS_MAP: Partial<
  Record<FragranceDimension, Partial<Record<PersonalityAxis, number>>>
> = {
  sweet: { warm: 70, bold: 30 },
  woody: { warm: 65, bold: 55, elegant: 55 },
  spicy: { warm: 70, bold: 60 },
  floral: { elegant: 70, fresh: 40, warm: 40 },
  citrus: { fresh: 80, warm: 10, bold: 35 },
  aquatic: { fresh: 85, warm: 5, bold: 25 },
  smoky: { bold: 70, warm: 60, mysterious: 65 },
};

/**
 * Derives the deterministic 9-axis vector from a reference entry's accords
 * (used by the REFERENCE_CATALOG source and the enrichment HIT path).
 * Mapped axes average their contributions; unmapped axes get
 * `UNMAPPED_AXIS_NEUTRAL`.
 */
export function axesFromAccords(
  accords: readonly string[],
): Record<PersonalityAxis, number> {
  const sums: Record<PersonalityAxis, number> = zeroSums();
  const hits: Record<PersonalityAxis, number> = zeroSums();

  for (const accord of accords) {
    const mapping = ACCORD_AXIS_MAP[normalizeFragranceText(accord)];
    if (!mapping) continue;
    addMapping(mapping, sums, hits);
  }

  return finalize(sums, hits);
}

/** The structured AI output the derivation accepts (never axis values). */
export interface AiStructuredScentData {
  descriptors: Partial<Record<FragranceDimension, number>>;
  family?: string;
}

export type AxisDerivation =
  | { ok: true; axes: Record<PersonalityAxis, number>; signalCount: number }
  | { ok: false; reason: string };

/**
 * Deterministically derives the nine axes from the AI's structured scent data.
 *
 * Signal priority per scent axis (averaged across sources):
 *  1. shared descriptors (fresh/warm/mysterious/elegant/bold) — direct 0–100;
 *  2. scent descriptors via `DESCRIPTOR_AXIS_MAP` (0 values mean "absent" —
 *     the fill-only convention — and are skipped);
 *  3. family tokens via `ACCORD_AXIS_MAP` (full phrase first, then bigrams,
 *     then unigrams).
 *
 * The four personality-only axes (social/adventurous/expressive/experimental)
 * have NO deterministic source in scent data; they carry
 * `UNMAPPED_AXIS_NEUTRAL`, exactly like the REFERENCE path's unmapped accords.
 *
 * Returns `{ ok: false }` when the data contains no usable scent signal at
 * all — the caller must then FAIL the enrichment instead of persisting a
 * fabricated profile.
 */
export function deriveAxesFromAiStructuredData(
  data: AiStructuredScentData,
): AxisDerivation {
  const sums: Record<PersonalityAxis, number> = zeroSums();
  const hits: Record<PersonalityAxis, number> = zeroSums();
  let signalCount = 0;

  // 1. Shared descriptors: the AI's direct 0–100 scent-identity values.
  // Zero means "absent" (the fill-only convention) and is skipped — a 0 is
  // never a scent verdict, and treating it as one would zero out the axis.
  for (const axis of SCENT_AXES) {
    const value = data.descriptors?.[axis as FragranceDimension];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      sums[axis] += clampProfileValue(value);
      hits[axis] += 1;
      signalCount += 1;
    }
  }

  // 2. Scent descriptors through the fixed descriptor map.
  for (const [descriptor, mapping] of Object.entries(DESCRIPTOR_AXIS_MAP)) {
    const value = data.descriptors?.[descriptor as FragranceDimension];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      addMapping(mapping, sums, hits);
      signalCount += 1;
    }
  }

  // 3. Family tokens through the accord map.
  if (data.family !== undefined && data.family.trim() !== "") {
    signalCount += collectFamilyMappings(data.family, sums, hits);
  }

  if (signalCount === 0) {
    return {
      ok: false,
      reason:
        "AI structured data carried no usable scent signal (no shared/scent descriptors, no mappable family) — refusing to fabricate matching axes.",
    };
  }

  const axes = finalize(sums, hits);
  for (const axis of PERSONALITY_ONLY_AXES) {
    axes[axis] = UNMAPPED_AXIS_NEUTRAL;
  }

  return { ok: true, axes, signalCount };
}

/** Adds one map's contributions to the per-axis sums/hits. */
function addMapping(
  mapping: Partial<Record<PersonalityAxis, number>>,
  sums: Record<PersonalityAxis, number>,
  hits: Record<PersonalityAxis, number>,
): void {
  for (const axis of SCENT_AXES) {
    const contribution = mapping[axis];
    if (typeof contribution === "number") {
      sums[axis] += contribution;
      hits[axis] += 1;
    }
  }
}

/** Collects family-phrase/bigram/unigram accord hits; returns how many. */
function collectFamilyMappings(
  family: string,
  sums: Record<PersonalityAxis, number>,
  hits: Record<PersonalityAxis, number>,
): number {
  const normalized = normalizeFragranceText(family);
  if (normalized === "") {
    return 0;
  }

  const full = ACCORD_AXIS_MAP[normalized];
  if (full) {
    addMapping(full, sums, hits);
    return 1;
  }

  const tokens = normalized.split(" ").filter(Boolean);
  let count = 0;

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const bigram = ACCORD_AXIS_MAP[`${tokens[index]} ${tokens[index + 1]}`];
    if (bigram) {
      addMapping(bigram, sums, hits);
      count += 1;
    }
  }

  for (const token of tokens) {
    const unigram = ACCORD_AXIS_MAP[token];
    if (unigram) {
      addMapping(unigram, sums, hits);
      count += 1;
    }
  }

  return count;
}

function zeroSums(): Record<PersonalityAxis, number> {
  return Object.fromEntries(
    PERSONALITY_AXES.map((axis) => [axis, 0]),
  ) as Record<PersonalityAxis, number>;
}

/** Averages mapped axes; unmapped scent axes get the documented neutral. */
function finalize(
  sums: Record<PersonalityAxis, number>,
  hits: Record<PersonalityAxis, number>,
): Record<PersonalityAxis, number> {
  const vector = {} as Record<PersonalityAxis, number>;
  for (const axis of PERSONALITY_AXES) {
    vector[axis] =
      hits[axis] > 0
        ? clampProfileValue(Math.round(sums[axis] / hits[axis]))
        : UNMAPPED_AXIS_NEUTRAL;
  }
  return vector;
}
