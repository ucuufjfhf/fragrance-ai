import Link from "next/link";

import AdminShell from "@/components/admin/AdminShell";
import PerfumeForm from "@/components/admin/PerfumeForm";
import { getActiveStores } from "@/lib/admin/repository";
import { createPerfumeAction } from "@/app/admin/perfumes/actions";
import type { AdminActionState } from "@/app/admin/perfumes/actions";
import type { Metadata } from "next";

import { requireAdmin } from "@/lib/admin/server-access";

/**
 * GET /admin/perfumes/new — create form (Phase 6A, server component).
 * Server-side admin gate: unauthenticated requests are redirected to the
 * gate page before anything renders. The store is selected via the query
 * param; the form submits to the server action which re-validates and
 * enforces store isolation.
 */
export const metadata: Metadata = {
  title: "افزودن عطر | مدیریت",
  robots: { index: false, follow: false },
};

interface NewPerfumePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewPerfumePage({ searchParams }: NewPerfumePageProps) {
  const params = await searchParams;
  const storeParam = Array.isArray(params.store) ? params.store[0] : params.store;

  await requireAdmin(`/admin/perfumes/new${storeParam ? `?store=${encodeURIComponent(storeParam)}` : ""}`);

  const stores = await getActiveStores();
  const store = stores.find((candidate) => candidate.id === storeParam) ?? stores[0];

  if (!store) {
    return (
      <AdminShell title="افزودن عطر جدید" current="perfumes" width="md">
        <p className="rounded-[var(--radius-lg)] border border-border-soft bg-surface p-6 text-center text-sm text-muted">
          فروشگاه فعالی وجود ندارد.
        </p>
      </AdminShell>
    );
  }

  // Pre-bind the store id onto the real server action — `.bind` on an action
  // imported from a "use server" module is the supported way to pass an action
  // with arguments across the Server → Client boundary. An inline closure is
  // NOT serializable and crashes the render (Functions cannot be passed…).
  const boundAction = createPerfumeAction.bind(null, store.id);

  return (
    <AdminShell
      title="افزودن عطر جدید"
      description={`فروشگاه: ${store.name}`}
      current="perfumes"
    >
      <PerfumeForm
        storeId={store.id}
        action={boundAction}
        submitLabel="ثبت عطر"
      />

      <Link
        href={`/admin/perfumes?store=${store.id}`}
        className="mx-auto text-xs text-muted underline underline-offset-4 transition-colors hover:text-foreground"
      >
        بازگشت به فهرست عطرها
      </Link>
    </AdminShell>
  );
}
