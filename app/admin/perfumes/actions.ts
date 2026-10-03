"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createPerfumeForStore,
  getPerfumeForStore,
  setPerfumeFlags,
  updatePerfumeForStore,
} from "@/lib/admin/repository";
import {
  PROFILE_AXES,
  DESCRIPTOR_DIMENSIONS,
} from "@/lib/fragrance/profile";
import { validatePerfumePayload } from "@/lib/admin/validation";
import { requireAdminAction } from "@/lib/admin/server-access";
import {
  createAIProvider,
  type AiOutcome,
  type AiPerfumeProfileInput,
  type AiPerfumeProfileResult,
} from "@/lib/ai/provider";
import { enrichPerfumeProfile } from "@/lib/ai/perfume-profile";

/**
 * Server actions for the admin product CRUD (Phase 6A).
 *
 * Every action runs server-side: it first performs the admin access gate
 * check (`requireAdminAction` — unauthenticated callers are redirected to
 * the gate page, mirroring the former `proxy.ts` network boundary), then
 * re-validates the untrusted form payload (the browser is never trusted),
 * enforces store isolation inside the repository, and only then touches
 * Prisma. Outcomes are returned as data so the form can render Persian
 * feedback next to the offending field.
 */

export interface AdminActionState {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
}

const MESSAGES = {
  created: "عطر با موفقیت ثبت شد.",
  updated: "تغییرات با موفقیت ذخیره شد.",
  activated: "عطر فعال شد.",
  deactivated: "عطر غیرفعال شد.",
  inStock: "وضعیت موجودی به‌روزرسانی شد.",
  storeMismatch: "این عطر به فروشگاه انتخاب‌شده تعلق ندارد.",
  notFound: "عطر مورد نظر پیدا نشد.",
  slugTaken: "این نامک قبلاً در این فروشگاه استفاده شده است.",
  dbError: "ذخیره‌سازی با خطا مواجه شد؛ دوباره تلاش کنید.",
  invalid: "داده‌های واردشده معتبر نیست.",
} as const;

function toActionState(reason: string): AdminActionState {
  switch (reason) {
    case "STORE_MISMATCH":
      return { ok: false, message: MESSAGES.storeMismatch };
    case "PERFUME_NOT_FOUND":
      return { ok: false, message: MESSAGES.notFound };
    case "SLUG_TAKEN":
      return { ok: false, message: MESSAGES.slugTaken };
    default:
      return { ok: false, message: MESSAGES.dbError };
  }
}

/** Wraps an untrusted FormData entry as a plain object for the validator. */
function formDataToPayload(formData: FormData): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (key.startsWith("notes.")) {
      continue;
    }

    if (key === "notes") {
      payload.notes = String(value)
        .split("\n")
        .map((note) => note.trim())
        .filter((note) => note !== "");
      continue;
    }

    payload[key] = typeof value === "string" ? value : value;
  }

  // Checkboxes submit "on" when checked and are absent otherwise.
  payload.inStock = formData.get("inStock") !== null;
  payload.active = formData.get("active") !== null;

  // `validateProfile` reads the axes off `payload.profile`, so assemble the
  // nested profile object from the flat form fields here (mirrors the CSV
  // converter). Empty matching-axis strings must become numbers before the
  // validator sees them; empty descriptors stay absent (optional).
  const profile: Record<string, unknown> = {};
  for (const dimension of PROFILE_AXES) {
    profile[dimension] = Number(payload[dimension]);
    delete payload[dimension];
  }
  for (const dimension of DESCRIPTOR_DIMENSIONS) {
    const raw = payload[dimension];
    if (raw !== undefined && raw !== "") {
      profile[dimension] = Number(raw);
    }
    delete payload[dimension];
  }
  if (typeof payload.family === "string" && payload.family !== "") {
    profile.family = payload.family;
  }
  delete payload.family;
  if (Array.isArray(payload.notes) && payload.notes.length > 0) {
    profile.notes = payload.notes;
  }
  delete payload.notes;
  if (typeof payload.season === "string" && payload.season !== "") {
    profile.season = payload.season;
  }
  delete payload.season;
  if (typeof payload.occasion === "string" && payload.occasion !== "") {
    profile.occasion = payload.occasion;
  }
  delete payload.occasion;
  payload.profile = profile;

  return payload;
}

