"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface SectionHeadlineProps {
  /** The headline copy — an exact substring of the approved text. */
  children: ReactNode;
}

/**
 * The results page's section headline, shared by both sections so the two
 * stay at the identical hierarchy level.
 *
 * The STATIC finished look (centered display face with a soft shadow) is the
 * base state, so SSR, no-JS and `prefers-reduced-motion` all render it with
 * zero motion. When the headline scrolls into view, an IntersectionObserver
 * adds `.is-inview`, which replays the fogged-mirror focus pull once —
 * blur-to-sharp rise, the archetype-reveal motif, deliberately not a third
 * motion language. No animation library, no JS-driven frames.
 */
export default function SectionHeadline({ children }: SectionHeadlineProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
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
  }, []);

  return (
    <h2 ref={ref} className={`section-headline${inView ? " is-inview" : ""}`}>
      {children}
    </h2>
  );
}
