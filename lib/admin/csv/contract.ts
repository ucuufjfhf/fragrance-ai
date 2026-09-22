import { DESCRIPTOR_DIMENSIONS, MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";

/**
 * The canonical CSV import contract (Phase 6B).
 *
 * Column names are the contract; they are derived from the existing canonical
 * dimension lists (`MATCHING_DIMENSIONS` / `DESCRIPTOR_DIMENSIONS`) so the
 * schema stays the single source of truth — no second array of the nine axes.
 * `storeId` is deliberately NOT a column: the target store comes from the
 * admin context, and a `storeId` column in an upload is rejected as unknown.
 */

/** Centralised limits (spec §8) — change here, nowhere else. */
export const CSV_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const CSV_MAX_DATA_ROWS = 5_000;

/** The only boolean spellings the importer accepts (no truthy guessing). */
export const CSV_BOOLEAN_TRUE = new Set(["true"]);
export const CSV_BOOLEAN_FALSE = new Set(["false"]);

/** Required product columns. */
export const CSV_REQUIRED_PRODUCT_COLUMNS = ["name", "brand", "slug", "gender", "price"] as const;

/** Optional product columns (defaults: inStock = true, active = true). */
export const CSV_OPTIONAL_PRODUCT_COLUMNS = [
  "description",
  "productUrl",
  "imageUrl",
  "inStock",
  "active",
] as const;

/** The nine required matching-dimension columns, from the canonical list. */
export const CSV_MATCHING_COLUMNS: readonly string[] = MATCHING_DIMENSIONS;

/** The ten optional descriptor columns, from the canonical list. */
export const CSV_DESCRIPTOR_COLUMNS: readonly string[] = DESCRIPTOR_DIMENSIONS;

/** The two boolean columns and the only spellings they accept. */
export const CSV_BOOLEAN_COLUMNS: readonly string[] = ["inStock", "active"];

/** Optional fragrance-metadata columns. */
export const CSV_METADATA_COLUMNS = ["family", "notes", "season", "occasion"] as const;

/** Every column name the header may contain. */
export const CSV_ALL_COLUMNS: readonly string[] = [
  ...CSV_REQUIRED_PRODUCT_COLUMNS,
  ...CSV_OPTIONAL_PRODUCT_COLUMNS,
  ...CSV_MATCHING_COLUMNS,
  ...CSV_DESCRIPTOR_COLUMNS,
  ...CSV_METADATA_COLUMNS,
];

/** `notes` uses this separator inside a single CSV cell. */
export const CSV_NOTES_SEPARATOR = "|";
