import type { PersonalityVector } from "@/types/personality";
import type { FragranceDimension } from "@/types/fragrance";
import type { AiOutcome, AiPerfumeProfileResult } from "@/lib/ai/provider";
import type { AIProvider, AiPerfumeProfileInput } from "@/lib/ai/provider";
import { enrichPerfumeProfile } from "@/lib/ai/perfume-profile";
import {
  MATCHING_DIMENSIONS,
  clampProfileValue,
} from "@/lib/fragrance/profile";
import {
  normalizePerfumeIdentity,
} from "@/lib/fragrance/identity";
import { findReferenceIdentityMatch } from "@/lib/fragrance/reference-enrichment-lookup";
import {
  axesFromAccords,
  deriveAxesFromAiStructuredData,
  PERSONALITY_AXES,
  type PersonalityAxis,
} from "@/lib/fragrance/axis-derivation";

/**
 * REFERENCE-FIRST perfume profile enrichment (merchant lifecycle).
 *
 * ONE entry point reused by every merchant path (manual create/update,
 * CSV import, bulk profiling). Flow:
 *
 *   merchant perfume → normalize identity → conservative reference lookup
 *     → HIT:  deterministic reference-derived profile (NO AI call)
 *     → MISS: the EXISTING Phase 4/11/12 AI enrichment (Qwen behind the
 *             `AIProvider` abstraction, `enrichPerfumeProfile`, existing
 *             validation + cost controls)
 *     → validated profile (all nine axes present, 0–100 integers)
 *
 * Provenance of every produced profile is reported so the caller can persist
 * it (`REFERENCE` | `AI` | `MANUAL`).
 *
 * NON-NEGOTIABLE BOUNDARIES:
 *  - the nine matching axes from a REFERENCE hit are a deterministic
 *    approximation derived from the entry's accords via the shared
 *    axis-derivation utility — demo-quality estimates for an MVP, never
 *    curated product data;
 *  - an AI result can NEVER write the nine matching axes (existing Phase 4
 *    validator rejects them) — instead, the AI's structured data
 *    (descriptors/family) is deterministically converted into axes by the
 *    shared `deriveAxesFromAiStructuredData` mapping; the model never picks,
 *    ranks or outputs axis values;
 *  - if the AI's structured data carries no usable scent signal, enrichment
 *    FAILS — no 0/50/neutral fake axes are ever persisted to satisfy the
 *    schema;
 *  - the recommendation engine remains untouched and deterministic: this
 *    service only produces the profile data that gets SAVED.
 */

/** How a persisted profile was produced. */
export type ProfileProvenance = "REFERENCE" | "AI" | "MANUAL";

/** A validated, ready-to-persist fragrance profile + its provenance. */
export interface EnrichedProfile {
  /** All nine matching axes, 0–100 integers (required by FragranceProfile). */
  matching: PersonalityVector;
  /** Optional descriptors, 0–100 integers. */
  descriptors: Partial<Record<FragranceDimension, number>>;
  family?: string;
  notes: string[];
  provenance: ProfileProvenance;
  /** Reference identity matched, when provenance is REFERENCE. */
  matchedIdentity?: string;
}

export type EnrichmentOutcome =
  | { ok: true; profile: EnrichedProfile }
  | { ok: false; reason: string };

/** The neutral 50 vector used when no stored axes exist (context only). */
export function neutralMatchingVector(): PersonalityVector {
  return Object.fromEntries(
    MATCHING_DIMENSIONS.map((dimension) => [dimension, 50]),
  ) as PersonalityVector;
}

/** Reference-entry axis type mirrors the derivation output. */
type AxisVector = Record<PersonalityAxis, number>;

/**
 * Builds the full EnrichedProfile from a reference match.
 *
 * The nine axes come from the shared deterministic accord derivation; the
 * notes (top→base, capped) and up-to-five accords travel as `notes`/`family`
 * context. Deterministic: same entry, same profile, every time.
 */
function profileFromReference(
  entry: {
    b: string;
    n: string;
    t: string[];
    a: string[];
  },
  matchedIdentity: string,
): EnrichedProfile {
  const derived = axesFromAccords(entry.a) as AxisVector;

  const matching = Object.fromEntries(
    PERSONALITY_AXES.map((axis) => [axis, clampProfileValue(derived[axis] ?? 40)]),
  ) as unknown as PersonalityVector;

  // Reference data quality caps: at most 8 notes, top-5 accords as the family
  // hint ("woody amber" style composite is not in the dataset; the strongest
  // accord is the honest single-word family).
  const notes = entry.t.slice(0, 8);
  const family = entry.a[0];

  return {
    matching,
    descriptors: {},
    ...(family ? { family } : {}),
    notes,
    provenance: "REFERENCE",
    matchedIdentity,
  };
}

