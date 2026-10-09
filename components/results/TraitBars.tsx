"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StarMark } from "@/components/ui-icons";
import { PERSONALITY_LABELS } from "@/lib/personality/labels";
import { formatPersianPercent } from "@/lib/persian";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { PersonalityVector } from "@/types/personality";

/**
 * Animated trait bars for the personality-profile sections of BOTH results
 * screens:
 *
 *  - Screen 1 (profile/archetype reveal): `components/quiz/QuizResultCard.tsx`
 *  - Screen 2 (recommendations): `components/results/ResultsView.tsx`
 *
 * Three layered, dependency-free animations (Decision #7):
 *  1. the bar fill grows via a CSS width transition (scroll-triggered),
 *  2. the percentage number counts up in sync via requestAnimationFrame,
 *  3. the leading edge glows while filling, then a brief completion pulse
 *     plays when each bar settles.
 *
 * All three are skipped for `prefers-reduced-motion`, where the final state is
 * rendered directly.
 */

/** Shared fill/count-up duration in milliseconds (deliberately slow, ~2s). */
export const TRAIT_ANIMATION_DURATION_MS = 2000;
/** Per-bar stagger so the bars cascade instead of filling in unison. */
export const TRAIT_ANIMATION_STAGGER_MS = 120;

const ANIMATION_DURATION_MS = TRAIT_ANIMATION_DURATION_MS;
const ANIMATION_STAGGER_MS = TRAIT_ANIMATION_STAGGER_MS;
/** The exact CSS easing used for the fill; mirrored by the JS count-up. */
const EASING_BEZIER = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Mirrors `EASING_BEZIER` for the JS count-up so digits and bars stay in sync.
 * This curve rises fast and settles slowly — the "measuring" feel.
 */
function easeOutSettle(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return 1 - Math.pow(1 - t, 3);
}

/**
 * One shared animated trait-bar list. Purely presentational: the parent
 * provides the accent context (`--accent` custom properties); the animation
 * is self-governed.
 */
export default function TraitBars({ vector }: { vector: PersonalityVector }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  // Displayed numbers start at 0 and count up to the real vector once in view.
  const [displayValues, setDisplayValues] = useState<number[]>(() =>
    PERSONALITY_DIMENSIONS.map(() => 0),
  );
  // A bar is "settled" once its fill reaches its target (drives tip + pulse).
  const [settled, setSettled] = useState<boolean[]>(() =>
    PERSONALITY_DIMENSIONS.map(() => false),
  );

  // Scroll-triggered reveal (or an immediate reveal for reduced motion).
  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      requestAnimationFrame(() => {
        setReducedMotion(true);
        setVisible(true);
      });
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Reduced motion: jump straight to the final values, no glow, no pulse.
  useEffect(() => {
    if (!visible || !reducedMotion) return;
    const frame = requestAnimationFrame(() => {
      setDisplayValues(PERSONALITY_DIMENSIONS.map((dimension) => Math.round(vector[dimension])));
      setSettled(PERSONALITY_DIMENSIONS.map(() => true));
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, reducedMotion, vector]);

  // Count the numbers up in step with the CSS-driven fill. `vector` is a stable
  // server-passed prop, so this effect does not restart on our own re-renders.
  useEffect(() => {
    if (!visible || reducedMotion) return;
    const targets = PERSONALITY_DIMENSIONS.map((dimension) => vector[dimension]);
    const totalDuration =
      ANIMATION_DURATION_MS + ANIMATION_STAGGER_MS * Math.max(0, targets.length - 1);
    let frame = 0;
    let startedAt: number | null = null;
    const step = (now: number) => {
      if (startedAt === null) startedAt = now;
      const elapsed = now - startedAt;
      setDisplayValues(
        targets.map((target, index) => {
          const local = (elapsed - index * ANIMATION_STAGGER_MS) / ANIMATION_DURATION_MS;
          const progress = Math.min(1, Math.max(0, local));
          return Math.round(target * easeOutSettle(progress));
        }),
      );
      if (elapsed < totalDuration) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [visible, reducedMotion, vector]);

  // Called when a bar's width transition finishes: stop the glow, play the pulse.
  const handleFillEnd = useCallback((index: number) => {
    setSettled((previous) => {
      if (previous[index]) return previous;
      const next = previous.slice();
      next[index] = true;
      return next;
    });
  }, []);

  return (
    <section
      ref={sectionRef}
      className="flex flex-col gap-6 rounded-[var(--radius-lg)] border border-border-soft bg-surface p-5 sm:p-7"
    >
      <header className="flex flex-col gap-2">
        <span className="eyebrow accent-ink flex items-center gap-2">
          <StarMark className="h-3 w-3" />
          نُه بُعد سلیقه‌ات
        </span>
        <h2 className="display-md text-foreground">پروفایل شخصیتی تو</h2>
        <p className="max-w-md text-xs leading-7 text-muted">
          هر بُعد از ۰ تا ۱۰۰ سنجیده می‌شود؛ همین نمره‌ها مبنای رتبه‌بندی عطرها هستند.
        </p>
      </header>

      <ul className="flex flex-col gap-5">
        {PERSONALITY_DIMENSIONS.map((dimension, index) => {
          const target = vector[dimension];
          const isSettled = settled[index];
          const showTip = visible && !isSettled && displayValues[index] > 0;
          return (
            <li key={dimension} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-foreground">
                  <span
                    aria-hidden="true"
                    className="h-1 w-1 rounded-full bg-champagne-deep/70"
                  />
                  {PERSONALITY_LABELS[dimension]}
                </span>
                <span className="tnum accent-ink text-[0.82rem] font-semibold">
                  {formatPersianPercent(displayValues[index])}
                </span>
              </div>
              <div className="relative">
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border-soft/70"
                  role="progressbar"
                  aria-label={PERSONALITY_LABELS[dimension]}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={target}
                >
                  <div
                    className="relative h-full rounded-full motion-reduce:transition-none"
                    style={{
                      width: visible ? `${target}%` : "0%",
                      transitionProperty: "width",
                      transitionDuration: `${ANIMATION_DURATION_MS}ms`,
                      transitionTimingFunction: EASING_BEZIER,
                      transitionDelay: `${index * ANIMATION_STAGGER_MS}ms`,
                      backgroundImage:
                        "linear-gradient(to left, var(--accent) 0%, var(--accent) 55%, color-mix(in srgb, var(--accent) 55%, var(--foreground)) 100%)",
                    }}
                    onTransitionEnd={(event) => {
                      if (event.propertyName === "width") handleFillEnd(index);
                    }}
                  >
                    {showTip ? (
                      <span
                        aria-hidden="true"
                        className="trait-bar-tip pointer-events-none absolute inset-y-0 end-0 w-5 rounded-full"
                      />
                    ) : null}
                  </div>
                </div>
                {isSettled ? (
                  <span
                    aria-hidden="true"
                    className="trait-bar-pulse pointer-events-none absolute inset-0 rounded-full"
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
