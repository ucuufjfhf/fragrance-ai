"use client";

import { useState } from "react";

import {
  MATCHING_DIMENSIONS,
  type MatchingDimension,
  type MatchingProfileRow,
} from "@/lib/fragrance/profile";
import { SCENT_RADAR_LABELS, clampRadarValue } from "@/lib/fragrance/radar";
import { formatPersianScore, toPersianDigits } from "@/lib/persian";
import type { MatchedPerfume } from "@/types/recommendation";

/**
 * Batch 39 — head-to-head: any two of the top-3, compared on the five scent
 * axes side by side, plus the difference between the closeness indices the
 * cards already print.
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

/** The two selected positions in the recommendation list. */
export interface HeadToHeadPair {
  first: number;
  second: number;
}

/** Ranks 1 and 2 until the shopper picks otherwise. */
export const DEFAULT_HEAD_TO_HEAD_PAIR: HeadToHeadPair = { first: 0, second: 1 };

/**
 * Swaps a chip into the pair.
 *
 * Tapping an already-selected perfume is a no-op, and an out-of-list index is
 * ignored, so the pair is always exactly two distinct perfumes. The most
 * recently selected slot survives and the older one is replaced — the shopper
 * keeps what they just chose and swaps out the one they moved on from.
 */
export function pickHeadToHeadPair(
  pair: HeadToHeadPair,
  index: number,
  count: number,
): HeadToHeadPair {
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    return pair;
  }

  if (index === pair.first || index === pair.second) {
    return pair;
  }

  return { first: pair.second, second: index };
}

/** The pair in displayed order: the lower rank is always the first column. */
export function headToHeadOrder(pair: HeadToHeadPair): [number, number] {
  return pair.first <= pair.second
    ? [pair.first, pair.second]
    : [pair.second, pair.first];
}

/**
 * The whole number the recommendation cards print — one rounding, shared so the
 * difference can never disagree with the two printed indices.
 */
export function closenessOf(presentationScore: number): number {
  return Math.round(presentationScore);
}

/** Absolute difference of the two printed closeness indices (0 on a tie). */
export function closenessGap(
  firstPresentationScore: number,
  secondPresentationScore: number,
): number {
  return Math.abs(
    closenessOf(firstPresentationScore) - closenessOf(secondPresentationScore),
  );
}

/**
 * One perfume's value on one axis. Missing or invalid data reads as 0 — the
 * shopper's vector is never borrowed and the other perfume's value is never
 * reused.
 */
export function axisValueFor(
  profile: MatchingProfileRow | null | undefined,
  axis: MatchingDimension,
): number {
  const value = profile?.[axis];
  return typeof value === "number" ? clampRadarValue(value) : 0;
}

/** One perfume's five-axis bars, in `MATCHING_DIMENSIONS` order. */
export function headToHeadAxes(
  recommendation: MatchedPerfume,
): Array<{ axis: MatchingDimension; value: number }> {
  return MATCHING_DIMENSIONS.map((axis) => ({
    axis,
    value: axisValueFor(recommendation.matchingProfile, axis),
  }));
}

export default function HeadToHead({
  recommendations,
}: {
  recommendations: readonly MatchedPerfume[];
}) {
  const [pair, setPair] = useState<HeadToHeadPair>(DEFAULT_HEAD_TO_HEAD_PAIR);

  // Fewer than two perfumes means there is nothing to compare: the block is
  // simply absent, never a comparison against a placeholder.
  if (recommendations.length < 2) {
    return null;
  }

  const [firstIndex, secondIndex] = headToHeadOrder(pair).map((index) =>
    // A shorter list than the state expects can only come from a prop change
    // between renders; clamp instead of indexing past the end.
    Math.min(index, recommendations.length - 1),
  ) as [number, number];

  // The two slots are always distinct: the clamp above can only collide on a
  // one-item list, which already returned.
  const first = recommendations[firstIndex];
  const second =
    secondIndex === firstIndex
      ? recommendations[firstIndex === 0 ? 1 : 0]
      : recommendations[secondIndex];

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
      <div className="flex flex-col gap-4">
        {MATCHING_DIMENSIONS.map((axis) => {
          const label = SCENT_RADAR_LABELS[axis];
          const leftValue = axisValueFor(first.matchingProfile, axis);
          const rightValue = axisValueFor(second.matchingProfile, axis);

          return (
            <div
              key={axis}
              data-axis={axis}
              role="group"
              aria-label={`${label}؛ ${first.name} ${toPersianDigits(leftValue)}، ${second.name} ${toPersianDigits(rightValue)}`}
              className="flex flex-col gap-2"
            >
              <span className="text-center text-xs font-medium text-muted">
                {label}
              </span>
              <div dir="ltr" className="grid grid-cols-2 gap-4">
                {[
                  { recommendation: first, value: leftValue, side: "first" },
                  { recommendation: second, value: rightValue, side: "second" },
                ].map((entry) => (
                  <div
                    key={`${axis}-${entry.side}`}
                    data-side={entry.side}
                    className="flex flex-col gap-1"
                  >
                    <span className="tnum text-xs font-semibold text-foreground">
                      {toPersianDigits(entry.value)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="block h-2 w-full overflow-hidden rounded-full bg-surface-2"
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${entry.value}%`,
                          backgroundImage:
                            "linear-gradient(to right, var(--marker-gold) 0%, var(--accent) 100%)",
                        }}
                      />
                    </span>
                    <span className="sr-only">
                      {entry.recommendation.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* The difference of the two printed whole numbers. A tie is a real 0. */}
      <p className="text-sm font-medium text-foreground">
        اختلاف شاخص نزدیکی:{" "}
        <span className="tnum">{toPersianDigits(gap)}</span>
      </p>
    </section>
  );
}