/**
 * Converts a validated AI result into an EnrichedProfile — or fails.
 *
 * The AI structurally cannot supply the nine matching axes (the Phase 4
 * validator rejects them), so its STRUCTURED data (descriptors + family) is
 * deterministically converted into axes by the shared
 * `deriveAxesFromAiStructuredData` mapping — never the caller's stored or
 * neutral values, never a schema-satisfying fill. When the structured data
 * carries no usable scent signal, the enrichment FAILS and the caller must
 * NOT persist a fabricated profile.
 */
function profileFromAi(ai: AiPerfumeProfileResult): EnrichedProfile | { failure: string } {
  const derivation = deriveAxesFromAiStructuredData({
    descriptors: ai.descriptors,
    ...(ai.family !== undefined ? { family: ai.family } : {}),
  });

  if (!derivation.ok) {
    return { failure: derivation.reason };
  }

  const matching = Object.fromEntries(
    PERSONALITY_AXES.map((axis) => [axis, clampProfileValue(derivation.axes[axis])]),
  ) as unknown as PersonalityVector;

  return {
    matching,
    descriptors: ai.descriptors,
    ...(ai.family !== undefined ? { family: ai.family } : {}),
    notes: ai.notes ?? [],
    provenance: "AI",
  };
}

export interface EnrichPerfumeProfileInput {
  /** Merchant perfume identity fields (untrusted, normalized here). */
  name: string;
  brand: string;
  description?: string | null;
  /** Existing stored facts, when the perfume already has a profile row. */
  existing?: {
    matching?: Partial<PersonalityVector> | null;
    descriptors?: Partial<Record<FragranceDimension, number | null>> | null;
    family?: string | null;
    notes?: string[] | null;
  } | null;
  /** Reserved for callers that need the id in AI inputs. */
  perfumeId?: string;
}

/**
 * The single reference-first enrichment entry point.
 *
 * `provider` is injected so tests (and the bulk loop) can supply the real
 * `createAIProvider()` or a fake. A reference HIT never calls the provider.
 */
export async function enrichPerfumeProfileReferenceFirst(
  input: EnrichPerfumeProfileInput,
  provider: AIProvider,
): Promise<EnrichmentOutcome> {
  const name = input.name?.trim() ?? "";
  const brand = input.brand?.trim() ?? "";

  if (name === "" || brand === "") {
    return { ok: false, reason: "name and brand are required for enrichment." };
  }

  const merchantIdentity = normalizePerfumeIdentity(`${brand} ${name}`);
  const merchantBrandIdentity = normalizePerfumeIdentity(brand);

  // --- reference-first: a confident hit costs no AI call.
  const lookup = findReferenceIdentityMatch(merchantIdentity, merchantBrandIdentity);

  if (lookup.ok) {
    return {
      ok: true,
      profile: profileFromReference(lookup.match.entry, lookup.match.matchedIdentity),
    };
  }

  // --- fallback: the EXISTING AI enrichment path, unchanged.
  const existing = input.existing ?? null;
  const storedAxes = existing?.matching ?? null;
  const matchingProfile = Object.fromEntries(
    MATCHING_DIMENSIONS.map((dimension) => [
      dimension,
      clampProfileValue(storedAxes?.[dimension] ?? 50),
    ]),
  ) as unknown as PersonalityVector;

  const aiInput: AiPerfumeProfileInput = {
    perfumeId: input.perfumeId ?? "(enrich)",
    name,
    brand,
    description: input.description ?? null,
    family: existing?.family ?? null,
    notes: existing?.notes ?? [],
    matchingProfile,
    descriptors: existing?.descriptors
      ? (Object.fromEntries(
          Object.entries(existing.descriptors).filter(([, v]) => typeof v === "number"),
        ) as Partial<Record<FragranceDimension, number | null>>)
      : undefined,
  };

  const outcome: AiOutcome<AiPerfumeProfileResult> = await enrichPerfumeProfile(
    provider,
    aiInput,
  );

  if (!outcome.ok) {
    return { ok: false, reason: outcome.reason };
  }

  const profile = profileFromAi(outcome.value);
  if ("failure" in profile) {
    return { ok: false, reason: profile.failure };
  }

  return { ok: true, profile };
}
