import Link from "next/link";

import TraitBars from "@/components/results/TraitBars";
import AmbientParticles from "@/components/AmbientParticles";
import { BottleMark } from "@/components/ui-icons";

import { resetAnalyticsFlow } from "@/lib/analytics/flow-tracker";
import type { AudienceGender } from "@/lib/audience";
import type { SeasonFilter } from "@/lib/context";
import { serializeResultsParams } from "@/lib/results/params";
import type { Occasion } from "@/types/fragrance";
import type { CSSProperties } from "react";
import type { QuizResult } from "@/types/personality";

interface QuizResultCardProps {
  result: QuizResult;
  /** Set when the profile had to be computed locally because the API failed. */
  notice?: string | null;
  onRestart: () => void;
  /** Optional store context (Phase 9) — pinned into the results URL. */
  storeId?: string;
  /**
   * Optional audience selected on its own step before Q1. It travels to the
   * results page as a compact target token so the server-side engine can filter
   * candidates. Never part of the personality vector; absent → legacy URL.
   */
  audience?: AudienceGender | null;
  /**
   * Optional context selections (season/occasion) — included in the results
   * href so the link stays truthful when the shopper returns from the context
   * step. Absent → legacy URL, byte-identical to the pre-context contract.
   */
  season?: SeasonFilter | null;
  occasion?: Occasion | null;
  /**
   * When provided, the CTA opens the optional context step instead of
   * navigating directly — the context step builds the final results link.
   * Absent → the legacy direct link (standalone/SSR usage).
   */
  onContinue?: () => void;
}

/**
 * Phase 1 result view: the archetype and the full 0–100 personality profile.
 *
 * Perfume recommendations, match percentages and the AI-written «چرا این عطر؟»
 * explanation belong to later phases and are deliberately absent here.
 *
 * Presentation only: the archetype reveal is a choreographed entrance (each
 * line rises in turn via the shared `quiz-rise` keyframe, held hidden until its
 * delay so the cascade reads as a reveal) and it names the selection basis — the
 * complete nine-axis profile — so the archetype never reads as "the tallest bar".
 * The archetype itself, the vector, the scoring and every link target come
 * straight from the Phase 1 engine and are unchanged.
 */
export default function QuizResultCard({
  result,
  notice,
  onRestart,
  storeId,
  audience,
  season = null,
  occasion = null,
  onContinue,
}: QuizResultCardProps) {
  const { archetype, vector } = result;

  // The results page is a server component: the profile travels in the URL and
  // the engine + AI run server-side (Phase 5). Works offline too, because the
  // same pure scorer produced this result even when the API failed.
  // Phase 9: when the quiz carries a store context it is pinned into the URL,
  // so recommendations come from that store instead of the default.
  // The audience rides along as the compact target token; without one the URL
  // is byte-identical to the pre-audience contract (legacy behaviour).
  const resultsHref = `/result?${serializeResultsParams(
    vector,
    archetype.id,
    storeId,
    undefined,
    audience,
    season,
    occasion,
  )}`;

  return (
    <section
      className="relative flex flex-col gap-5 transition-colors duration-300"
      style={{
        "--accent": archetype.accentColor,
        "--accent-soft": `color-mix(in srgb, ${archetype.accentColor} 14%, white)`,
        "--accent-contrast": archetype.id === "clean-minimalist" || archetype.id === "elegant-classic" ? "#2A2420" : "#FFFFFF",
      } as CSSProperties}
    >
      {/* Shared ambient background — identical implementation to the
          Recommendations screen (components/results/ResultsView.tsx). */}
      <AmbientParticles />

      {/* --- archetype reveal ---
          A choreographed entrance: label, seal, name, rule, copy and the
          selection-basis line each rise in turn. Every element keeps the
          reduced-motion bypass baked into the shared `quiz-rise` keyframe. */}
      <div className="relative overflow-hidden rounded-[2rem] border border-accent/30 bg-accent-soft px-6 py-10 text-center shadow-[var(--shadow-soft)] sm:px-10 sm:py-12">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/3 rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 30%, white), transparent)",
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-12 top-0 h-px bg-accent/20"
        />

        <div className="relative flex flex-col items-center gap-3">
          <span
            className="quiz-rise text-sm font-medium text-accent"
            style={{ animationDelay: "40ms", animationFillMode: "backwards" }}
          >
            پروفایل عطری تو
          </span>

          <span
            className="quiz-rise relative mt-2 flex h-16 w-16 items-center justify-center rounded-full border border-accent/30 bg-background/70 text-accent shadow-[var(--shadow-card)]"
            style={{ animationDelay: "120ms", animationFillMode: "backwards" }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 -m-2.5 rounded-full border border-accent/20"
            />
            <BottleMark className="h-8 w-8" />
          </span>

          <h1
            className="quiz-rise mt-2 font-heading text-3xl font-bold leading-tight text-foreground sm:text-4xl"
            style={{ animationDelay: "200ms", animationFillMode: "backwards" }}
          >
            {archetype.label}
          </h1>

          <span
            aria-hidden="true"
            className="quiz-rise mt-1 h-px w-16 bg-accent/40"
            style={{ animationDelay: "260ms", animationFillMode: "backwards" }}
          />

          <p
            className="quiz-rise max-w-md text-sm leading-8 text-foreground/80"
            style={{ animationDelay: "320ms", animationFillMode: "backwards" }}
          >
            {archetype.description}
          </p>

          {/* Selection basis — the profile is matched against the WHOLE nine-axis
              vector, not the single strongest one. Copy only: no scoring, no
              selection and no archetype lookup changes anywhere. */}
          <p
            className="quiz-rise mt-1 max-w-md text-xs leading-7 text-muted"
            style={{ animationDelay: "380ms", animationFillMode: "backwards" }}
          >
            این پروفایل از روی همهٔ ۹ محور شخصیتت انتخاب شده است — نه فقط بالاترین محور.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-border-soft bg-surface p-6 shadow-[var(--shadow-card)]">
        <h2 className="font-heading font-semibold text-foreground">
          رایحه‌ای که بهت میاد
        </h2>
        <span aria-hidden="true" className="h-px w-10 bg-border-soft" />
        <p className="text-sm leading-8 text-muted">{archetype.fragranceHint}</p>
        <Link
          href={resultsHref}
          onClick={(event) => {
            if (onContinue) {
              // Open the optional context step (season + occasion) before the
              // recommendations: navigation happens later, from that step.
              event.preventDefault();
              onContinue();
              return;
            }

            // Legacy direct navigation: /result starts the results attempt —
            // clear the once-guards so RESULT_VIEWED can fire for this
            // navigation and again for a future attempt (Phase 7, §12).
            resetAnalyticsFlow();
          }}
          className="btn-primary flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-6 font-medium text-background"
        >
          دیدن عطرهای پیشنهادی
        </Link>
      </div>

      {/* Same shared animated trait bars as the recommendations screen —
          one implementation, identical duration/stagger/reduced-motion. */}
      <TraitBars vector={vector} />

      {notice ? (
        <p className="rounded-2xl border border-border-soft bg-surface-2 p-4 text-xs leading-7 text-muted">
          {notice}
        </p>
      ) : null}

      <p className="text-xs leading-7 text-muted">
        این نتیجه یک تحلیل سلیقه‌ای برای انتخاب عطر است، نه یک تست روانشناسی.
      </p>

      <button
        type="button"
        onClick={onRestart}
        className="btn-primary flex min-h-12 items-center justify-center rounded-2xl bg-accent px-6 font-medium text-background"
      >
        شروع دوباره
      </button>
    </section>
  );
}
