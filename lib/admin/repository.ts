import { getPrisma } from "@/lib/db";
import { isPerfumeInStore } from "@/lib/admin/validation";
import type { AdminPerfumeInput } from "@/lib/admin/validation";
import { createAIProvider } from "@/lib/ai/provider";
import { enrichPerfumeProfileReferenceFirst } from "@/lib/fragrance/profile-enrichment";
import {
  computeBulkProfileWrite,
  type ExistingProfileFacts,
} from "@/lib/admin/bulk/helpers";
import { PROFILE_AXES } from "@/lib/fragrance/profile";
import { STORE_CURRENCY } from "@/lib/pricing/currency";
import type { ProfileProvenance } from "@/lib/fragrance/profile-enrichment";
import type { Gender, Season, Occasion } from "@/types/fragrance";

/**
 * Server-only Prisma access for the admin product CRUD (Phase 6A).
 *
 * Store isolation is the non-negotiable invariant: every read and every
 * mutation takes the admin-selected `storeId` and re-checks the relationship
 * in the where clause / guard, so a perfume from another store can never be
 * listed, edited or toggled through the wrong admin context. This mirrors the
 * Phase 3 defence-in-depth pattern (SQL where + explicit check).
 *
 * Deletion is deliberately absent: deactivation (`active = false`) is the only
 * lifecycle action, because the delete matrix preserves recommendation history.
 *
 * Must never be imported from a client component (Prisma + DATABASE_URL).
 */

export interface AdminStoreView {
  id: string;
  name: string;
  slug: string;
}

export interface AdminPerfumeRow {
  id: string;
  storeId: string;
  name: string;
  brand: string;
  slug: string | null;
  description: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  gender: Gender;
  price: number | null;
  inStock: boolean;
  active: boolean;
  updatedAt: Date;
  profile: {
    social: number;
    adventurous: number;
    expressive: number;
    mysterious: number;
    fresh: number;
    warm: number;
    experimental: number;
    elegant: number;
    bold: number;
    sweet: number | null;
    woody: number | null;
    spicy: number | null;
    floral: number | null;
    citrus: number | null;
    aquatic: number | null;
    smoky: number | null;
    clean: number | null;
    longevity: number | null;
    projection: number | null;
    family: string | null;
    notes: string[];
    season: Season | null;
    occasion: Occasion | null;
    /**
     * Persisted provenance of the profile, surfaced read-only for the merchant
     * admin. `null` when the perfume has no profile at all. This is the stored
     * value only — nothing in the admin UI may write or relabel it.
     */
    profileSource: ProfileProvenance | null;
  } | null;
}

export type AdminMutationResult =
  | { ok: true; perfumeId: string }
  | { ok: false; reason: "STORE_MISMATCH" | "PERFUME_NOT_FOUND" | "SLUG_TAKEN" | "DB_ERROR"; detail?: string };

