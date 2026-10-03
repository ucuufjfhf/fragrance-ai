import type {
  ArchetypeId,
  PersonalityDimension,
  PersonalityVector,
} from "@/types/personality";
import type { FragranceDimension } from "@/types/fragrance";

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

