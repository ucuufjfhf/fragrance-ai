import { BrandMark, BottleMark } from "@/components/ui-icons";
import AmbientParticles from "@/components/AmbientParticles";
import TraitBars from "@/components/results/TraitBars";

import type { CSSProperties } from "react";
import Link from "next/link";

import RecommendationCard from "@/components/results/RecommendationCard";
import type { Archetype, PersonalityVector } from "@/types/personality";
import type { ResultsViewData } from "@/lib/results/service";

const AI_UNAVAILABLE_NOTICE = "توضیحات هوشمند فعلاً در دسترس نیست.";

interface ResultsViewProps {
  vector: PersonalityVector;
  archetype: Archetype;
  data: ResultsViewData;
}

/**
 * The full results screen: profile header, ranked recommendations, states.
 *
 * Presentational and server-rendered. The ranked list is exactly the engine
 * output; the AI explanations map is consulted per perfume and its absence is
 * rendered as nothing (or the global notice) — never as a substitute text.
 */
export default function ResultsView({
  vector,
  archetype,
  data,
}: ResultsViewProps) {
  const { recommendations, explanations, aiAvailable, isEmpty } = data;

  return (
    <div
      className="flex flex-col gap-6 transition-colors duration-300"
      style={{
        "--accent": archetype.accentColor,
        "--accent-soft": `color-mix(in srgb, ${archetype.accentColor} 14%, white)`,
        "--accent-contrast": archetype.id === "clean-minimalist" || archetype.id === "elegant-classic" ? "#2A2420" : "#FFFFFF",
      } as CSSProperties}
    >
      {/* Shared ambient background — identical implementation to the
          Fragrance Profile screen (components/quiz/QuizResultCard.tsx). */}
      <AmbientParticles />

      {/* --- profile header (Phase 1 data, same contract as the quiz card) --- */}
      <section className="quiz-rise flex flex-col items-center gap-3 rounded-3xl border border-accent/40 bg-accent-soft p-6 text-center sm:p-8">
        <span className="text-sm text-accent"><BrandMark className="ml-1 inline h-4 w-4" /> پروفایل عطری شما</span>
        <BottleMark className="h-8 w-8 text-accent" />
        <h1 className="text-2xl font-bold sm:text-3xl">{archetype.label}</h1>
        <p className="text-sm leading-8 text-foreground/80">
          {archetype.description}
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-3xl border border-border-soft bg-surface p-6">
        <h2 className="font-semibold">رایحه‌ای که بهت میاد</h2>
        <p className="text-sm leading-8 text-muted">{archetype.fragranceHint}</p>
      </section>

      {/* --- top traits: the pronounced dimensions, engine values only --- */}
      <TraitBars vector={vector} />

      {/* --- recommendations --- */}
      <section className="flex flex-col gap-4" aria-live="polite">
        <h2 className="text-xl font-bold sm:text-2xl">عطرهایی که بهت میاد</h2>

        {!aiAvailable && !isEmpty ? (
          <p className="rounded-2xl border border-border-soft bg-surface-2 p-4 text-xs leading-7 text-muted">
            {AI_UNAVAILABLE_NOTICE}
          </p>
        ) : null}

        {isEmpty ? (
          <div className="flex flex-col gap-4 rounded-3xl border border-border-soft bg-surface p-6 text-center">
            <p className="text-sm leading-8 text-muted">
              فعلاً عطری مطابق با پروفایل تو پیدا نکردیم.
            </p>
            <Link
              href="/quiz"
              className="mx-auto flex min-h-12 w-full items-center justify-center rounded-2xl btn-primary bg-accent px-5 font-medium text-background transition-colors hover:bg-accent/90 sm:w-fit sm:px-8"
            >
              شروع دوباره آزمون
            </Link>
          </div>
        ) : (
          <ol className="flex list-none flex-col gap-4">
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
      </section>

      <p className="text-xs leading-7 text-muted">
        این نتیجه یک تحلیل سلیقه‌ای برای انتخاب عطر است، نه یک تست روانشناسی.
      </p>

      <Link
        href="/quiz"
        className="flex min-h-12 items-center justify-center rounded-2xl border border-border-soft px-5 text-sm text-muted transition-colors hover:border-accent/50 hover:text-foreground"
      >
        شروع دوباره
      </Link>
    </div>
  );
}
