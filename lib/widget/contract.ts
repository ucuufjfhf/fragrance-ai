import { MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";
import type { PersonalityVector } from "@/types/personality";

/**
 * Pure widget contracts (Phase 8).
 *
 * Everything the widget APIs and the embedded UI share: the store-id format,
 * the customer-safe recommendation shape and the strict vector validation.
 * No React, no DB, no AI — testable without a DOM and importable from both
 * the server routes and client components.
 */

/** Opaque cuid-shaped store id — the only accepted embed configuration. */
const STORE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidStoreId(value: unknown): value is string {
  return typeof value === "string" && STORE_ID_PATTERN.test(value);
}

/** Public, customer-safe store context returned by GET /api/widget/config. */
export interface WidgetStoreConfig {
  storeId: string;
  storeName: string;
  /** Always true in a 200 response; absent/error body implies unavailable. */
  active: true;
}

export type WidgetConfigResult =
  | { ok: true; config: WidgetStoreConfig }
  | { ok: false; reason: "INVALID_ID" | "STORE_NOT_FOUND" };

/**
 * Customer-safe recommendation payload. Built server-side from the engine
 * output — no internal ids beyond `perfumeId` (needed for click analytics),
 * no admin fields, no scores beyond the presentation value the engine already
 * rounds once.
 */
export interface WidgetRecommendation {
  perfumeId: string;
  rank: number;
  name: string;
  brand: string;
  productUrl: string | null;
  imageUrl: string | null;
  /** Presentation score (round(score × 10) / 10) — display only. */
  matchPercent: number;
  /** Persian «چرا این عطر؟» copy when the AI answered; absent otherwise. */
  explanation?: string;
}

export interface WidgetRecommendationResponse {
  recommendations: WidgetRecommendation[];
  /** False whenever the AI layer is unavailable (existing Phase 4 fallback). */
  aiAvailable: boolean;
}

/** Validates an untrusted personality vector: all nine axes, 0–100 integers. */
export function validateWidgetVector(input: unknown):
  | { ok: true; vector: PersonalityVector }
  | { ok: false; reason: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "vector must be an object." };
  }

  const record = input as Record<string, unknown>;
  const vector = {} as PersonalityVector;

  for (const dimension of MATCHING_DIMENSIONS) {
    const value = record[dimension];

    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
      return { ok: false, reason: `vector.${dimension} must be an integer 0–100.` };
    }

    vector[dimension] = value;
  }

  return { ok: true, vector };
}