/** Active stores for the admin store selector (store creation is out of scope). */
export async function getActiveStores(): Promise<AdminStoreView[]> {
  const prisma = getPrisma();

  return prisma.store.findMany({
    where: { active: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}

/** All perfumes of exactly one store — never an unscoped query. */
export async function getPerfumesForStore(storeId: string): Promise<AdminPerfumeRow[]> {
  const prisma = getPrisma();

  return prisma.perfume.findMany({
    where: { storeId },
    select: {
      id: true,
      storeId: true,
      name: true,
      brand: true,
      slug: true,
      description: true,
      productUrl: true,
      imageUrl: true,
      gender: true,
      price: true,
      inStock: true,
      active: true,
      updatedAt: true,
      profile: {
        select: {
          social: true,
          adventurous: true,
          expressive: true,
          mysterious: true,
          fresh: true,
          warm: true,
          experimental: true,
          elegant: true,
          bold: true,
          sweet: true,
          woody: true,
          spicy: true,
          floral: true,
          citrus: true,
          aquatic: true,
          smoky: true,
          clean: true,
          longevity: true,
          projection: true,
          family: true,
          notes: true,
          season: true,
          occasion: true,
          profileSource: true,
        },
      },
    },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }, { name: "asc" }],
  });
}

/**
 * One perfume for the edit form. Enforces store isolation on reads: a row from
 * another store is reported as not found rather than returned.
 */
export async function getPerfumeForStore(
  perfumeId: string,
  storeId: string,
): Promise<AdminPerfumeRow | null> {
  const prisma = getPrisma();
  const perfume = await prisma.perfume.findFirst({
    where: { id: perfumeId, storeId },
    select: {
      id: true,
      storeId: true,
      name: true,
      brand: true,
      slug: true,
      description: true,
      productUrl: true,
      imageUrl: true,
      gender: true,
      price: true,
      inStock: true,
      active: true,
      updatedAt: true,
      profile: {
        select: {
          social: true,
          adventurous: true,
          expressive: true,
          mysterious: true,
          fresh: true,
          warm: true,
          experimental: true,
          elegant: true,
          bold: true,
          sweet: true,
          woody: true,
          spicy: true,
          floral: true,
          citrus: true,
          aquatic: true,
          smoky: true,
          clean: true,
          longevity: true,
          projection: true,
          family: true,
          notes: true,
          season: true,
          occasion: true,
          profileSource: true,
        },
      },
    },
  });

  if (!isPerfumeInStore(perfume, storeId)) {
    return null;
  }

  return perfume;
}

/**
 * The Prisma `FragranceProfile` numeric columns, typed as a record so the
 * profile payload builder satisfies every required (nine axes) and optional
 * (ten descriptors) column explicitly.
 */
type ProfileColumn =
  | "social"
  | "adventurous"
  | "expressive"
  | "mysterious"
  | "fresh"
  | "warm"
  | "experimental"
  | "elegant"
  | "bold"
  | "sweet"
  | "woody"
  | "spicy"
  | "floral"
  | "citrus"
  | "aquatic"
  | "smoky"
  | "clean"
  | "longevity"
  | "projection";

/**
 * Maps validated admin input to the nested Prisma profile payload.
 *
 * The validator guarantees all nine matching axes exist, so the spread below
 * always satisfies Prisma's required `Int` columns; `undefined` optionals are
 * stripped because Prisma treats explicit `undefined` as "leave unset".
 */
function toProfilePayload(input: AdminPerfumeInput) {
  const axes: Record<ProfileColumn, number> = {
    social: input.profile.matching.social,
    adventurous: input.profile.matching.adventurous,
    expressive: input.profile.matching.expressive,
    mysterious: input.profile.matching.mysterious,
    fresh: input.profile.matching.fresh,
    warm: input.profile.matching.warm,
    experimental: input.profile.matching.experimental,
    elegant: input.profile.matching.elegant,
    bold: input.profile.matching.bold,
    sweet: input.profile.descriptors.sweet ?? 0,
    woody: input.profile.descriptors.woody ?? 0,
    spicy: input.profile.descriptors.spicy ?? 0,
    floral: input.profile.descriptors.floral ?? 0,
    citrus: input.profile.descriptors.citrus ?? 0,
    aquatic: input.profile.descriptors.aquatic ?? 0,
    smoky: input.profile.descriptors.smoky ?? 0,
    clean: input.profile.descriptors.clean ?? 0,
    longevity: input.profile.descriptors.longevity ?? 0,
    projection: input.profile.descriptors.projection ?? 0,
  };

  const data: {
    family?: string;
    notes: string[];
    season?: Season;
    occasion?: Occasion;
    profileSource?: "REFERENCE" | "AI" | "MANUAL";
  } & Record<ProfileColumn, number> = {
    ...axes,
    notes: input.profile.notes,
    // Profiles entered by hand through the admin/CSV forms are MANUAL by
    // definition; enrichment-driven paths stamp their own provenance.
    profileSource: "MANUAL",
  };

  if (input.profile.family !== undefined) {
    data.family = input.profile.family;
  }

  if (input.profile.season !== undefined) {
    data.season = input.profile.season;
  }

  if (input.profile.occasion !== undefined) {
    data.occasion = input.profile.occasion;
  }

  return data;
}

/**
 * True when the submitted nine matching axes are ALL still the ProfileEditor
 * form default (50) — i.e. the merchant never authored them. An untouched form
 * is NOT merchant profile data: the reference-first enrichment is then free to
 * persist its deterministic axes. Any axis the merchant actually set keeps the
 * profile manual-authoritative (the fill-only contract).
 */
function isUntouchedDefaultAxes(matching: AdminPerfumeInput["profile"]["matching"]): boolean {
  return PROFILE_AXES.every((axis) => matching[axis] === 50);
}

/**
 * Reference-first enrichment for a NEW profile (admin create path).
 *
 * Runs the SAME single enrichment entry point as the bulk processor
 * (`enrichPerfumeProfileReferenceFirst`): a conservative reference HIT yields
 * deterministic axes with ZERO AI calls; a MISS falls back to the existing AI
 * provider (whose output is validated and deterministically converted into
 * axes — the model never writes them). The enrichment runs BEFORE any database
 * write — an AI call is never made inside a transaction.
 *
 * The result is merged into the merchant's form payload under the established
 * fill-only contract (`computeBulkProfileWrite` — no second implementation):
 *  - merchant-supplied non-zero descriptors / non-empty family / notes always
 *    win and are structurally absent from the applied write;
 *  - derived axes are carried ONLY when the merchant left the form's axes at
 *    the untouched default; a merchant who authored any axis keeps MANUAL
 *    authority over all nine (and the provenance stays MANUAL);
 *  - when enrichment fails or AI is unavailable, the merchant's own form
 *    values are persisted as MANUAL — never a fabricated 0/50 profile and
 *    never a silent relabel.
 */
async function buildEnrichedProfilePayload(input: AdminPerfumeInput) {
  const manual = toProfilePayload(input);

  const outcome = await enrichPerfumeProfileReferenceFirst(
    {
      name: input.name,
      brand: input.brand,
      description: input.description ?? null,
    },
    createAIProvider(),
  );

  if (!outcome.ok) {
    return manual;
  }

  const untouchedAxes = isUntouchedDefaultAxes(input.profile.matching);
  const existing: ExistingProfileFacts = {
    descriptors: { ...input.profile.descriptors },
    family: input.profile.family ?? null,
    notes: input.profile.notes.length > 0 ? input.profile.notes : null,
    // The untouched form default is NOT stored merchant axes: passing null
    // lets the fill-only merge carry the deterministic derived axes. Any
    // authored axis value wins structurally instead.
    matchingAxes: untouchedAxes ? null : { ...input.profile.matching },
    // A merchant who authored real axes owns the profile: its provenance is
    // MANUAL and stays MANUAL (fill-only merge never relabels a non-null one).
    profileSource: untouchedAxes ? null : "MANUAL",
  };

  const write = computeBulkProfileWrite(existing, {
    descriptors: outcome.profile.descriptors,
    ...(outcome.profile.family !== undefined ? { family: outcome.profile.family } : {}),
    ...(outcome.profile.notes.length > 0 ? { notes: outcome.profile.notes } : {}),
    matching: { ...outcome.profile.matching },
    source: outcome.profile.provenance,
  });

  // Apply the fill-only write on top of the manual payload. Fields the write
  // structurally does not carry (preserved merchant values) fall back to the
  // merchant's own form data below.
  const axes = write.matching ?? input.profile.matching;
  const descriptors = {
    sweet: write.descriptors.sweet ?? input.profile.descriptors.sweet ?? 0,
    woody: write.descriptors.woody ?? input.profile.descriptors.woody ?? 0,
    spicy: write.descriptors.spicy ?? input.profile.descriptors.spicy ?? 0,
    floral: write.descriptors.floral ?? input.profile.descriptors.floral ?? 0,
    citrus: write.descriptors.citrus ?? input.profile.descriptors.citrus ?? 0,
    aquatic: write.descriptors.aquatic ?? input.profile.descriptors.aquatic ?? 0,
    smoky: write.descriptors.smoky ?? input.profile.descriptors.smoky ?? 0,
    clean: write.descriptors.clean ?? input.profile.descriptors.clean ?? 0,
    longevity: write.descriptors.longevity ?? input.profile.descriptors.longevity ?? 0,
    projection: write.descriptors.projection ?? input.profile.descriptors.projection ?? 0,
  } as Record<ProfileColumn, number>;
  const family = write.family ?? input.profile.family;

  return {
    ...descriptors,
    social: axes.social,
    adventurous: axes.adventurous,
    expressive: axes.expressive,
    mysterious: axes.mysterious,
    fresh: axes.fresh,
    warm: axes.warm,
    experimental: axes.experimental,
    elegant: axes.elegant,
    bold: axes.bold,
    notes: write.notes ?? input.profile.notes,
    ...(family !== undefined ? { family } : {}),
    ...(input.profile.season !== undefined ? { season: input.profile.season } : {}),
    ...(input.profile.occasion !== undefined ? { occasion: input.profile.occasion } : {}),
    // The write's provenance is the fill-only resolution: MANUAL when the
    // merchant authored the axes, otherwise the enrichment's true source.
    profileSource: write.source,
  };
}

async function isSlugTaken(
  storeId: string,
  slug: string,
  excludePerfumeId?: string,
): Promise<boolean> {
  const prisma = getPrisma();
  const existing = await prisma.perfume.findFirst({
    where: { storeId, slug, ...(excludePerfumeId ? { id: { not: excludePerfumeId } } : {}) },
    select: { id: true },
  });

  return existing !== null;
}

/**
 * Creates a perfume and its 1:1 profile in one transaction.
 * The profile is created, never upserted, because the perfume is new.
 */
export async function createPerfumeForStore(
  storeId: string,
  input: AdminPerfumeInput,
): Promise<AdminMutationResult> {
  const prisma = getPrisma();

  try {
    if (input.slug && (await isSlugTaken(storeId, input.slug))) {
      return { ok: false, reason: "SLUG_TAKEN" };
    }

    // Reference-first enrichment runs BEFORE the write (never inside a
    // transaction): reference HIT → deterministic axes, zero AI calls;
    // MISS → AI fallback; failure → the merchant's own MANUAL payload.
    const profile = await buildEnrichedProfilePayload(input);

    const perfume = await prisma.perfume.create({
      data: {
        storeId,
        name: input.name,
        brand: input.brand,
        slug: input.slug,
        description: input.description,
        productUrl: input.productUrl,
        imageUrl: input.imageUrl,
        gender: input.gender,
        price: input.price,
        // Explicit, never the DB default — see lib/pricing/currency.ts.
        currency: STORE_CURRENCY,
        inStock: input.inStock,
        active: input.active,
        profile: {
          create: profile,
        },
      },
      select: { id: true },
    });

    return { ok: true, perfumeId: perfume.id };
  } catch (error) {
    return { ok: false, reason: "DB_ERROR", detail: error instanceof Error ? error.message : undefined };
  }
}

/**
 * Updates a perfume and upserts its profile inside one transaction.
 *
 * Store isolation: the update `where` includes `storeId`, so a perfume from
 * another store can never be modified through this store's admin context. The
 * profile uses `upsert` keyed on the unique `perfumeId`, preserving the 1:1
 * relationship without duplicates.
 */
export async function updatePerfumeForStore(
  perfumeId: string,
  storeId: string,
  input: AdminPerfumeInput,
): Promise<AdminMutationResult> {
  const prisma = getPrisma();

  try {
    const existing = await prisma.perfume.findFirst({
      where: { id: perfumeId, storeId },
      select: { id: true, profile: { select: { profileSource: true } } },
    });

    if (!existing) {
      return { ok: false, reason: "PERFUME_NOT_FOUND" };
    }

    if (input.slug && (await isSlugTaken(storeId, input.slug, perfumeId))) {
      return { ok: false, reason: "SLUG_TAKEN" };
    }

    const profile = toProfilePayload(input);

    // Edit keeps the existing provenance — never a silent relabel: a MANUAL
    // profile stays MANUAL (merchant authority) and a REFERENCE/AI profile
    // stays REFERENCE/AI. Re-enrichment is a deliberate, explicit action and
    // is NOT triggered silently by an edit. The form is pre-filled with the
    // stored values, so every saved value is the merchant's explicit choice.

    await prisma.$transaction([
      prisma.perfume.update({
        where: { id: perfumeId },
        data: {
          name: input.name,
          brand: input.brand,
          slug: input.slug,
          description: input.description,
          productUrl: input.productUrl,
          imageUrl: input.imageUrl,
          gender: input.gender,
          price: input.price,
          // A price-bearing update re-asserts the unit; it never converts.
          currency: STORE_CURRENCY,
          inStock: input.inStock,
          active: input.active,
        },
        select: { id: true },
      }),
      prisma.fragranceProfile.upsert({
        where: { perfumeId },
        create: {
          perfumeId,
          ...profile,
          ...(existing.profile?.profileSource != null
            ? { profileSource: existing.profile.profileSource }
            : {}),
        },
        update: {
          ...profile,
          ...(existing.profile?.profileSource != null
            ? { profileSource: existing.profile.profileSource }
            : {}),
        },
      }),
    ]);

    return { ok: true, perfumeId };
  } catch (error) {
    return { ok: false, reason: "DB_ERROR", detail: error instanceof Error ? error.message : undefined };
  }
}

/**
 * Toggles `active` (or `inStock`) for one perfume in one store.
 * Returns `PERFUME_NOT_FOUND` for a cross-store id — the mutation is refused
 * before any write happens.
 */
export async function setPerfumeFlags(
  perfumeId: string,
  storeId: string,
  flags: { active?: boolean; inStock?: boolean },
): Promise<AdminMutationResult> {
  const prisma = getPrisma();

  try {
    const existing = await prisma.perfume.findFirst({
      where: { id: perfumeId, storeId },
      select: { id: true },
    });

    if (!existing) {
      return { ok: false, reason: "PERFUME_NOT_FOUND" };
    }

    await prisma.perfume.update({
      where: { id: perfumeId },
      data: flags,
      select: { id: true },
    });

    return { ok: true, perfumeId };
  } catch (error) {
    return { ok: false, reason: "DB_ERROR", detail: error instanceof Error ? error.message : undefined };
  }
}