export async function createPerfumeAction(
  storeId: string,
  _prev: AdminActionState | null,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminAction();

  const payload = formDataToPayload(formData);
  const validated = validatePerfumePayload(payload);

  if (!validated.ok) {
    return { ok: false, message: MESSAGES.invalid, errors: validated.errors };
  }

  const result = await createPerfumeForStore(storeId, validated.value);

  if (!result.ok) {
    return toActionState(result.reason);
  }

  revalidatePath(`/admin/perfumes?store=${storeId}`);
  redirect(`/admin/perfumes?store=${storeId}&created=1`);
}

export async function updatePerfumeAction(
  perfumeId: string,
  storeId: string,
  _prev: AdminActionState | null,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminAction();

  const payload = formDataToPayload(formData);
  const validated = validatePerfumePayload(payload);

  if (!validated.ok) {
    return { ok: false, message: MESSAGES.invalid, errors: validated.errors };
  }

  const result = await updatePerfumeForStore(perfumeId, storeId, validated.value);

  if (!result.ok) {
    return toActionState(result.reason);
  }

  revalidatePath(`/admin/perfumes?store=${storeId}`);
  return { ok: true, message: MESSAGES.updated };
}

export async function toggleActiveAction(
  perfumeId: string,
  storeId: string,
  active: boolean,
): Promise<AdminActionState> {
  await requireAdminAction();

  const result = await setPerfumeFlags(perfumeId, storeId, { active });

  if (!result.ok) {
    return toActionState(result.reason);
  }

  revalidatePath(`/admin/perfumes?store=${storeId}`);
  return { ok: true, message: active ? MESSAGES.activated : MESSAGES.deactivated };
}

export async function toggleInStockAction(
  perfumeId: string,
  storeId: string,
  inStock: boolean,
): Promise<AdminActionState> {
  await requireAdminAction();

  const result = await setPerfumeFlags(perfumeId, storeId, { inStock });

  if (!result.ok) {
    return toActionState(result.reason);
  }

  revalidatePath(`/admin/perfumes?store=${storeId}`);
  return { ok: true, message: MESSAGES.inStock };
}

/* ------------------------------------------------------------------ Phase 11 */

/** Persian feedback for every profiler outcome (spec §11). */
const PROFILER_MESSAGES = {
  notFound: "عطر مورد نظر پیدا نشد.",
  aiUnavailable: "هوش مصنوعی در دسترس نیست؛ می‌توانید پروفایل را دستی وارد کنید.",
  invalid: "خروجی هوش مصنوعی معتبر نبود؛ ذخیره نشد. دوباره تلاش کنید یا دستی وارد کنید.",
} as const;

/**
 * What the AI profiler returns to the client: descriptors only (never the nine
 * matching axes), plus the optional metadata the Phase 4 contract allows.
 */
export interface GeneratedProfile {
  descriptors: Partial<Record<(typeof DESCRIPTOR_DIMENSIONS)[number], number>>;
  family?: string;
  notes?: string[];
}

export type GenerateProfileState =
  | { ok: true; profile: GeneratedProfile; message: string }
  | { ok: false; message: string };

/**
 * Generate a fragrance profile with AI (Phase 11).
 *
 * Orchestration only — all AI specifics live behind the existing `AIProvider`
 * abstraction (`createAIProvider` → `enrichPerfumeProfile`), and validation is
 * the existing Phase 4 `validateAiProfileResult` (rejects unknown/forbidden
 * keys and non-numeric values; clamps in-range numbers).
 *
 * IMPORTANT save semantics (spec §12): this action is generation + validation
 * ONLY. It never writes to the database — the admin reviews the returned
 * values and saves them through the normal create/update form, which keeps
 * the `Perfume 1 → 1 FragranceProfile` relation intact and never overwrites a
 * manual profile without the admin's explicit save.
 */
