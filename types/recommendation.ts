import type {
  ArchetypeId,
  PersonalityDimension,
  PersonalityVector,
} from "@/types/personality";
import type {
  FragranceDimension,
  Gender,
  Occasion,
  Season,
} from "@/types/fragrance";

/** A single scored recommendation produced by the deterministic engine. */
export interface ScoredRecommendation {
  perfumeId: string;
  /** Match percentage, 0–100 (deterministic, AI never changes it). */
  score: number;
  /** 1-based rank in the final Top N list. */
  position: number;
  /** Dimensions that contributed most to the score, ranked. */
  matchedDimensions: FragranceDimension[];
  /** Optional AI-written Persian «چرا این عطر؟» text — enrichment only. */
  explanation?: string;
}

export interface RecommendationRequest {
  storeSlug?: string;
  personality: PersonalityVector;
  archetypeId?: ArchetypeId;
  budget?: number | null;
  preferredSeasons?: string[];
  preferredOccasions?: string[];
  limit?: number;
}

export interface RecommendationResponse {
  sessionId?: string;
  archetypeId: ArchetypeId;
  recommendations: ScoredRecommendation[];
  /** True when the AI explanation layer was unavailable/skipped. */
  aiAvailable: boolean;
}

/* -------------------------------------------------------------------------
 * Deterministic matching engine (Phase 3)
 *
 * Pure, AI-free application types. The database only produces candidates; all
 * scores and the ranking are computed by lib/matching.
 * ---------------------------------------------------------------------- */

/** A perfume candidate handed to the pure matching engine. */
export interface MatchCandidateInput {
  perfumeId: string;
  storeId: string;
  name: string;
  brand: string;
  slug?: string | null;
  productUrl?: string | null;
  imageUrl?: string | null;
  /**
   * Perfume audience/category (`Perfume.gender`).
   *
   * Read ONLY by the audience eligibility check at the top of the candidate
   * pass, and only when the shopper selected an audience (`targetGender`).
   * It is never scored, never ranked on and never part of the personality
   * vector. Optional so hand-built candidates (tests, older callers) keep
   * working: with no audience selected it is ignored entirely.
   */
  gender?: Gender | null;
  /**
   * The perfume's stored season tag (`FragranceProfile.season`).
   *
   * Read ONLY by the engine's optional season eligibility check, and only
   * when the shopper selected a season (`targetSeason`). Never scored, never
   * ranked on, never part of the personality vector. Optional so hand-built
   * candidates (tests, older callers) keep working: with no season selected
   * it is ignored entirely. `null`/unknown = untagged, which is EXCLUDED when
   * a season filter is active — unknown is never guessed to be a match.
   */
  season?: Season | null;
  /**
   * The perfume's stored occasion tag (`FragranceProfile.occasion`). Same
   * read-only eligibility contract as `season`, gated on `targetOccasion`.
   */
  occasion?: Occasion | null;
  /** Inactive perfumes are never eligible. */
  active: boolean;
  /** Out-of-stock perfumes are never eligible (documented inventory contract). */
  inStock: boolean;
  /**
   * The perfume's stored profile. Type-wise this is the nine personality axes
   * (what a `FragranceProfile` row carries); at scoring time the engine
   * validates all nine but compares only `MATCHING_DIMENSIONS`
   * (fresh, warm, mysterious, elegant, bold).
   *
   * `null`/incomplete/out-of-range values mean the perfume is excluded — never
   * scored with substituted values.
   */
  profile?: Partial<Record<PersonalityDimension, number>> | null;
  /**
   * OPTIONAL grounding facts for the AI explanation layer — display copy only.
   *
   * These are carried through the engine untouched and are NEVER read by
   * `similarityScore`, so adding them cannot change eligibility, distance,
   * score or ranking. They exist so the explanation prompt can describe the
   * real perfume instead of guessing. Absent stays absent: the prompt keeps
   * its existing `(نامشخص)` fallback.
   */
  /** Free-text merchant description (`Perfume.description`). */
  description?: string | null;
  /** Fragrance family, e.g. "woody amber" (`FragranceProfile.family`). */
  family?: string | null;
  /** Scent notes (`FragranceProfile.notes`). */
  notes?: string[] | null;
}

/** One ranked recommendation produced by the engine. */
export interface MatchedPerfume {
  /** 1-based position in the ranked list (deterministic). */
  rank: number;
  perfumeId: string;
  storeId: string;
  name: string;
  brand: string;
  slug: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  /** Raw Euclidean distance in the 9-dimensional 0–100 space (not rounded). */
  distance: number;
  /** Raw similarity score, 0–100 (not rounded). */
  score: number;
  /** Presentation score: `round(score × 10) / 10` — for display only. */
  presentationScore: number;
  /**
   * OPTIONAL grounding facts copied verbatim from the candidate. Pure
   * pass-through for the AI explanation layer: never scored, never sorted on,
   * never used for eligibility. See `MatchCandidateInput` for the rationale.
   */
  description?: string | null;
  family?: string | null;
  notes?: string[] | null;
}

export interface MatchResult {
  recommendations: MatchedPerfume[];
  /**
   * Candidates dropped because they were inactive, belonged to another store, or
   * had a missing/invalid matching profile. Kept for transparency so a missing
   * profile can never turn into a misleading silent result.
   */
  excluded: number;
}

