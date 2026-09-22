import { DESCRIPTOR_DIMENSIONS, MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";
import type { FragranceDimension } from "@/types/fragrance";
import type { Gender, Occasion, Season } from "@/types/fragrance";

/**
 * Server-boundary validation for the admin product CRUD (Phase 6A).
 *
 * Pure and dependency-free (no Prisma, no React): it validates untrusted form
 * payloads before anything touches the database, so tests can run without a
 * live DB and the repository can trust its input types.
 *
 * Rules mirror the Prisma schema exactly:
 *  - the nine `MATCHING_DIMENSIONS` are required integers 0–100 (they drive the
 *    deterministic engine, so a bad value must be rejected, never clamped);
 *  - the ten `DESCRIPTOR_DIMENSIONS` are optional integers 0–100;
 *  - `gender`/`season`/`occasion` must be existing enum values;
 *  - URLs/price/slug are validated only when supplied;
 *  - booleans must be actual booleans (no truthy strings from the browser).
 *
 * Errors are returned as a field → Persian message map, so the form can render
 * them next to the offending input.
 */

export const GENDERS: readonly Gender[] = ["MEN", "WOMEN", "UNISEX"];
export const SEASONS: readonly Season[] = ["SPRING", "SUMMER", "AUTUMN", "WINTER", "ALL"];
export const OCCASIONS: readonly Occasion[] = ["DAILY", "DATE", "PARTY", "OFFICE", "FORMAL"];

/** Hard caps keep free-text fields sane without a product decision. */
export const ADMIN_TEXT_MAX = 200;
export const ADMIN_DESCRIPTION_MAX = 1000;
export const ADMIN_URL_MAX = 2048;
export const ADMIN_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ADMIN_NOTES_MAX = 12;

export interface AdminProfileInput {
  matching: Record<(typeof MATCHING_DIMENSIONS)[number], number>;
  descriptors: Partial<Record<FragranceDimension, number>>;
  family?: string;
  notes: string[];
  season?: Season;
  occasion?: Occasion;
}

export interface AdminPerfumeInput {
  name: string;
  brand: string;
  slug?: string;
  description?: string;
  productUrl?: string;
  imageUrl?: string;
  gender: Gender;
  price?: number;
  inStock: boolean;
  active: boolean;
  profile: AdminProfileInput;
}

export type AdminValidation =
  | { ok: true; value: AdminPerfumeInput }
  | { ok: false; errors: Record<string, string> };

/** Validates one 0–100 integer for a profile axis; returns a Persian error. */
function validateAxis(raw: unknown): number | string {
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw)) {
    return "مقدار باید یک عدد صحیح باشد.";
  }

  if (raw < 0 || raw > 100) {
    return "مقدار باید بین ۰ و ۱۰۰ باشد.";
  }

  return raw;
}

function optionalText(raw: unknown, max: number): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }

  const value = raw.trim().slice(0, max);
  return value === "" ? undefined : value;
}

function optionalUrl(raw: unknown, field: string, errors: Record<string, string>): string | undefined {
  const value = optionalText(raw, ADMIN_URL_MAX);

  if (value === undefined) {
    return undefined;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("protocol");
    }
  } catch {
    errors[field] = "آدرس واردشده معتبر نیست (باید با http یا https شروع شود).";
    return undefined;
  }

  return value;
}

function optionalEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

function optionalPrice(raw: unknown, errors: Record<string, string>): number | undefined {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }

  const value = typeof raw === "number" ? raw : Number(raw);

  if (!Number.isFinite(value) || value < 0) {
    errors.price = "قیمت باید یک عدد نامنفی باشد.";
    return undefined;
  }

  return value;
}

function optionalBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

