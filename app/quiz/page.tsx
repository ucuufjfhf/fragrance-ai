import type { Metadata } from "next";

import Quiz from "@/components/quiz/Quiz";

export const metadata: Metadata = {
  title: "عطر خودتو پیدا کن | آزمون سلیقه عطری",
  description:
    "با ۱۰ سؤال کوتاه پروفایل عطری خودت رو پیدا کن و ببین چه رایحه‌ای با سلیقه‌ات هماهنگ‌تره.",
};

interface QuizPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * GET /quiz — the standalone quiz (Phase 1), now store-aware (Phase 9).
 *
 * `?store=<storeId>` optionally pins a merchant's store: analytics events and
 * the resulting recommendations URL carry it, exactly like the Phase 8 widget.
 * There is no store selector in the UI — the store comes from the URL only
 * (the merchant's link/widget decides, never the shopper). An absent or empty
 * param keeps the historical default-store behaviour.
 */
export default async function QuizPage({ searchParams }: QuizPageProps) {
  const params = await searchParams;
  const rawStore = params.store;
  const storeId = (Array.isArray(rawStore) ? rawStore[0] : rawStore)?.trim() || undefined;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <Quiz storeId={storeId} />
    </main>
  );
}
