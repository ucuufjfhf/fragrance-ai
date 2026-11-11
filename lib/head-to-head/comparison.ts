import {
  MATCHING_DIMENSIONS,
  type MatchingDimension,
  type MatchingProfileRow,
} from "@/lib/fragrance/profile";
import { clampRadarValue } from "@/lib/fragrance/radar";

/**
 * The head-to-head comparison's ONE logic source (batch 39, shared with the
 * widget in batch 40).
 *
 * `/result` and the embedded widget both compare exactly two perfumes on the
 * five scent axes and state the difference between the closeness indices their
 * cards print. That rule lives here so the two surfaces cannot drift:
 *
 *  - the axes are `MATCHING_DIMENSIONS`, in its order — the four personality
 *    axes never appear (a perfume carries no signal for them);
 *  - a bar's length is the perfume's own threaded 0–100 value, clamped; missing
 *    data reads as 0 and never borrows the shopper's vector or the other
 *    perfume's value;
 *  - the difference is the absolute difference of the two printed whole
 *    numbers (`Math.round` of the card's own score), so it can never claim a
 *    gap the two cards do not show.
 *
 * Framework-free: no React, no DOM, no storage. The two UI surfaces supply the
 * markup and colours; this module supplies the numbers.
 */

/** Anything carrying a name and the threaded five-axis profile. */
export interface HeadToHeadSubject {
  name: string;
  matchingProfile?: MatchingProfileRow | null;
}

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
  subject: HeadToHeadSubject,
): Array<{ axis: MatchingDimension; value: number }> {
  return MATCHING_DIMENSIONS.map((axis) => ({
    axis,
    value: axisValueFor(subject.matchingProfile, axis),
  }));
}

/**
 * The two perfumes the pair currently names, always distinct and in range.
 *
 * Returns null for a list shorter than two (nothing to compare). A shorter list
 * than the state expects can only come from a prop change between renders, so
 * the indices are clamped rather than read past the end.
 */
export function selectHeadToHeadPair<T extends { perfumeId: string }>(
  recommendations: readonly T[],
  pair: HeadToHeadPair,
): [T, T] | null {
  if (recommendations.length < 2) {
    return null;
  }

  const [left, right] = headToHeadOrder(pair).map((index) =>
    Math.min(index, recommendations.length - 1),
  ) as [number, number];

  const first = recommendations[left];
  const second =
    right === left
      ? recommendations[left === 0 ? 1 : 0]
      : recommendations[right];

  return [first, second];
}