function validateProfile(raw: unknown, errors: Record<string, string>): AdminProfileInput | undefined {
  if (typeof raw !== "object" || raw === null) {
    errors.profile = "پروفایل عطری الزامی است.";
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  const matching = {} as AdminProfileInput["matching"];
  const descriptors: AdminProfileInput["descriptors"] = {};

  // The nine canonical axes are required — validate against the single
  // canonical list, never a second hardcoded array.
  for (const dimension of MATCHING_DIMENSIONS) {
    const result = validateAxis(record[dimension]);

    if (typeof result === "string") {
      errors[dimension] = result;
      continue;
    }

    matching[dimension] = result;
  }

  // Descriptors are optional, but a supplied value must still be a 0–100
  // integer; unknown keys are ignored (they are not part of the schema).
  for (const dimension of DESCRIPTOR_DIMENSIONS) {
    const rawValue = record[dimension];

    if (rawValue === undefined || rawValue === null || rawValue === "") {
      continue;
    }

    const result = validateAxis(rawValue);

    if (typeof result === "string") {
      errors[dimension] = result;
      continue;
    }

    descriptors[dimension] = result;
  }

  const notes = Array.isArray(record.notes)
    ? record.notes
        .filter((note): note is string => typeof note === "string")
        .map((note) => note.trim().slice(0, ADMIN_TEXT_MAX))
        .filter((note) => note !== "")
        .slice(0, ADMIN_NOTES_MAX)
    : [];

  const season = optionalEnum(record.season, SEASONS);
  const occasion = optionalEnum(record.occasion, OCCASIONS);

  if (record.season !== undefined && record.season !== "" && season === undefined) {
    errors.season = "فصل نامعتبر است.";
  }

  if (record.occasion !== undefined && record.occasion !== "" && occasion === undefined) {
    errors.occasion = "مناسبت نامعتبر است.";
  }

  if (Object.keys(errors).some((key) => MATCHING_DIMENSIONS.includes(key as never))) {
    return undefined;
  }

  return {
    matching,
    descriptors,
    family: optionalText(record.family, ADMIN_TEXT_MAX),
    notes,
    season,
    occasion,
  };
}

/**
 * Validates an untrusted create/update payload.
 *
 * On failure returns `{ ok: false, errors }` with Persian messages keyed by
 * field; on success returns a fully-typed value safe to hand to the repository.
 */
export function validatePerfumePayload(input: unknown): AdminValidation {
  const errors: Record<string, string> = {};

  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: { form: "داده‌های فرم نامعتبر است." } };
  }

  const record = input as Record<string, unknown>;

  const name = optionalText(record.name, ADMIN_TEXT_MAX);
  if (!name) {
    errors.name = "نام عطر الزامی است.";
  }

  const brand = optionalText(record.brand, ADMIN_TEXT_MAX);
  if (!brand) {
    errors.brand = "برند الزامی است.";
  }

  let slug = optionalText(record.slug, ADMIN_TEXT_MAX);
  if (slug && !ADMIN_SLUG_PATTERN.test(slug)) {
    errors.slug = "نامک فقط می‌تواند حروف کوچک لاتین، عدد و خط تیره باشد.";
    slug = undefined;
  }

  const description = optionalText(record.description, ADMIN_DESCRIPTION_MAX);
  const productUrl = optionalUrl(record.productUrl, "productUrl", errors);
  const imageUrl = optionalUrl(record.imageUrl, "imageUrl", errors);

  const gender = optionalEnum(record.gender, GENDERS) ?? "UNISEX";
  if (record.gender !== undefined && record.gender !== "" && !optionalEnum(record.gender, GENDERS)) {
    errors.gender = "جنسیت نامعتبر است.";
  }

  const price = optionalPrice(record.price, errors);
  const profile = validateProfile(record.profile, errors);

  // Any error recorded above (name, brand, slug, URLs, price, enums, profile)
  // fails the whole payload — partial saves must never happen silently.
  if (!profile || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      name: name!,
      brand: brand!,
      slug,
      description,
      productUrl,
      imageUrl,
      gender,
      price,
      inStock: optionalBool(record.inStock, true),
      active: optionalBool(record.active, true),
      profile,
    },
  };
}

/**
 * Pure store-isolation guard for a fetched perfume row.
 *
 * Used by every mutation path: a perfume may be read or written only when its
 * `storeId` matches the store selected in the admin context. Returns a
 * developer-facing English reason; the UI maps it to Persian copy.
 */
export function isPerfumeInStore(
  perfume: { storeId: string } | null | undefined,
  storeId: string,
): boolean {
  return perfume !== null && perfume !== undefined && perfume.storeId === storeId;
}
