import type { Metadata } from "next";

import BottleSilhouettes from "@/components/BottleSilhouettes";
import ResultsView from "@/components/results/ResultsView";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import { BrandMark } from "@/components/ui-icons";
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
  title: "پروفایل عطری شما | عطر خودتون رو پیدا کنید",
  description:
    "عطرهایی که با پروفایل عطری شما هماهنگ‌ترند، به همراه توضیح فارسی «چرا این عطر؟».",
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
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
        {/* The results screen's one note of depth: a single faint bottle
            silhouette behind the content, in its own fixed backdrop (see
            components/BottleSilhouettes.tsx). Decorative and inert — it never
            changes the data, the ranking, the layout or the copy. Declared
            before ResultsView so it also sits behind the ambient particles. */}
        <BottleSilhouettes variant="accent" />

        <ResultsView
          vector={params.value.vector}
          archetype={params.value.archetype}
          data={data}
          contextRelaxHref={contextRelaxHref}
          answers={params.value.answers}
        />
      </main>

      <SiteFooter />
    </div>
  );
}

function ResultErrorState() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
        <section className="flex flex-col items-center gap-4 rounded-3xl border border-border-soft bg-surface p-6 text-center shadow-[var(--shadow-card)] sm:p-8">
          <BrandMark className="mx-auto h-8 w-8 text-accent" />
          <h1 className="font-heading text-xl font-bold sm:text-2xl">
            چیزی برای نمایش پیدا نکردیم
          </h1>
          <p className="text-sm leading-8 text-muted">
            برای دیدن پروفایل عطری و پیشنهادهای مناسب شما، اول آزمون کوتاه رو کامل کنید.
          </p>
          <a
            href="/quiz"
            className="btn-primary mx-auto flex min-h-12 w-full items-center justify-center px-5 font-medium text-background sm:w-fit sm:px-8"
          >
            شروع آزمون
          </a>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
