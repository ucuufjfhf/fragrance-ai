"use client";

import { useEffect, useState } from "react";

import { artworkForPerfume } from "@/lib/perfumes/artwork";
import { formatPersianPercent } from "@/lib/persian";
import type { QuizMatchPreview } from "@/types/personality";

/**
 * Beat 2 runs ~3.6 seconds (with the ~2s countdown the added wait stays
 * under the 6-second budget).
 */
export const ANALYSIS_DURATION_MS = 3600;

/** One % step every 900ms: four uneven jumps, then the hard cut to results. */
export const ANALYSIS_TICK_MS = 900;

/**
 * The performed percentage — LARGE uneven jumps (Scentbird lineage), never
 * linear and never holding at 100%: the last frame cuts straight to results.
 */
export const ANALYSIS_PERCENT_STEPS = [7, 34, 68, 91] as const;

/** Microcopy rotates every ~1.2s: warm, شما register, zero emojis. */
export const INTERSTITIAL_LINE_INTERVAL_MS = 1200;
export const INTERSTITIAL_LINES = [
  "در حال تحلیل پاسخ‌های شما…",
  "رایحه‌ها رو با پروفایل شما جفت می‌کنیم…",
  "کم مونده تا نتیجه شما آماده بشه…",
] as const;

/** The frozen frame reduced motion shows: mid-analysis, mid-first-line. */
const STATIC_PERCENT_INDEX = 1;

interface AnalysisInterstitialProps {
  /** The real top matches in rank order — computed BEFORE the wait performs. */
  matches: readonly QuizMatchPreview[];
  /** Hard cut to the result phase once the performance finishes. */
  onDone: () => void;
  /** The «رد شدن» skip: jumps straight to /result, bypassing the wait. */
  onSkip: () => void;
  /**
   * Test and preview escape hatch. When omitted the real
   * `prefers-reduced-motion` media query decides; reduced motion shows one
   * static frame (no animated transitions) while auto-advance still works.
   */
  reducedMotionOverride?: boolean;
}

/**
 * Beat 2 — the performed-analysis interstitial.
 *
 * The engine already ranked everything (locally, instantly); this screen
 * performs the wait around the real top-3: a jumping percentage, the matched
 * perfumes' own artwork cycling beside it with their names — show-your-work,
 * these are the results being "prepared" — and rotating microcopy. Memo
 * Paris's sillage motif (drifting wavy ink lines + pulsing dots in
 * gold/wine/ink) breathes behind the content. Unboxed: no card anywhere.
 *
 * Never a forced gate: the «رد شدن» skip is always visible and jumps straight
 * to /result.
 */
export default function AnalysisInterstitial({
  matches,
  onDone,
  onSkip,
  reducedMotionOverride,
}: AnalysisInterstitialProps) {
  const [reduced] = useState<boolean>(
    () =>
      reducedMotionOverride ??
      (typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches),
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduced) {
      // One static frame — then the flow still advances on its own.
      const handle = window.setTimeout(onDone, ANALYSIS_DURATION_MS);
      return () => window.clearTimeout(handle);
    }

    if (tick >= ANALYSIS_PERCENT_STEPS.length - 1) {
      const handle = window.setTimeout(onDone, ANALYSIS_TICK_MS);
      return () => window.clearTimeout(handle);
    }

    const handle = window.setTimeout(() => setTick((current) => current + 1), ANALYSIS_TICK_MS);
    return () => window.clearTimeout(handle);
  }, [tick, reduced, onDone]);

  const stepIndex = reduced ? STATIC_PERCENT_INDEX : Math.min(tick, ANALYSIS_PERCENT_STEPS.length - 1);
  const lineIndex = reduced
    ? 0
    : Math.min(
        INTERSTITIAL_LINES.length - 1,
        Math.floor((tick * ANALYSIS_TICK_MS) / INTERSTITIAL_LINE_INTERVAL_MS),
      );
  const current = matches.length > 0 ? matches[stepIndex % matches.length] : null;

  return (
    <section className="quiz-rise relative flex flex-col items-center gap-6 overflow-hidden py-10 text-center sm:py-14">
      {/* Memo sillage: wavy ink lines + pulsing dots, decorative and inert. */}
      <div aria-hidden="true" className={reduced ? "sillage sillage-static" : "sillage"}>
        <svg
          className="sillage-waves"
          viewBox="0 0 400 200"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path
            d="M-20,60 C80,30 160,90 260,60 S380,40 420,70"
            className="sillage-line sillage-line-gold"
          />
          <path
            d="M-20,110 C90,80 170,140 270,110 S380,90 420,120"
            className="sillage-line sillage-line-wine"
          />
          <path
            d="M-20,150 C100,130 180,170 280,150 S370,140 420,155"
            className="sillage-line sillage-line-ink"
          />
          <circle cx="90" cy="70" r="4" className="sillage-dot sillage-dot-gold" />
          <circle cx="250" cy="120" r="5" className="sillage-dot sillage-dot-wine" />
          <circle cx="330" cy="80" r="3" className="sillage-dot sillage-dot-ink" />
        </svg>
      </div>

      <span
        aria-live="polite"
        className="tnum font-display text-7xl font-semibold leading-none tracking-[-0.01em] text-foreground sm:text-8xl"
      >
        {formatPersianPercent(ANALYSIS_PERCENT_STEPS[stepIndex])}
      </span>

      {current ? (
        <figure key={current.perfumeId} className="flex flex-col items-center gap-2">
          {/* Plain <img> for the bundled artwork (the repo's convention for
              local files — see components/results/RecommendationCard.tsx). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artworkForPerfume(current.perfumeId)}
            alt=""
            aria-hidden="true"
            className="h-28 w-44 rounded-2xl object-cover"
          />
          <figcaption>
            <span className="block font-medium leading-7 text-foreground">{current.name}</span>
            <span className="block text-sm leading-7 text-muted">{current.brand}</span>
          </figcaption>
        </figure>
      ) : null}

      <p aria-live="polite" className="font-editorial leading-8 text-muted">
        {INTERSTITIAL_LINES[lineIndex]}
      </p>

      <button
        type="button"
        onClick={onSkip}
        className="mx-auto text-xs text-muted underline underline-offset-4 transition-colors hover:text-foreground"
      >
        رد شدن
      </button>
    </section>
  );
}
