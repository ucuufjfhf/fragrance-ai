import type { Metadata } from "next";

import Quiz from "@/components/quiz/Quiz";
import QuizAmbience from "@/components/quiz/QuizAmbience";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  title: "عطر خودتو پیدا کن | آزمون سلیقه عطری",
  description:
    "با ۱۰ سؤال کوتاه پروفایل عطری خودتون رو پیدا کنید و ببینید چه رایحه‌ای با سلیقه‌تون هماهنگ‌تره.",
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
    <div className="flex flex-1 flex-col">
      {/* The quiz's own atmosphere: warm washes behind the flow and a film-grain
          overlay on top of it. Both layers are decorative and inert — see
          components/quiz/QuizAmbience.tsx. */}
      <QuizAmbience />

      <SiteHeader />

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
        <Quiz storeId={storeId} />
      </main>

      <SiteFooter />
    </div>
  );
}
