import Link from "next/link";
import type { CSSProperties } from "react";

import { archetypeEmblemImageFor } from "@/components/archetype-emblems";
import TraitBars from "@/components/results/TraitBars";
import { getArchetypeById } from "@/lib/personality/archetypes";
import type { PersonalityVector } from "@/types/personality";

/**
 * Sample-result preview for the landing page.
 *
 * This is NOT a live quiz result: it renders one fixed archetype (شعله) with
 * a fixed illustrative vector, using the same visual pieces as the real
 * result screens (accent wash, emblem seal, description, shared TraitBars).
 * It is always labelled «نمونه نتیجه» so it can never read as someone's real
 * outcome — no invented user, no invented stats, no fake social proof.
 *
 * Static on purpose: the interactive `FragranceProfileCard` focuses its
 * heading and links into the quiz flow on mount, both wrong for a landing
 * preview. The adjacent CTA goes to the real quiz.
 */

/** Illustrative vector for the sample card — fixed, clearly not measured. */
export const SAMPLE_VECTOR: PersonalityVector = {
  social: 61,
  adventurous: 86,
  expressive: 48,
  mysterious: 38,
  fresh: 45,
  warm: 72,
  experimental: 63,
  elegant: 42,
  bold: 88,
};

export default function SampleResultSection() {
  const archetype = getArchetypeById("bold-one")!;

  return (
    <section
      aria-labelledby="sample-result-heading"
      className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 lg:py-20"
      style={
        {
          "--accent": archetype.accentColor,
          "--accent-soft": `color-mix(in srgb, ${archetype.accentColor} 14%, white)`,
        } as CSSProperties
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-accent">نمونه نتیجه</p>
        <h2
          id="sample-result-heading"
          className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
        >
          نتیجه‌تون چیزی شبیه این میشه
        </h2>
        <p className="max-w-2xl text-sm leading-loose text-muted">
          این یک نمونه‌ست، نه نتیجه واقعی شما — پروفایل واقعی‌تون از جواب‌های
          خودتون ساخته میشه. مثلاً اگر پروفایل‌تون «شعله» بشه، همچین چیزی
          می‌بینید:
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        <div className="relative overflow-hidden rounded-[2rem] border border-accent/30 bg-accent-soft px-6 py-10 text-center shadow-[var(--shadow-soft)] sm:px-10 sm:py-12">
          <div className="relative flex flex-col items-center gap-3">
            <span
              role="img"
              aria-label={archetype.label}
              className="relative mt-2 flex h-24 w-24 items-center justify-center rounded-full border border-accent/30 bg-surface-2 shadow-[var(--shadow-card)]"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 -m-2.5 rounded-full border border-accent/20"
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 overflow-hidden rounded-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={archetypeEmblemImageFor(archetype.id)}
                  alt=""
                  width={1600}
                  height={1600}
                  className="h-full w-full object-cover"
                />
              </span>
            </span>

            <p className="mt-2 font-heading text-3xl font-bold leading-tight text-foreground sm:text-4xl">
              {archetype.label}
            </p>

            <span aria-hidden="true" className="mt-1 h-px w-16 bg-accent/40" />

            <p className="max-w-md text-sm leading-8 text-foreground/80">
              {archetype.description}
            </p>
          </div>
        </div>

        <TraitBars vector={SAMPLE_VECTOR} />

        <Link
          href="/quiz"
          className="btn-primary flex min-h-14 items-center justify-center rounded-2xl bg-accent px-9 text-lg font-medium text-background sm:w-fit"
        >
          شروع آزمون
        </Link>
      </div>
    </section>
  );
}
