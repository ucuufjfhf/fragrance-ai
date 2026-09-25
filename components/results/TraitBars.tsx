"use client";

import { useEffect, useRef, useState } from "react";
import { PERSONALITY_LABELS } from "@/lib/personality/labels";
import { formatPersianPercent } from "@/lib/persian";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { PersonalityVector } from "@/types/personality";

export default function TraitBars({ vector }: { vector: PersonalityVector }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { requestAnimationFrame(() => setVisible(true)); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { threshold: 0.25 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <section ref={sectionRef} className="flex flex-col gap-4 rounded-3xl border border-border-soft bg-surface p-6">
    <h2 className="font-semibold">پروفایل شخصیتی تو</h2>
    <ul className="flex flex-col gap-3">
      {PERSONALITY_DIMENSIONS.map((dimension, index) => <li key={dimension} className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm"><span>{PERSONALITY_LABELS[dimension]}</span><span className="tnum text-muted">{formatPersianPercent(vector[dimension])}</span></div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={PERSONALITY_LABELS[dimension]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={vector[dimension]}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-out" style={{ width: visible ? `${vector[dimension]}%` : "0%", transitionDelay: visible ? `${index * 90}ms` : "0ms" }} />
        </div>
      </li>)}
    </ul>
  </section>;
}
