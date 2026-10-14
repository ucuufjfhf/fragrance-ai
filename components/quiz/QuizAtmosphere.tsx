import type { CSSProperties } from "react";

/**
 * Quiz ambience, act 2 — the three layers the FLOW drives.
 *
 * Act 1 (`QuizAmbience`) is passive weather: washes that never change. These
 * three are the opposite — they are a read-out of the shopper's progress, and
 * that read-out is the point: by Q10 the background carries ten faint blooms,
 * one per answer, which is the shopper's own marbling (their quiz signature),
 * and the warm fog that opened the quiz has thinned to nothing.
 *
 * Painting order, back to front, as rendered on the quiz route:
 *
 *   washes (QuizAmbience, page level)
 *     → ink blooms      (this file, fixed -z-10, rendered inside the quiz, so
 *                        LATER in the DOM than the washes = above them)
 *     → clearing fog    (this file, fixed -z-10, after the blooms)
 *     → quiz cards/content
 *     → film grain      (QuizAmbience, z-50)
 *     → answer pulse    (this file, z-60 — the one positive-z layer, because the
 *                        ripple has to travel over everything)
 *
 * All three layers are `aria-hidden` and `pointer-events: none`, so nothing here
 * is announced to assistive tech or can swallow a tap, a selection or a scroll.
 * Every animated property is `transform`/`opacity` — no filters, no layout work —
 * and the blooms are capped at `MAX_INK_BLOOMS` nodes for the whole run.
 *
 * Colours come from the existing tokens only (`--accent` terracotta and
 * `--accent-soft`), so no new palette enters the project. Readability first: the
 * blooms and the fog sit BEHIND the cards, and the fog is a light warm veil that
 * never darkens the page base (see the contrast budget in `app/globals.css`).
 *
 * The pure helpers below are exported so the constraints (one bloom per
 * question, hard node cap, fog as a function of the answered count, tint
 * cycling) are unit-testable without a browser.
 */

/** One ink bloom: where it landed, and which palette tint it carries. */
export interface InkBloom {
  /** The question it was spawned for — at most one bloom per question. */
  questionId: string;
  /** Viewport coordinates of the answered option (the layer is fixed). */
  x: number;
  y: number;
  /** Palette tint slot, 0..QUIZ_BLOOM_TINTS-1. */
  tint: number;
}

/** One answer ripple, alive for ~600ms and then gone from the DOM. */
export interface AnswerPulse {
  id: number;
  x: number;
  y: number;
}

/** Hard cap: one bloom per question, and the quiz has ten questions. */
export const MAX_INK_BLOOMS = 10;

/** How many palette tints the blooms cycle through. */
export const QUIZ_BLOOM_TINTS = 3;

/** A ripple is brief — anything still mounted after this is a bug, not a look. */
export const ANSWER_PULSE_MS = 600;

/** Safety cap for rapid tapping: at most this many ripple nodes at once. */
export const MAX_LIVE_PULSES = 4;

/** Fog starts here on Q1 and thins to 0 as the questions are answered. */
export const FOG_START_OPACITY = 0.45;

/** Deterministic tint rotation, by the question's position in the bank. */
export function bloomTintFor(questionIndex: number): number {
  const index = Number.isFinite(questionIndex) ? Math.abs(Math.trunc(questionIndex)) : 0;
  return index % QUIZ_BLOOM_TINTS;
}

/**
 * Record (or replace) the bloom for one question.
 *
 * Answering the same question again — the shopper went back and changed their
 * mind — moves that question's bloom instead of adding a second node, so the
 * node count stays equal to the number of answered questions. The `slice` is the
 * belt to that brace: this array can never exceed `MAX_INK_BLOOMS`.
 */
export function withInkBloom(blooms: readonly InkBloom[], bloom: InkBloom): InkBloom[] {
  const others = blooms.filter((item) => item.questionId !== bloom.questionId);
  return [...others, bloom].slice(-MAX_INK_BLOOMS);
}

/**
 * The fog's opacity for a given progress: linear in the answered count, so it
 * starts at `FOG_START_OPACITY` (nothing answered) and is exactly 0 once every
 * question is answered. Out-of-range input is clamped rather than extrapolated —
 * the layer can only ever be "as foggy as Q1" or clearer.
 */
export function fogOpacityFor(answeredCount: number, totalQuestions: number): number {
  if (!Number.isFinite(answeredCount) || !Number.isFinite(totalQuestions) || totalQuestions <= 0) {
    return 0;
  }
  const answered = Math.min(Math.max(answeredCount, 0), totalQuestions);
  return Number(((FOG_START_OPACITY * (totalQuestions - answered)) / totalQuestions).toFixed(4));
}

interface QuizAtmosphereProps {
  /** The blooms accumulated so far — one per answered question. */
  blooms: readonly InkBloom[];
  /** The ripples currently alive (each one removes itself after ~600ms). */
  pulses: readonly AnswerPulse[];
  /** Answered questions, out of `totalQuestions`. Drives the fog. */
  answeredCount: number;
  totalQuestions: number;
}

export default function QuizAtmosphere({
  blooms,
  pulses,
  answeredCount,
  totalQuestions,
}: QuizAtmosphereProps) {
  return (
    <>
      {/* Ink blooms — the shopper's own marbling, one node per answer. */}
      <div aria-hidden="true" className="quiz-ink pointer-events-none fixed inset-0 -z-10">
        {blooms.map((bloom) => (
          <span
            key={bloom.questionId}
            className={`quiz-bloom quiz-bloom-tint-${bloomTintFor(bloom.tint)}`}
            style={{ left: bloom.x, top: bloom.y } as CSSProperties}
          />
        ))}
      </div>

      {/* Clearing fog — one layer, opacity driven by the answered count. */}
      <div
        aria-hidden="true"
        className="quiz-fog pointer-events-none"
        style={{ opacity: fogOpacityFor(answeredCount, totalQuestions) }}
      />

      {/* Answer pulse — above the cards and the grain, alive for ~600ms. */}
      <div aria-hidden="true" className="quiz-pulse-layer pointer-events-none">
        {pulses.map((pulse) => (
          <span
            key={pulse.id}
            className="quiz-pulse"
            style={{ left: pulse.x, top: pulse.y } as CSSProperties}
          />
        ))}
      </div>
    </>
  );
}
