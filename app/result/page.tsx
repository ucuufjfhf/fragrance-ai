import type { Metadata } from "next";

import ResultsView from "@/components/results/ResultsView";
import { parseResultsParams, serializeResultsParams } from "@/lib/results/params";
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
  title: "پروفایل عطری تو | عطر خودتو پیدا کن",
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

  // When a purchase context (season/occasion) was active and the filtered
  // inventory came back empty, the view offers a relax action: the identical
  // results URL WITHOUT the context tokens (vector, archetype, store, source
  // and audience are all preserved). No context → no action (legacy empty
  // state renders exactly as before).
  const contextActive = Boolean(params.value.season || params.value.occasion);
  const contextRelaxHref = contextActive
    ? `/result?${serializeResultsParams(
        params.value.vector,
        params.value.archetype.id,
        params.value.storeId,
        params.value.source,
        params.value.audience,
      )}`
    : null;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <ResultsView
        vector={params.value.vector}
        archetype={params.value.archetype}
        data={data}
        contextRelaxHref={contextRelaxHref}
      />
    </main>
  );
}

function ResultErrorState() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <section className="flex flex-col gap-4 rounded-3xl border border-border-soft bg-surface p-6 text-center sm:p-8">
        <span aria-hidden="true" className="text-4xl">
          🧭
        </span>
        <h1 className="text-xl font-bold sm:text-2xl">
          چیزی برای نمایش پیدا نکردیم
        </h1>
        <p className="text-sm leading-8 text-muted">
          برای دیدن پروفایل عطری و پیشنهادهای مناسب تو، اول آزمون کوتاه رو کامل کن.
        </p>
        <a
          href="/quiz"
          className="mx-auto flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-5 font-medium text-background transition-colors hover:bg-accent/90 sm:w-fit sm:px-8"
        >
          شروع آزمون
        </a>
      </section>
    </main>
  );
}
