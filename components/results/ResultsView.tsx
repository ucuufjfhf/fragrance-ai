import { BrandMark } from "@/components/ui-icons";
import { ARCHETYPE_ICON_POP_CSS } from "@/components/archetype-icons";
import { ArchetypeEmblem } from "@/components/archetype-icon-map";
import AmbientParticles from "@/components/AmbientParticles";
import TraitBars from "@/components/results/TraitBars";

import type { CSSProperties } from "react";
import Link from "next/link";

import AnswerDecode from "@/components/results/AnswerDecode";
import ShareResultButton from "@/components/results/ShareResultButton";
import MarkerWipe from "@/components/quiz/MarkerWipe";
import SectionHeadline from "@/components/results/SectionHeadline";
import RecommendationCard from "@/components/results/RecommendationCard";
import StagedReveal from "@/components/results/StagedReveal";
import { decodeAnswers } from "@/lib/personality/answer-decode";
import {
  QUESTION_HIGHLIGHTS,
  splitHighlighted,
} from "@/lib/personality/question-highlights";
import { toPersianDigits } from "@/lib/persian";
import type {
  Archetype,
  PersonalityVector,
  QuizAnswer,
} from "@/types/personality";
import type { ResultsViewData } from "@/lib/results/service";

/** The travel-note headline (Memo lineage) — the wipe's emotional core. */
const TRAVEL_NOTE_HEADLINE = "یادداشت سفر عطری شما";

/** Stop captions for the journey: the 3 cards as stations, in rank order. */
const JOURNEY_STOPS = ["اول", "دوم", "سوم"] as const;

interface ResultsViewProps {
  vector: PersonalityVector;
  archetype: Archetype;
  data: ResultsViewData;
  /**
   * The shopper's recorded answers for the “how did I get here” decode.
   * Absent on legacy links — the decode section then hides itself.
   */
  answers?: readonly QuizAnswer[];
  /**
   * When the empty result was produced by an active season/occasion context,
   * this is the same results URL without those filters — rendered as the
   * "relax the filters" action. `null`/absent → the legacy empty state.
   */
  contextRelaxHref?: string | null;
}

/**
 * The full results screen: profile header, ranked recommendations, states.
 *
 * Presentational and server-rendered. The ranked list is exactly the engine
 * output; a per-perfume AI explanation is rendered as decoration when present
 * and its absence is simply rendered as nothing — the deterministic list is
 * always shown cleanly, never behind a "explanations unavailable" dead end.
 *
 * The archetype header is a choreographed reveal (a staggered `quiz-rise`
 * cascade, reduced-motion aware) and names the selection basis: the complete
 * nine-axis profile, not the single strongest one. Its seal shows the
 * archetype's own emblem, which pops in after the seal lands. No archetype math,
 * scoring or ordering lives here.
 */
