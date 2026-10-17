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
 * no-JS, and reduced motion) shows the full laid-out page, and only a
 * motion-OK browser stages the beats — card 1 present, then one more per
 * beat. Any tap or keypress during the reveal skips straight to the full
 * page. The reveal never reorders, never filters, never touches the cards:
 * it only decides how many are mounted yet (keys preserved, so mounted cards
 * never remount).
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
  const [shown, setShown] = useState(items.length);
  const timer = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!motionOK || items.length <= 1) {
      return;
    }

    // Card 1 is already on screen from the server markup and stays; the
    // beats add one sibling at a time. Deferred past paint (like the quiz's
    // own step-enter), never a synchronous cascade.
    let staged = 1;
    frame.current = window.requestAnimationFrame(() => {
      setShown(1);
      timer.current = window.setInterval(() => {
        staged += 1;
        if (staged >= items.length && timer.current !== null) {
          window.clearInterval(timer.current);
          timer.current = null;
        }
        setShown(Math.min(staged, items.length));
      }, STAGED_REVEAL_BEAT_MS);
    });

    return () => {
      if (frame.current !== null) {
        window.cancelAnimationFrame(frame.current);
        frame.current = null;
      }
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
      className="flex list-none flex-col gap-4"
      onPointerDown={skip}
      onKeyDown={skip}
    >
      {items.slice(0, shown)}
    </ol>
  );
}
