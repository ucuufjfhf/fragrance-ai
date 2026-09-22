/**
 * Structured fragrance profile dimensions used by the deterministic matching
 * engine. Every value is normalised to 0–100.
 */
export const FRAGRANCE_DIMENSIONS = [
  "fresh",
  "sweet",
  "woody",
  "spicy",
  "floral",
  "citrus",
  "aquatic",
  "smoky",
  "warm",
  "clean",
  "elegant",
  "mysterious",
  "bold",
  "projection",
  "longevity",
] as const;

export type FragranceDimension = (typeof FRAGRANCE_DIMENSIONS)[number];

export type FragranceProfileValues = Record<FragranceDimension, number>;

export type Gender = "MEN" | "WOMEN" | "UNISEX";

export type Occasion = "DAILY" | "DATE" | "PARTY" | "OFFICE" | "FORMAL";

export type Season = "SPRING" | "SUMMER" | "AUTUMN" | "WINTER" | "ALL";

/** Perfume data as used by the matching engine (provider/database agnostic). */
export interface PerfumeRecord {
  id: string;
  storeId: string;
  name: string;
  brand: string;
  productUrl: string;
  imageUrl?: string | null;
  price?: number | null;
  currency: string;
  gender: Gender;
  inStock: boolean;
  profile: FragranceProfileValues;
}
