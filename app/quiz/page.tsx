import type { Metadata } from "next";

import { CosmicBackdrop, OrbitalDecoration } from "@/components/cosmic/cosmic-visuals";
import Quiz from "@/components/quiz/Quiz";

export const metadata: Metadata = {
  title: "آزمون سلیقه عطری | فیاج",
  description:
    "با ۱۰ سؤال کوتاه پروفایل عطری خودت رو پیدا کن و ببین چه رایحه‌ای با سلیقه‌ات هماهنگ‌تره.",
};

interface QuizPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * GET /quiz — the standalone quiz (Phase 1), now store-aware (Phase 9).
 *
 * The quiz runs inside the night-sky environment: the questions are the only
 * bright surface on the page, so attention lands on the choices.
 *
 * `?store=<storeId>` optionally pins a merchant's store: analytics events and
 * the resulting recommendations URL carry it, exactly like the Phase 8 widget.
 * There is no store selector in the UI — the store comes from the URL only
 * (the merchant's link/widget decides, never the shopper).
 */
export default async function QuizPage({ searchParams }: QuizPageProps) {
  const params = await searchParams;
  const rawStore = params.store;
  const storeId = (Array.isArray(rawStore) ? rawStore[0] : rawStore)?.trim() || undefined;

  return (
    <main
      data-surface="dark"
      className="relative isolate flex flex-1 flex-col overflow-hidden horizon"
    >
      <CosmicBackdrop stars={52} seed={3} grain intensity={0.7} constellation={false} />
      <OrbitalDecoration
        size={520}
        drift
        className="absolute -end-40 top-24 hidden opacity-35 lg:block"
      />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
        <Quiz storeId={storeId} />
      </div>
    </main>
  );
}
