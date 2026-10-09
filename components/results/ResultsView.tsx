import { BrandMark, BottleMark, CompassMark, MoonMark, StarMark } from "@/components/ui-icons";
import TraitBars from "@/components/results/TraitBars";

import type { CSSProperties } from "react";
import Link from "next/link";

import { CosmicBackdrop } from "@/components/cosmic/cosmic-visuals";
import SectionHeading from "@/components/cosmic/SectionHeading";
import RecommendationCard from "@/components/results/RecommendationCard";
import { PERSONALITY_LABELS } from "@/lib/personality/labels";
import { formatPersianPercent } from "@/lib/persian";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { Archetype, PersonalityVector } from "@/types/personality";
import type { ResultsViewData } from "@/lib/results/service";

const AI_UNAVAILABLE_NOTICE = "توضیحات هوشمند فعلاً در دسترس نیست.";

interface ResultsViewProps {
  vector: PersonalityVector;
  archetype: Archetype;
  data: ResultsViewData;
}

/**
 * The full results screen: a night-sky profile reveal, then the editorial
 * recommendation list on ivory paper.
 *
 * Presentational and server-rendered. The ranked list is exactly the engine
 * output; the AI explanations map is consulted per perfume and its absence is
 * rendered as nothing (or the global notice) — never as a substitute text.
 *
 * The archetype accent colour is passed down as `--accent`, so the trait bars
 * and match meters below inherit the personality's own hue. Inside the dark
 * reveal the accent is used for decoration only (text stays ivory/champagne) to
 * keep contrast accessible for every archetype colour.
 */
export default function ResultsView({ vector, archetype, data }: ResultsViewProps) {
  const { recommendations, explanations, aiAvailable, isEmpty } = data;

  // The three strongest dimensions — real engine values, no recomputation.
  const topDimensions = [...PERSONALITY_DIMENSIONS]
    .sort((a, b) => vector[b] - vector[a])
    .slice(0, 3);

  return (
    <div
      className="flex flex-1 flex-col"
      style={
        {
          "--accent": archetype.accentColor,
          "--accent-soft": `color-mix(in srgb, ${archetype.accentColor} 12%, transparent)`,
        } as CSSProperties
      }
    >
      {/* ---------------- profile reveal: the night sky ---------------- */}
      <section data-surface="dark" className="relative isolate overflow-hidden horizon grain">
        <CosmicBackdrop stars={48} seed={17} constellation intensity={0.9} />
        <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-5 py-16 text-center sm:px-8 sm:py-20">
          <span className="eyebrow flex items-center gap-2 text-champagne">
            <MoonMark className="h-3.5 w-3.5" />
            پروفایل عطری شما
          </span>

          <span
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-full border"
            style={{ borderColor: `color-mix(in srgb, ${archetype.accentColor} 75%, transparent)` }}
          >
            <BottleMark className="h-7 w-7 text-ivory/85" />
          </span>

          <h1 className="display-xl max-w-xl text-ivory">{archetype.label}</h1>

          <span aria-hidden="true" className="hairline w-24" />

          <p className="max-w-lg text-sm leading-9 text-muted sm:text-base">
            {archetype.description}
          </p>

          <p className="max-w-lg rounded-[var(--radius-md)] border border-border-soft bg-surface/50 px-5 py-4 text-xs leading-8 text-ivory/80">
            <span className="me-1 inline-flex items-center gap-1.5 text-champagne">
              <StarMark className="h-3 w-3" />
              رایحه‌ای که بهت میاد:
            </span>
            {archetype.fragranceHint}
          </p>

          <dl className="mt-2 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {topDimensions.map((dimension) => (
              <div key={dimension} className="flex flex-col items-center gap-0.5">
                <dt className="text-[0.7rem] text-muted">{PERSONALITY_LABELS[dimension]}</dt>
                <dd className="tnum display-md text-champagne">
                  {formatPersianPercent(vector[dimension])}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------------- the editorial body: ivory paper ---------------- */}
      <section className="bg-background">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-5 py-14 sm:px-8 sm:py-20">
          <TraitBars vector={vector} />

          <div className="flex flex-col gap-6" aria-live="polite">
            <SectionHeading
              eyebrow="پیشنهاد فیاج"
              title="عطرهایی که بهت میاد"
              description="رتبه‌بندی بر پایهٔ نمرهٔ نُه بُعد سلیقه‌ات و از میان عطرهای موجود فروشگاه انجام شده است."
            />

            {!aiAvailable && !isEmpty ? (
              <p className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border-soft bg-surface px-4 py-3 text-xs leading-7 text-muted">
                <BrandMark className="h-3.5 w-3.5 shrink-0 text-champagne-deep/70" />
                {AI_UNAVAILABLE_NOTICE}
              </p>
            ) : null}

            {isEmpty ? (
              <div className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-surface px-6 py-12 text-center">
                <CompassMark className="h-8 w-8 text-champagne-deep/70" />
                <h3 className="display-md text-ink">رایحهٔ مطابقی پیدا نشد</h3>
                <p className="max-w-sm text-sm leading-8 text-muted">
                  فعلاً عطری مطابق با پروفایل تو پیدا نکردیم. می‌توانی آزمون را دوباره
                  انجام دهی یا فروشگاه دیگری را امتحان کنی.
                </p>
                <Link
                  href="/quiz"
                  className="btn-primary mt-1 flex min-h-12 items-center justify-center rounded-full px-7 text-sm font-medium"
                >
                  شروع دوباره آزمون
                </Link>
              </div>
            ) : (
              <ol className="flex list-none flex-col gap-5">
                {recommendations.map((recommendation) => (
                  <li key={recommendation.perfumeId}>
                    <RecommendationCard
                      recommendation={recommendation}
                      explanation={explanations.get(recommendation.perfumeId)}
                    />
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-border-soft pt-6">
            <p className="text-xs leading-7 text-muted">
              این نتیجه یک تحلیل سلیقه‌ای برای انتخاب عطر است، نه یک تست روانشناسی.
            </p>
            <Link
              href="/quiz"
              className="btn-ghost flex min-h-12 w-full items-center justify-center rounded-full text-sm sm:w-fit sm:px-8"
            >
              شروع دوباره
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