export default function ResultsView({
  vector,
  archetype,
  data,
  contextRelaxHref = null,
  answers = [],
}: ResultsViewProps) {
  const { recommendations, explanations, isEmpty } = data;
  const decoded = decodeAnswers(answers, vector);
  const travelHighlight = splitHighlighted(
    TRAVEL_NOTE_HEADLINE,
    QUESTION_HIGHLIGHTS["travel-note"],
  );

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

      {/* --- archetype reveal (Phase 1 data, same contract as the quiz card) --- */}
      <section className="relative overflow-hidden rounded-[2rem] border border-accent/30 bg-accent-soft px-6 py-10 text-center shadow-[var(--shadow-soft)] sm:px-10 sm:py-12">
        {/* Emblem motion contract — reduced-motion bypass included. */}
        <style>{ARCHETYPE_ICON_POP_CSS}</style>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/3 rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 30%, white), transparent)",
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-12 top-0 h-px bg-accent/20"
        />

        <div className="relative flex flex-col items-center gap-3">
          <span
            className="quiz-rise text-sm font-medium text-accent"
            style={{ animationDelay: "40ms", animationFillMode: "backwards" }}
          >
            <BrandMark className="ml-1 inline h-4 w-4" /> پروفایل عطری شما
          </span>

          <span
            role="img"
            aria-label={archetype.label}
            className="quiz-rise relative mt-2 flex h-16 w-16 items-center justify-center rounded-full border border-accent/30 bg-background/70 text-accent shadow-[var(--shadow-card)]"
            style={{ animationDelay: "120ms", animationFillMode: "backwards" }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 -m-2.5 rounded-full border border-accent/20"
            />
            {/* Emblem for this archetype — a pure id lookup, never an engine
                value. */}
            <ArchetypeEmblem
              archetypeId={archetype.id}
              className="archetype-icon-pop h-8 w-8"
            />
          </span>

          <h1
            className="quiz-rise mt-2 font-heading text-3xl font-bold leading-tight text-foreground sm:text-4xl"
            style={{ animationDelay: "200ms", animationFillMode: "backwards" }}
          >
            {archetype.label}
          </h1>

          <span
            aria-hidden="true"
            className="quiz-rise mt-1 h-px w-16 bg-accent/40"
            style={{ animationDelay: "260ms", animationFillMode: "backwards" }}
          />

          <p
            className="quiz-rise max-w-md text-sm leading-8 text-foreground/80"
            style={{ animationDelay: "320ms", animationFillMode: "backwards" }}
          >
            {archetype.description}
          </p>

          {/* Selection basis — the archetype is the nearest match across the
              WHOLE nine-axis vector, not the single strongest axis. Copy only. */}
          <p
            className="quiz-rise mt-1 max-w-md text-xs leading-7 text-muted"
            style={{ animationDelay: "380ms", animationFillMode: "backwards" }}
          >
            این پروفایل از روی همهٔ ۹ محور شخصیتت انتخاب شده است — نه فقط بالاترین محور.
          </p>
        </div>
      </section>

      <section className="flex flex-col items-center gap-3 rounded-3xl border border-border-soft bg-surface p-6 text-center">
        <SectionHeadline>رایحه‌ای که بهتون میاد</SectionHeadline>
        <span aria-hidden="true" className="h-px w-10 bg-border-soft" />
        <p className="text-sm leading-8 text-muted">{archetype.fragranceHint}</p>
      </section>

      {/* --- top traits: the pronounced dimensions, engine values only --- */}
      <TraitBars vector={vector} />

      {/* --- recommendations: a travel note in three stops (Memo lineage) --- */}
      <section className="flex flex-col gap-4" aria-live="polite">
        <div className="flex flex-col gap-2">
          <span aria-hidden="true" className="h-px w-12 bg-accent/50" />
          <p className="text-sm font-medium text-muted">عطرهایی که بهتون میاد</p>
          <h2 className="font-display text-3xl font-semibold leading-[1.1] tracking-[-0.01em] text-foreground sm:text-4xl">
            {travelHighlight ? (
              <>
                {travelHighlight[0]}
                <MarkerWipe replayKey="travel-note">{travelHighlight[1]}</MarkerWipe>
                {travelHighlight[2]}
              </>
            ) : (
              TRAVEL_NOTE_HEADLINE
            )}
          </h2>
          <p className="font-editorial text-sm leading-7 text-muted">
            سه ایستگاه در سفر عطری شما؛ هر عطر، یک مقصد.
          </p>
        </div>

        {isEmpty ? (
          <div className="flex flex-col gap-4 rounded-3xl border border-border-soft bg-surface p-6 text-center">
            {contextRelaxHref ? (
              // Context-filtered empty state: the filters are NEVER bypassed
              // silently — the shopper is told no perfume matches all of the
              // selected preferences and is offered a clear action to relax
              // the season/occasion context (the deterministic list itself is
              // untouched).
              <>
                <p className="text-sm leading-8 text-muted">
                  عطری پیدا نکردیم که همهٔ ترجیحات انتخابیِ شما (فصل و موقعیت)
                  رو داشته باشه.
                </p>
                <Link
                  href={contextRelaxHref}
                  className="btn-primary mx-auto flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-5 font-medium text-background sm:w-fit sm:px-8"
                >
                  حذف فیلتر فصل و موقعیت
                </Link>
                <Link
                  href="/quiz"
                  className="mx-auto flex min-h-12 w-full items-center justify-center rounded-2xl border border-border-soft px-5 text-sm text-muted transition-colors hover:border-accent/50 hover:text-foreground sm:w-fit sm:px-8"
                >
                  شروع دوباره آزمون
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm leading-8 text-muted">
                  فعلاً عطری مطابق با پروفایل شما پیدا نکردیم.
                </p>
                <Link
                  href="/quiz"
                  className="btn-primary mx-auto flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-5 font-medium text-background sm:w-fit sm:px-8"
                >
                  شروع دوباره آزمون
                </Link>
              </>
            )}
          </div>
        ) : (
          <StagedReveal>
            {recommendations.map((recommendation, index) => (
              <li key={recommendation.perfumeId} className="quiz-rise">
                <p className="mb-2 text-xs font-medium tracking-wide text-muted">
                  ایستگاه {JOURNEY_STOPS[index] ?? toPersianDigits(index + 1)}
                </p>
                <RecommendationCard
                  recommendation={recommendation}
                  explanation={explanations.get(recommendation.perfumeId)}
                />
              </li>
            ))}
          </StagedReveal>
        )}
      </section>

      {/* --- how did I get here: the shopper's own answers, decoded --- */}
      <AnswerDecode items={decoded} />

      <p className="text-xs leading-7 text-muted">
        این نتیجه یک تحلیل سلیقه‌ای برای انتخاب عطر است، نه یک تست روانشناسی.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <ShareResultButton />
        <Link
          href="/quiz"
          className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-border-soft px-5 text-sm text-muted transition-colors hover:border-accent/50 hover:text-foreground"
        >
          شروع دوباره
        </Link>
      </div>
    </div>
  );
}