export async function generateProfileAction(
  perfumeId: string | undefined,
  storeId: string,
  formData: FormData,
): Promise<GenerateProfileState> {
  await requireAdminAction();

  if (typeof storeId !== "string" || storeId.trim() === "") {
    return { ok: false, message: PROFILER_MESSAGES.notFound };
  }

  // The nine matching axes are context for the AI; for an existing perfume we
  // send its stored ones, for a new one the neutral 50 vector (context only —
  // the AI is forbidden from returning them).
  const neutral = Object.fromEntries(
    PROFILE_AXES.map((dimension) => [dimension, 50]),
  ) as AiPerfumeProfileInput["matchingProfile"];

  let facts: AiPerfumeProfileInput;

  const str = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };

  const name = str("name");
  const brand = str("brand");

  if (!name || !brand) {
    // The AI prompt needs at least the product identity; the form marks both
    // required, so this is a recoverable client-side omission.
    return {
      ok: false,
      message: "برای تولید پروفایل، نام و برند عطر لازم است.",
    };
  }

  if (perfumeId) {
    // Editing an existing perfume: facts come from the stored row (store
    // isolation enforced by the repository lookup).
    const perfume = await getPerfumeForStore(perfumeId, storeId);
    if (!perfume) {
      return { ok: false, message: PROFILER_MESSAGES.notFound };
    }
    facts = {
      perfumeId: perfume.id,
      name: perfume.name,
      brand: perfume.brand,
      description: perfume.description,
      family: perfume.profile?.family ?? null,
      notes: perfume.profile?.notes ?? [],
      matchingProfile: perfume.profile
        ? {
            social: perfume.profile.social,
            adventurous: perfume.profile.adventurous,
            expressive: perfume.profile.expressive,
            mysterious: perfume.profile.mysterious,
            fresh: perfume.profile.fresh,
            warm: perfume.profile.warm,
            experimental: perfume.profile.experimental,
            elegant: perfume.profile.elegant,
            bold: perfume.profile.bold,
          }
        : neutral,
      descriptors: perfume.profile
        ? {
            sweet: perfume.profile.sweet,
            woody: perfume.profile.woody,
            spicy: perfume.profile.spicy,
            floral: perfume.profile.floral,
            citrus: perfume.profile.citrus,
            aquatic: perfume.profile.aquatic,
            smoky: perfume.profile.smoky,
            clean: perfume.profile.clean,
            longevity: perfume.profile.longevity,
            projection: perfume.profile.projection,
          }
        : undefined,
    };
  } else {
    // Creating: use the form's factual fields as-is (no invented facts).
    const notes = str("notes")
      .split("\n")
      .map((note) => note.trim())
      .filter((note) => note !== "");
    facts = {
      perfumeId: "(new)",
      name,
      brand,
      description: str("description") || null,
      family: str("family") || null,
      notes,
      matchingProfile: neutral,
    };
  }

  // Provider abstraction only — no vendor code here, no keys in the client.
  const provider = createAIProvider();
  if (!provider.isAvailable()) {
    return { ok: false, message: PROFILER_MESSAGES.aiUnavailable };
  }

  const outcome: AiOutcome<AiPerfumeProfileResult> = await enrichPerfumeProfile(
    provider,
    facts,
  );

  if (!outcome.ok) {
    // Unavailable, timeout and malformed-output all land here as recoverable
    // failures; nothing was written and the form stays usable.
    return { ok: false, message: PROFILER_MESSAGES.invalid };
  }

  return {
    ok: true,
    message: "پروفایل پیشنهادی تولید شد؛ بازبینی کنید و ذخیره کنید.",
    profile: {
      descriptors: outcome.value.descriptors,
      family: outcome.value.family,
      notes: outcome.value.notes,
    },
  };
}
