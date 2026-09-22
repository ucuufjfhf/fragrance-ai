import Link from "next/link";

import PerfumeForm from "@/components/admin/PerfumeForm";
import { getActiveStores } from "@/lib/admin/repository";
import { createPerfumeAction } from "@/app/admin/perfumes/actions";
import type { AdminActionState } from "@/app/admin/perfumes/actions";
import type { Metadata } from "next";

/**
 * GET /admin/perfumes/new — create form (Phase 6A, server component).
 * The store is selected via the query param; the form submits to the server
 * action which re-validates and enforces store isolation.
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
  const stores = await getActiveStores();
  const store = stores.find((candidate) => candidate.id === storeParam) ?? stores[0];

  if (!store) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
        <p className="rounded-3xl border border-border-soft bg-surface p-6 text-center text-sm text-muted">
          فروشگاه فعالی وجود ندارد.
        </p>
      </main>
    );
  }

  // Pre-bind the store id onto the real server action — `.bind` on an action
  // imported from a "use server" module is the supported way to pass an action
  // with arguments across the Server → Client boundary. An inline closure is
  // NOT serializable and crashes the render (Functions cannot be passed…).
  const boundAction = createPerfumeAction.bind(null, store.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold sm:text-3xl">افزودن عطر جدید</h1>
        <p className="text-sm text-muted">فروشگاه: {store.name}</p>
      </header>

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
    </main>
  );
}
