"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * One beat between matches (~600–800ms, Trade Coffee lineage): each
 * recommendation gets its own moment instead of all three landing at once.
 */
export const STAGED_REVEAL_BEAT_MS = 700;

interface StagedRevealProps {
  /** The staged items (the recommendation `<li>`s) — never reordered. */
  children: ReactNode;
  /**
   * Test and preview escape hatch. When omitted the real
   * `prefers-reduced-motion` media query decides; reduced motion renders
   * everything statically, with no staged timing at all.
   */
  reducedMotionOverride?: boolean;
}

/**
 * Beat 1 — the staged per-match reveal.
 *
 * Final-first, like the repo's `MarkerWipe` contract: server markup (and
 * no-JS, and reduced motion) shows the full laid-out page. The staging itself
 * is CSS-driven (`data-shown` + the `.staged-reveal` rules in globals.css):
 * the server markup already carries `data-shown="1"`, so a motion-OK browser
 * hides stops 2+ from the very first paint — the first frame can never show
 * more cards than a later frame (no N-to-1 flash, ever). React only advances
 * the attribute 1 → 2 → 3, one beat each; any tap or keypress during the
 * reveal jumps straight to the full page. All items stay mounted throughout
 * (keys preserved, nothing remounts); the reveal never reorders or filters.
 */
export default function StagedReveal({
  children,
  reducedMotionOverride,
}: StagedRevealProps) {
  const items = Children.toArray(children);
  const [motionOK] = useState<boolean>(() => {
    if (reducedMotionOverride !== undefined) {
      return !reducedMotionOverride;
    }
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  });
  // Starts at 1 everywhere — including the server markup — so hydration never
  // mismatches and the CSS already hides stops 2+ before React boots.
  const [shown, setShown] = useState(1);
  const staged = useRef(1);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    // Static path: nothing to stage, so no timer. `data-shown` stays at its
    // server-rendered "1" — harmless, since neither reduced-motion nor no-JS
    // ever matches the hiding rules.
    if (!motionOK || items.length <= 1) {
      return;
    }

    // Beats add one stop at a time, starting past mount (like the quiz's own
    // step-enter), never a synchronous cascade.
    staged.current = 1;
    timer.current = window.setInterval(() => {
      staged.current = Math.min(staged.current + 1, items.length);
      if (staged.current >= items.length && timer.current !== null) {
        window.clearInterval(timer.current);
        timer.current = null;
      }
      setShown(staged.current);
    }, STAGED_REVEAL_BEAT_MS);

    return () => {
      if (timer.current !== null) {
        window.clearInterval(timer.current);
        timer.current = null;
      }
    };
  }, [motionOK, items.length]);

  const skip = () => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    setShown(items.length);
  };

  return (
    <ol
      className="staged-reveal flex list-none flex-col gap-4"
      data-shown={Math.min(shown, items.length)}
      onPointerDown={skip}
      onKeyDown={skip}
    >
      {items}
    </ol>
  );
}
