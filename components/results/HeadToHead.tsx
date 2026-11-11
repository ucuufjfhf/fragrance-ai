"use client";

import { useState } from "react";

import ComparisonAxes from "@/components/head-to-head/ComparisonAxes";
import {
  DEFAULT_HEAD_TO_HEAD_PAIR,
  closenessGap,
  pickHeadToHeadPair,
  selectHeadToHeadPair,
  type HeadToHeadPair,
} from "@/lib/head-to-head/comparison";
import { formatPersianScore, toPersianDigits } from "@/lib/persian";
import type { MatchedPerfume } from "@/types/recommendation";

/**
 * Batch 39 — head-to-head on `/result`: any two of the top-3, compared on the
 * five scent axes side by side, plus the difference between the closeness
 * indices the cards already print.
 *
 * The numbers and the axis rows are NOT owned here any more: batch 40 extracted
 * them to `lib/head-to-head/comparison` and `components/head-to-head/
 * ComparisonAxes` so the embedded widget runs the same rule. This component
 * keeps the results-page layout, copy, palette and chip defaults; the exported
 * helpers below are re-exported for the batch-39 pins, which keep running
 * against the same behaviour.
 *
 * Everything here is display: the bars read the perfumes' own five values
 * threaded through the engine output (`MatchedPerfume.matchingProfile`) and the
 * difference is `Math.round(presentationScore)` on both sides — the SAME whole
 * number each card prints. Nothing is scored, re-ranked or re-fetched, and the
 * four personality axes never appear (a perfume carries no signal for them).
 *
 * Deliberately still: no grow animation, no keyframes, no transition and no
 * client-side timers. The block renders complete on the server and under
 * `prefers-reduced-motion`, so there is no motion gate to get wrong.
 */

export {
  DEFAULT_HEAD_TO_HEAD_PAIR,
  axisValueFor,
  closenessGap,
  closenessOf,
  headToHeadAxes,
  headToHeadOrder,
  pickHeadToHeadPair,
} from "@/lib/head-to-head/comparison";
export type { HeadToHeadPair } from "@/lib/head-to-head/comparison";

/** The results page's existing gold→accent fill, both sides. */
const RESULT_BAR_FILL = {
  backgroundImage:
    "linear-gradient(to right, var(--marker-gold) 0%, var(--accent) 100%)",
} as const;

export default function HeadToHead({
  recommendations,
}: {
  recommendations: readonly MatchedPerfume[];
}) {
  const [pair, setPair] = useState<HeadToHeadPair>(DEFAULT_HEAD_TO_HEAD_PAIR);

  // Fewer than two perfumes means there is nothing to compare: the block is
  // simply absent, never a comparison against a placeholder.
  const selected = selectHeadToHeadPair(recommendations, pair);

  if (!selected) {
    return null;
  }

  const [first, second] = selected;
  const gap = closenessGap(first.presentationScore, second.presentationScore);
  const pairIds = new Set([first.perfumeId, second.perfumeId]);

  return (
    <section className="flex w-full flex-col gap-5 rounded-3xl border border-border-soft bg-surface p-5 sm:p-6 lg:mx-auto lg:max-w-2xl">
      <div className="flex flex-col gap-2">
        <span aria-hidden="true" className="h-px w-12 bg-accent/50" />
        <h2 className="font-display text-2xl font-semibold leading-tight tracking-[-0.01em] text-foreground sm:text-3xl">
          مقایسهٔ رودررو
        </h2>
        <p className="text-sm leading-7 text-muted">
          دو عطر از سه پیشنهادتون رو انتخاب کنید تا پنج محور رایحه‌شون رو کنار هم
          ببینید.
        </p>
      </div>

      {/* --- pair picker: three real buttons, exactly two pressed --- */}
      <div
        role="group"
        aria-label="انتخاب دو عطر برای مقایسه"
        className="flex flex-wrap gap-2"
      >
        {recommendations.slice(0, 3).map((recommendation, index) => {
          const pressed = pairIds.has(recommendation.perfumeId);
          return (
            <button
              key={recommendation.perfumeId}
              type="button"
              data-perfume-id={recommendation.perfumeId}
              aria-pressed={pressed}
              onClick={() =>
                setPair((current) =>
                  pickHeadToHeadPair(current, index, recommendations.length),
                )
              }
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border px-4 text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent/40 ${
                pressed
                  ? "border-accent bg-accent-soft font-medium text-foreground"
                  : "border-border-soft bg-surface-2 text-muted hover:border-accent/40"
              }`}
            >
              <span className="tnum text-xs text-muted">
                {toPersianDigits(recommendation.rank)}
              </span>
              <span>{recommendation.name}</span>
            </button>
          );
        })}
      </div>

      {/* --- the two chosen perfumes: names and their own printed indices --- */}
      <div dir="ltr" className="grid grid-cols-2 gap-4">
        {[first, second].map((recommendation) => (
          <div
            key={`slot-${recommendation.perfumeId}`}
            data-slot="perfume"
            className="flex flex-col gap-1 text-right"
          >
            <span className="text-sm font-semibold leading-7 text-foreground">
              {recommendation.name}
            </span>
            <span className="tnum text-xs text-muted">
              شاخص نزدیکی {formatPersianScore(recommendation.presentationScore)}
            </span>
          </div>
        ))}
      </div>

      {/* --- five axis rows, two bars each (left = first, right = second) --- */}
      <ComparisonAxes
        first={first}
        second={second}
        sideStyles={[RESULT_BAR_FILL, RESULT_BAR_FILL]}
      />

      {/* The difference of the two printed whole numbers. A tie is a real 0. */}
      <p className="text-sm font-medium text-foreground">
        اختلاف شاخص نزدیکی:{" "}
        <span className="tnum">{toPersianDigits(gap)}</span>
      </p>
    </section>
  );
}
