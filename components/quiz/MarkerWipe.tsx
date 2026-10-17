"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface MarkerWipeProps {
  /** The highlighted words — an exact substring of the approved copy. */
  children: ReactNode;
  /**
   * Re-arms the wipe when the screen changes (the question id). The component
   * stays mounted while the prompt changes, so without this the wipe would
   * play once for Q1 and never again.
   */
  replayKey: string;
}

/**
 * The Phase 1 signature micro-interaction: a gold marker block wiped behind
 * the emotional core of a question title (right → left, RTL).
 *
 * The STATIC highlight is the base state (`.marker-wipe::before` at full
 * scale), so SSR, no-JS and `prefers-reduced-motion` all render the finished
 * look with zero motion. When the span scrolls into view, an
 * IntersectionObserver adds `.is-inview`, which replays the 550ms scaleX wipe
 * from the right edge. No animation library, no JS-driven frames.
 */
export default function MarkerWipe({ children, replayKey }: MarkerWipeProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    // A fresh screen starts unwiped; the observer replays the draw.
    setInView(false);
    if (
      typeof IntersectionObserver === "undefined" ||
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [replayKey]);

  return (
    <span ref={ref} className={`marker-wipe${inView ? " is-inview" : ""}`}>
      {children}
    </span>
  );
}
