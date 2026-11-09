import { BrandMark } from "@/components/ui-icons";
import { archetypeEmblemImageFor } from "@/components/archetype-emblems";
import AmbientParticles from "@/components/AmbientParticles";
import TraitBars from "@/components/results/TraitBars";

import { Fragment } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
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
import { splitEmphasis } from "@/lib/personality/archetypes";
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
 * nine-axis profile, not the single strongest one. Its seal is a gold-ringed
 * medallion showing the archetype's illustrated emblem — the same bundled
 * artwork every other surface uses. No archetype math, scoring or ordering
 * lives here.
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
            className="quiz-rise relative mt-2 flex h-28 w-28 items-center justify-center rounded-full border-[3px] bg-surface-2 shadow-[var(--shadow-soft)] sm:h-32 sm:w-32"
            style={{
              animationDelay: "120ms",
              animationFillMode: "backwards",
              // Gold ring around the medallion — the same gold the arc uses.
              borderColor: "var(--marker-gold)",
            }}
          >
            {/* Faint gold halo, one step outside the ring. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-2 rounded-full border"
              style={{
                borderColor: "color-mix(in srgb, var(--marker-gold) 25%, transparent)",
              }}
            />
            {/* The archetype's illustrated emblem — a pure id lookup, never an
                engine value — clipped to the medallion. Decorative: the seal
                above already carries the accessible name. */}
            <span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-full">
              {/* Bundled public/ asset, not merchant data: a plain <img> ships the
                  exact file, so the artwork is never re-encoded. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={archetypeEmblemImageFor(archetype.id)}
                alt=""
                width={1600}
                height={1600}
                className="h-full w-full object-cover"
              />
            </span>
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

          {/* The copy is split, never rewritten: the trait words the archetype
              declares are wrapped in a band in the archetype's OWN accent
              (`.results-emphasis` reads the `--accent` set on this root), and
              rejoining the runs reproduces `description` byte-for-byte. */}
          <p
            className="quiz-rise max-w-md text-sm leading-8 text-foreground/80"
            style={{ animationDelay: "320ms", animationFillMode: "backwards" }}
          >
            {splitEmphasis(archetype.description, archetype.emphasisWords).map(
              (segment, index) =>
                segment.emphasized ? (
                  <span key={index} className="results-emphasis">
                    {segment.text}
                  </span>
                ) : (
                  <Fragment key={index}>{segment.text}</Fragment>
                ),
            )}
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

      <section className="flex w-full flex-col items-center gap-3 rounded-3xl border border-border-soft bg-surface p-6 text-center lg:mx-auto lg:max-w-2xl">
        <SectionHeadline>رایحه‌ای که بهتون میاد</SectionHeadline>
        <span aria-hidden="true" className="h-px w-10 bg-border-soft" />
        <p className="text-sm leading-8 text-muted">{archetype.fragranceHint}</p>
      </section>

      {/* --- top traits: the pronounced dimensions, engine values only --- */}
      <div className="w-full lg:mx-auto lg:max-w-2xl">
        <TraitBars vector={vector} />
      </div>

      {/* --- recommendations: a travel note in three stops (Memo lineage) --- */}
      <section className="relative flex flex-col gap-4" aria-live="polite">
        {/* Header area of the note — stamp, kicker, headline, subtitle — and the
            ink rule that opens the stops. On desktop this block is capped at a
            readable measure and centred while the stops below go full width;
            the stamp is absolute against THIS block, so it keeps tucking into
            the header's end side exactly as it does against the section on
            narrow screens. */}
        <div className="relative flex w-full flex-col gap-4 lg:mx-auto lg:max-w-2xl">
          {/* The travel note's own postage stamp. Ink motif, decorative only —
              no meaning, no state. */}
          <Image
            src="/quiz/motif-ink-stamp.webp"
            alt=""
            aria-hidden="true"
            width={72}
            height={72}
            className="pointer-events-none absolute -top-2 end-0 h-auto w-[72px] -rotate-6 select-none"
          />
          <div className="relative flex flex-col gap-2 pe-24 sm:pe-28">
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

          {/* Ink motif: the inked rule that closes the travel note and opens the
              three stops. Decorative only. */}
          <div aria-hidden="true" className="flex justify-center py-1">
            <Image
              src="/quiz/motif-ink-divider.webp"
              alt=""
              aria-hidden="true"
              width={1301}
              height={154}
              className="h-8 w-auto object-contain"
            />
          </div>
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
                  className="btn-primary mx-auto flex min-h-12 w-full items-center justify-center px-5 font-medium text-background sm:w-fit sm:px-8"
                >
                  حذف فیلتر فصل و موقعیت
                </Link>
                <Link
                  href="/quiz"
                  className="btn-secondary mx-auto flex min-h-12 w-full items-center justify-center px-5 text-sm text-muted hover:text-foreground sm:w-fit sm:px-8"
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
                  className="btn-primary mx-auto flex min-h-12 w-full items-center justify-center px-5 font-medium text-background sm:w-fit sm:px-8"
                >
                  شروع دوباره آزمون
                </Link>
              </>
            )}
          </div>
        ) : (
          <StagedReveal listClassName="lg:grid lg:grid-cols-3 lg:items-stretch lg:gap-6">
            {recommendations.map((recommendation, index) => (
              // Desktop: one grid cell per stop, equal heights. The two-row grid
              // gives the card's h-full an exact cell below the stop label
              // instead of letting it overflow by that label's height.
              <li
                key={recommendation.perfumeId}
                className="quiz-rise h-full lg:grid lg:grid-rows-[auto_1fr]"
              >
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
      <div className="w-full lg:mx-auto lg:max-w-2xl">
        <AnswerDecode items={decoded} />
      </div>

      <p className="w-full text-xs leading-7 text-muted lg:mx-auto lg:max-w-2xl">
        این نتیجه یک تحلیل سلیقه‌ای برای انتخاب عطر است، نه یک تست روانشناسی.
      </p>

      <div className="flex w-full flex-col gap-3 sm:flex-row lg:mx-auto lg:max-w-2xl">
        <ShareResultButton />
        <Link
          href="/quiz"
          className="btn-secondary flex min-h-12 flex-1 items-center justify-center px-5 text-sm text-muted hover:text-foreground"
        >
          شروع دوباره
        </Link>
      </div>
    </div>
  );
}
