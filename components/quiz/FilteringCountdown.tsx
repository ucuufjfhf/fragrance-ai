"use client";

import { useEffect, useMemo, useState } from "react";

import { toPersianDigits } from "@/lib/persian";

/** Beat 1 runs ~2 seconds in total (Trade Coffee lineage). */
export const FILTERING_DURATION_MS = 2000;

/** The countdown always lands on the 3 kept matches. */
export const FILTERING_FINAL_COUNT = 3;

/**
 * Decelerating countdown steps from the live catalog size to 3.
 *
 * Ease-out-cubic falls fast at first and lands softly on 3, which is the
 * whole Trade Coffee read: a whole catalog collapsing to a kept few. The
 * output is strictly decreasing integers ending exactly at 3 (consecutive
 * duplicates from rounding are removed), so the display can step through it
 * on a fixed tick with no clamping logic.
 */
export function buildCountdownSteps(from: number): number[] {
  const start = Math.max(Math.floor(from), FILTERING_FINAL_COUNT);

  if (start <= FILTERING_FINAL_COUNT) {
    return [FILTERING_FINAL_COUNT];
  }

  const TICKS = 11;
  const steps: number[] = [];

  for (let tick = 0; tick <= TICKS; tick++) {
    const eased = 1 - Math.pow(1 - tick / TICKS, 3);
    steps.push(Math.round(start - (start - FILTERING_FINAL_COUNT) * eased));
  }

  return [...new Set(steps)];
}

interface FilteringCountdownProps {
  /** Live candidate-pool size — read from the catalog, never hardcoded. */
  catalogCount: number;
  /** Advances to the analysis interstitial once the count lands on 3. */
  onDone: () => void;
  /**
   * Test and preview escape hatch. When omitted the real
   * `prefers-reduced-motion` media query decides; reduced motion renders the
   * final state instantly instead of performing the fall.
   */
  reducedMotionOverride?: boolean;
}

/**
 * Beat 1 — the filtering countdown.
 *
 * A big display-font number falls from the live catalog size to 3 in Persian
 * digits, over the line «از بین N عطر، ۳ عطر مناسب شما پیدا شد». Unboxed like
 * every other quiz screen: no card, no border — the content floats on the quiz
 * ambience and its invisible reading wash.
 *
 * Reduced motion resolves to the final state instantly (the media query is
 * read once, SSR-safe) and still advances, so keyboard and screen-reader flow
 * never stall behind a performance.
 */
export default function FilteringCountdown({
  catalogCount,
  onDone,
  reducedMotionOverride,
}: FilteringCountdownProps) {
  const [reduced] = useState<boolean>(
    () =>
      reducedMotionOverride ??
      (typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches),
  );
  const steps = useMemo(() => buildCountdownSteps(catalogCount), [catalogCount]);
  const [index, setIndex] = useState(() => (reduced ? steps.length - 1 : 0));

  useEffect(() => {
    if (reduced) {
      const handle = window.setTimeout(onDone, 0);
      return () => window.clearTimeout(handle);
    }

    if (index >= steps.length - 1) {
      // A breath on the landed 3 before the interstitial takes over.
      const handle = window.setTimeout(
        onDone,
        Math.round(FILTERING_DURATION_MS / steps.length),
      );
      return () => window.clearTimeout(handle);
    }

    const handle = window.setTimeout(
      () => setIndex((current) => Math.min(current + 1, steps.length - 1)),
      Math.round(FILTERING_DURATION_MS / steps.length),
    );
    return () => window.clearTimeout(handle);
  }, [index, reduced, steps.length, onDone]);

  return (
    <section className="quiz-rise flex flex-col items-center gap-5 py-10 text-center sm:py-14">
      <span
        aria-live="polite"
        className="tnum font-display text-7xl font-semibold leading-none tracking-[-0.01em] text-foreground sm:text-8xl"
      >
        {toPersianDigits(steps[index])}
      </span>
      <p className="font-editorial leading-8 text-muted">
        از بین {toPersianDigits(catalogCount)} عطر، {toPersianDigits(FILTERING_FINAL_COUNT)}{" "}
        عطر مناسب شما پیدا شد
      </p>
    </section>
  );
}
