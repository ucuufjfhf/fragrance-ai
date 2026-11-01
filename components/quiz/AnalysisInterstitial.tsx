"use client";

import { useEffect, useState } from "react";

import { artworkForPerfume } from "@/lib/perfumes/artwork";
import { formatPersianPercent } from "@/lib/persian";
import type { QuizMatchPreview } from "@/types/personality";

/**
 * Beat 2 runs ~6.5 seconds (with the ~3s countdown the whole performance
 * breathes like a real engine computing: ~9.5s total, always skippable).
 */
export const ANALYSIS_DURATION_MS = 6500;

/** One progress step every 100ms: 65 even steps fill 0 → 100. */
export const ANALYSIS_TICK_MS = 100;
export const ANALYSIS_PROGRESS_STEPS = 65;

/**
 * The performed percentage — a Scentbird-style bar filling 0 → 100 at a
 * constant, steady rate, synced to the interstitial duration. Pure function
 * of the tick so the rate is even by construction; the last step lands
 * exactly on 100 and the flow hard-cuts to results on the same beat, so it
 * never lingers at 100%.
 */
export function progressForTick(tick: number): number {
  const clamped = Math.max(0, Math.min(tick, ANALYSIS_PROGRESS_STEPS - 1));
  return Math.round((clamped / (ANALYSIS_PROGRESS_STEPS - 1)) * 100);
}

/** Artwork cycles to the next match about every 1.4s while the bar fills. */
export const ANALYSIS_ARTWORK_SHIFT_TICKS = 14;

/**
 * Every cycling slide is mounted at once (the top matches are at most three),
 * stacked in one grid cell and crossfaded with opacity only. Remounting a
 * `<figure key={perfumeId}>` per cycle made a phone reload and re-decode the
 * artwork on every swap — the visible flash this replaces.
 */
export const ANALYSIS_MAX_SLIDES = 3;

export function artworkIndexForTick(tick: number, count: number): number {
  if (count <= 0) {
    return 0;
  }
  return Math.floor(Math.max(0, tick) / ANALYSIS_ARTWORK_SHIFT_TICKS) % count;
}

/** Microcopy rotates every ~1.2s: warm, شما register, zero emojis. */
export const INTERSTITIAL_LINE_INTERVAL_MS = 1200;
export const INTERSTITIAL_LINES = [
  "در حال تحلیل پاسخ‌های شما…",
  "رایحه‌ها رو با پروفایل شما جفت می‌کنیم…",
  "کم مونده تا نتیجه شما آماده بشه…",
] as const;

/**
 * The frozen frame reduced motion shows: mid-analysis (۳۴٪), first line,
 * second artwork — the same mid-performance moment as before, minus motion.
 */
const STATIC_PROGRESS = 34;
const STATIC_LINE_INDEX = 0;
const STATIC_ARTWORK_INDEX = 1;

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
 * performs the wait around the real top-3: a steady 0 → 100 progress bar
 * with the percentage in Persian digits beside it, the matched perfumes'
 * own artwork cycling with their names — show-your-work, these are the
 * results being "prepared" — and rotating microcopy over the ambient
 * background. The bar is the hero; there is no other ornament. Unboxed: no
 * card anywhere.
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

    if (tick >= ANALYSIS_PROGRESS_STEPS - 1) {
      // Hard cut on the same beat 100 lands — never linger at 100%.
      const handle = window.setTimeout(onDone, 0);
      return () => window.clearTimeout(handle);
    }

    const handle = window.setTimeout(() => setTick((current) => current + 1), ANALYSIS_TICK_MS);
    return () => window.clearTimeout(handle);
  }, [tick, reduced, onDone]);

  const progress = reduced ? STATIC_PROGRESS : progressForTick(tick);
  const lineIndex = reduced
    ? STATIC_LINE_INDEX
    : Math.min(
        INTERSTITIAL_LINES.length - 1,
        Math.floor((tick * ANALYSIS_TICK_MS) / INTERSTITIAL_LINE_INTERVAL_MS),
      );
  const artworkIndex = reduced
    ? Math.min(STATIC_ARTWORK_INDEX, Math.max(0, matches.length - 1))
    : artworkIndexForTick(tick, matches.length);

  // All slides stay mounted; the cycle only moves the active one, so no image
  // element is ever recreated and no artwork is re-decoded mid-performance.
  const slides = matches.slice(0, ANALYSIS_MAX_SLIDES);
  const activeIndex = slides.length > 0 ? artworkIndex % slides.length : 0;
  const artworkKey = slides
    .map((match) => artworkForPerfume(match.perfumeId))
    .join("|");

  // Warm the artwork before the cycle reaches it: the bundled files are local,
  // so this only moves their decode off the swap frame (never a network fetch).
  useEffect(() => {
    if (typeof window === "undefined" || artworkKey === "") {
      return;
    }
    artworkKey.split("|").forEach((source) => {
      const image = new window.Image();
      image.decoding = "async";
      image.src = source;
    });
  }, [artworkKey]);

  return (
    <section className="quiz-rise relative flex flex-col items-center gap-6 overflow-hidden py-10 text-center sm:py-14">
      <span
        id="analysis-percent"
        className="tnum font-display text-7xl font-semibold leading-none tracking-[-0.01em] text-foreground sm:text-8xl"
      >
        {formatPersianPercent(progress)}
      </span>

      {/* Scentbird-style steady fill, synced to the interstitial duration.
          The bar itself is the announcement contract (role + value); the big
          number stays visual-only so screen readers are not spammed ten
          times a second, while the rotating line below keeps a polite live
          region. */}
      <div
        role="progressbar"
        aria-labelledby="analysis-percent"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-2"
      >
        <div
          aria-hidden="true"
          className="h-full rounded-full bg-linear-to-l from-accent to-accent/70 transition-[width] duration-100 ease-linear motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>

      {slides.length > 0 ? (
        // One grid cell holds every slide, so the stack keeps the single
        // figure's footprint: no layout change on a swap, only a crossfade.
        <div className="grid">
          {slides.map((match, index) => {
            const active = index === activeIndex;
            return (
              <figure
                key={match.perfumeId}
                aria-hidden={active ? undefined : true}
                className={`col-start-1 row-start-1 flex flex-col items-center gap-2 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
                  active ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                {/* Plain <img> for the bundled artwork (the repo's convention
                    for local files — see components/results/RecommendationCard.tsx). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={artworkForPerfume(match.perfumeId)}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  draggable={false}
                  className="h-28 w-44 rounded-2xl object-cover"
                />
                <figcaption>
                  <span className="block font-medium leading-7 text-foreground">{match.name}</span>
                  <span className="block text-sm leading-7 text-muted">{match.brand}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : null}

      <p aria-live="polite" className="font-editorial leading-8 text-muted">
        {INTERSTITIAL_LINES[lineIndex]}
      </p>

      <button
        type="button"
        onClick={onSkip}
        className="btn-tertiary mx-auto text-xs"
      >
        رد شدن
      </button>
    </section>
  );
}
