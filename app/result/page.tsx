import type { Metadata } from "next";

import ResultsView from "@/components/results/ResultsView";
import { CompassMark } from "@/components/ui-icons";
import { parseResultsParams } from "@/lib/results/params";
import { getResultsViewData } from "@/lib/results/service";

/**
 * GET /result — the Phase 5 results screen (server component).
 *
 * The quiz outcome arrives in the URL (see `lib/results/params.ts`): nine
 * 0–100 vector values, the archetype id, an optional store id. Everything
 * expensive and everything secret stays here on the server:
 *
 *   parse params (pure) → Phase 3 engine (ranked Top-N)
 *     → Phase 4 explanations (optional, degrades) → render
 *
 * The AI provider is created and consumed entirely server-side; no credential
 * or provider module is ever imported into client code.
 */

export const metadata: Metadata = {
  title: "پروفایل عطری تو | فیاج",
  description:
    "عطرهایی که با پروفایل عطری تو هماهنگ‌ترند، به همراه توضیح فارسی «چرا این عطر؟».",
};

interface ResultPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ResultPage({ searchParams }: ResultPageProps) {
  const params = parseResultsParams(await searchParams);

  if (!params.ok) {
    // A malformed URL is a user-facing navigation problem, not a crash: send
    // the shopper back to the quiz instead of rendering a broken screen.
    return <ResultErrorState />;
  }

  const data = await getResultsViewData(params.value, params.value.source);

  return (
    <main className="flex flex-1 flex-col">
      <ResultsView
        vector={params.value.vector}
        archetype={params.value.archetype}
        data={data}
      />
    </main>
  );
}

function ResultErrorState() {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-5 py-16 sm:px-8">
        <section className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-surface px-6 py-12 text-center">
          <CompassMark className="h-9 w-9 text-champagne-deep/70" />
          <h1 className="display-md text-ink">چیزی برای نمایش پیدا نکردیم</h1>
          <p className="max-w-sm text-sm leading-8 text-muted">
            برای دیدن پروفایل عطری و پیشنهادهای مناسب تو، اول آزمون کوتاه رو کامل کن.
          </p>
          <a
            href="/quiz"
            className="btn-primary mt-1 flex min-h-12 items-center justify-center rounded-full px-7 text-sm font-medium"
          >
            شروع آزمون
          </a>
        </section>
      </div>
    </main>
  );
}
