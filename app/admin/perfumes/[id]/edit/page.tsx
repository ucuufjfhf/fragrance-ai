import Link from "next/link";

import PerfumeForm from "@/components/admin/PerfumeForm";
import ProfileSourceBadge from "@/components/admin/ProfileSourceBadge";
import { updatePerfumeAction } from "@/app/admin/perfumes/actions";
import type { AdminActionState } from "@/app/admin/perfumes/actions";
import { getPerfumeForStore } from "@/lib/admin/repository";
import { describeProfileSource } from "@/components/admin/ProfileSourceBadge";
import type { ProfileProvenance } from "@/lib/fragrance/profile-enrichment";
import type { Metadata } from "next";

import { requireAdmin } from "@/lib/admin/server-access";

/**
 * GET /admin/perfumes/[id]/edit — edit form (Phase 6A, server component).
 *
 * Server-side admin gate: unauthenticated requests are redirected to the
 * gate page before anything renders (the `next` target is built from the
 * dynamic route params, sanitized by `safeAdminRedirectPath`).
 *
 * Store isolation on reads: the perfume is loaded through
 * `getPerfumeForStore(id, storeId)`, so an id belonging to another store
 * renders the not-found state instead of the edit form.
 */
export const metadata: Metadata = {
  title: "ویرایش عطر | مدیریت",
  robots: { index: false, follow: false },
};

interface EditPerfumePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EditPerfumePage({ params, searchParams }: EditPerfumePageProps) {
  const { id } = await params;
  const query = await searchParams;
  const storeParam = Array.isArray(query.store) ? query.store[0] : query.store;
  const storeId = storeParam?.trim() ?? "";

  await requireAdmin(`/admin/perfumes/${encodeURIComponent(id)}/edit${storeId ? `?store=${encodeURIComponent(storeId)}` : ""}`);

  const perfume = storeId ? await getPerfumeForStore(id, storeId) : null;

  if (!perfume) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
        <section className="flex flex-col items-center gap-3 rounded-3xl border border-border-soft bg-surface p-8 text-center">
          <span aria-hidden="true" className="text-4xl">🔍</span>
          <h1 className="text-lg font-semibold">عطر پیدا نشد</h1>
          <p className="text-sm leading-8 text-muted">
            این عطر در فروشگاه انتخاب‌شده وجود ندارد یا شناسه نامعتبر است.
          </p>
          <Link
            href="/admin/perfumes"
            className="flex min-h-11 items-center justify-center rounded-2xl bg-accent px-6 font-medium text-background transition-colors hover:bg-accent/90"
          >
            بازگشت به فهرست
          </Link>
        </section>
      </main>
    );
  }

  // Pre-bind the perfume/store ids onto the real server action — `.bind` on an
  // action imported from a "use server" module is the supported way to pass an
  // action with arguments across the Server → Client boundary. An inline
  // closure is NOT serializable and crashes the render.
  const boundAction = updatePerfumeAction.bind(null, perfume.id, perfume.storeId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold sm:text-3xl">ویرایش عطر</h1>
        <p className="text-sm text-muted">{perfume.name} — {perfume.brand}</p>
      </header>

      {/* Informational only: provenance is rendered OUTSIDE <PerfumeForm>, so it
          is never a submittable field and cannot be relabelled from this UI. */}
      <section
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-soft bg-surface p-4"
        aria-label="منبع پروفایل"
      >
        <ProfileSourceBadge profile={perfume.profile} size="md" />
        <p className="text-sm leading-7 text-muted">
          {provenanceHint(perfume.profile)}
        </p>
      </section>

      <PerfumeForm
        storeId={perfume.storeId}
        perfumeId={perfume.id}
        action={boundAction}
        submitLabel="ذخیره تغییرات"
        values={{
          name: perfume.name,
          brand: perfume.brand,
          slug: perfume.slug,
          description: perfume.description,
          productUrl: perfume.productUrl,
          imageUrl: perfume.imageUrl,
          gender: perfume.gender,
          price: perfume.price,
          inStock: perfume.inStock,
          active: perfume.active,
          family: perfume.profile?.family ?? null,
          notes: perfume.profile?.notes ?? [],
          season: perfume.profile?.season ?? null,
          occasion: perfume.profile?.occasion ?? null,
          matching: {
            social: perfume.profile?.social ?? 50,
            adventurous: perfume.profile?.adventurous ?? 50,
            expressive: perfume.profile?.expressive ?? 50,
            mysterious: perfume.profile?.mysterious ?? 50,
            fresh: perfume.profile?.fresh ?? 50,
            warm: perfume.profile?.warm ?? 50,
            experimental: perfume.profile?.experimental ?? 50,
            elegant: perfume.profile?.elegant ?? 50,
            bold: perfume.profile?.bold ?? 50,
          },
          descriptors: {
            sweet: perfume.profile?.sweet ?? null,
            woody: perfume.profile?.woody ?? null,
            spicy: perfume.profile?.spicy ?? null,
            floral: perfume.profile?.floral ?? null,
            citrus: perfume.profile?.citrus ?? null,
            aquatic: perfume.profile?.aquatic ?? null,
            smoky: perfume.profile?.smoky ?? null,
            clean: perfume.profile?.clean ?? null,
            longevity: perfume.profile?.longevity ?? null,
            projection: perfume.profile?.projection ?? null,
          },
        }}
      />

      <Link
        href={`/admin/perfumes?store=${perfume.storeId}`}
        className="mx-auto text-xs text-muted underline underline-offset-4 transition-colors hover:text-foreground"
      >
        بازگشت به فهرست عطرها
      </Link>
    </main>
  );
}

/**
 * Merchant-facing explanation of the stored provenance. Deliberately explains
 * that editing the values below does NOT change the label — the write path
 * preserves `profileSource` on purpose, so an AI or reference profile stays
 * labelled as such after a manual edit.
 */
function provenanceHint(profile: { profileSource: ProfileProvenance | null } | null): string {
  const { source, description } = describeProfileSource(profile);

  if (source === null) {
    return `${description}. برای ساخت پروفایل، دکمهٔ تولید پروفایل را بزنید.`;
  }

  return `${description}. با ویرایش مقادیر، منبع پروفایل تغییر نمی‌کند.`;
}
