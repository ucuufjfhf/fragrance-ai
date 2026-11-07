"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ANALYSIS_ARTWORK_SHIFT_TICKS,
  ANALYSIS_DURATION_MS,
  ANALYSIS_MAX_SLIDES,
  ANALYSIS_PROGRESS_STEPS,
  ANALYSIS_TICK_MS,
  INTERSTITIAL_LINE_INTERVAL_MS,
  INTERSTITIAL_LINES,
  artworkIndexForTick,
  progressForTick,
} from "@/components/quiz/AnalysisInterstitial";
import { artworkForPerfume } from "@/lib/perfumes/artwork";
import { formatPersianPercent } from "@/lib/persian";
import type { WidgetRecommendation } from "@/lib/widget/contract";

/**
 * The widget's performed-analysis screen (Phase 8 polish).
 *
 * The embedded widget used to swap a plain «در حال پیدا کردن…» box for the
 * result. It now performs the same wait the main quiz does, from the SAME
 * source of truth: the timing constants, the steady 0 → 100 curve, the
 * rotating lines and the crossfade slide pattern all come from
 * `components/quiz/AnalysisInterstitial` — this file only re-shapes that
 * performance for the widget's narrower column and for recommendations that
 * arrive from the API *during* the wait.
 *
 * Two widget-specific facts shape it:
 *
 *  - the matches are not known when the bar starts (the POST is in flight), so
 *    `matches` is empty on the first frames and grows once the response lands.
 *    Each slide is keyed by `perfumeId` and mounted once, stacked in ONE grid
 *    cell and crossfaded with opacity only — never the old
 *    `<figure key={…}>`-per-cycle pattern that re-decoded artwork on every
 *    swap (the flash fixed in 8f36e21);
 *  - the bar's full course is the contract, not a decoration: it runs to 100
 *    on its own clock even when the response arrived early, and the caller
 *    shows results only once BOTH the bar is done and the data is in. A late
 *    response therefore holds the finished bar calmly instead of dropping back
 *    to plain text.
 *
 * `onDone` is called exactly once (guarded), on the bar's own beat. `onSkip`
 * is the «رد شدن» contract: it ends the performance immediately; the widget
 * cannot navigate away to a result page, so the caller holds the completed bar
 * until the response lands.
 *
 * Reduced motion shows ONE static frame (mid-analysis, first line, second
 * artwork) and then advances on the same duration — no transitions, same as
 * the main interstitial.
 */
const STATIC_PROGRESS = 34;
const STATIC_LINE_INDEX = 0;
const STATIC_ARTWORK_INDEX = 1;
const COMPLETE_PROGRESS = 100;

interface WidgetAnalysisProps {
  /** The real recommendations, once the widget API response has arrived. */
  matches: readonly WidgetRecommendation[];
  /** The bar finished its full course (or the static frame's timer elapsed). */
  onDone: () => void;
  /** «رد شدن» — end the wait now; the caller still needs the data to land. */
  onSkip: () => void;
  /** Test and preview escape hatch; the real media query decides otherwise. */
  reducedMotionOverride?: boolean;
}

export default function WidgetAnalysis({
  matches,
  onDone,
  onSkip,
  reducedMotionOverride,
}: WidgetAnalysisProps) {
  const [reduced] = useState<boolean>(
    () =>
      reducedMotionOverride ??
      (typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches),
  );
  const [tick, setTick] = useState(0);
  const [finished, setFinished] = useState(false);
  // Exactly once, even under React's development double-effects: the caller
  // promotes to the result phase on this signal.
  const announced = useRef(false);

  const finish = useCallback(() => {
    if (announced.current) {
      return;
    }
    announced.current = true;
    setFinished(true);
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (reduced) {
      const handle = window.setTimeout(finish, ANALYSIS_DURATION_MS);
      return () => window.clearTimeout(handle);
    }

    if (tick >= ANALYSIS_PROGRESS_STEPS - 1) {
      // The bar completed its full steady course — finish on this beat.
      const handle = window.setTimeout(finish, 0);
      return () => window.clearTimeout(handle);
    }

    const handle = window.setTimeout(() => setTick((current) => current + 1), ANALYSIS_TICK_MS);
    return () => window.clearTimeout(handle);
  }, [tick, reduced, finish]);

  const progress = reduced
    ? finished
      ? COMPLETE_PROGRESS
      : STATIC_PROGRESS
    : progressForTick(tick);

  const lineIndex = reduced
    ? STATIC_LINE_INDEX
    : Math.min(
        INTERSTITIAL_LINES.length - 1,
        Math.floor((tick * ANALYSIS_TICK_MS) / INTERSTITIAL_LINE_INTERVAL_MS),
      );

  // All slides stay mounted; the cycle only moves the active one, so no image
  // element is ever recreated and no artwork is re-decoded mid-performance.
  const slides = matches.slice(0, ANALYSIS_MAX_SLIDES);
  const artworkIndex = reduced
    ? Math.min(STATIC_ARTWORK_INDEX, Math.max(0, slides.length - 1))
    : artworkIndexForTick(tick, slides.length);
  const activeIndex = slides.length > 0 ? artworkIndex % slides.length : 0;
  const artworkSources = slides.map((match) => match.imageUrl ?? artworkForPerfume(match.perfumeId));
  const artworkKey = artworkSources.join("|");

  // Warm the artwork before the cycle reaches it: bundled files are local and
  // merchant photos are one request either way, so this only moves decode work
  // off the swap frame.
  useEffect(() => {
    if (typeof window === "undefined" || artworkKey === "") {
      return;
    }
    artworkSources.forEach((source) => {
      const image = new window.Image();
      image.decoding = "async";
      image.src = source;
    });
    // `artworkKey` is the stable identity of the source list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworkKey]);

  return (
    <section className="quiz-rise flex flex-col items-center gap-6 overflow-hidden py-6 text-center">
      <span className="tnum font-display text-6xl font-semibold leading-none tracking-[-0.01em] text-foreground">
        {formatPersianPercent(progress)}
      </span>

      {/* Named by what it is doing, not by the percent it happens to show. */}
      <div
        role="progressbar"
        aria-label="در حال تحلیل پاسخ‌ها در ویجت"
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
        <div className="grid w-full">
          {slides.map((match, index) => {
            const active = index === activeIndex;
            return (
              <figure
                key={match.perfumeId}
                aria-hidden={active ? undefined : true}
                className={`col-start-1 row-start-1 flex w-full flex-col items-center gap-2 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
                  active ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                {/* Merchant photo when the inventory has one; otherwise the
                    bundled artwork, exactly like the main interstitial. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={artworkSources[index]}
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
      ) : (
        // Reserve the exact slide footprint while the response is in flight, so
        // the artwork arriving mid-bar cannot shift the layout.
        <div aria-hidden="true" className="h-[168px] w-44" />
      )}

      <p aria-live="polite" className="font-editorial leading-8 text-muted">
        {INTERSTITIAL_LINES[lineIndex]}
      </p>

      <button type="button" onClick={onSkip} className="btn-tertiary mx-auto text-xs">
        رد شدن
      </button>
    </section>
  );
}

/** The slide cadence, exported for the widget's own tests. */
export const WIDGET_ANALYSIS_SHIFT_TICKS = ANALYSIS_ARTWORK_SHIFT_TICKS;
