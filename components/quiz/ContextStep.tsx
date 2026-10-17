import Link from "next/link";

import QuizOption from "@/components/quiz/QuizOption";
import { resetAnalyticsFlow } from "@/lib/analytics/flow-tracker";
import type { AudienceGender } from "@/lib/audience";
import {
  CONTEXT_HEADING,
  NO_PREFERENCE_ID,
  NO_PREFERENCE_LABEL,
  OCCASION_OPTIONS,
  OCCASION_QUESTION,
  SEASON_OPTIONS,
  SEASON_QUESTION,
  type SeasonFilter,
} from "@/lib/context";
import { serializeResultsParams } from "@/lib/results/params";
import type { Occasion } from "@/types/fragrance";
import type { QuizResult } from "@/types/personality";

interface ContextStepProps {
  /** The completed personality result — needed to build the results URL. */
  result: QuizResult;
  /** Optional store context (Phase 9) — pinned into the results URL. */
  storeId?: string;
  /** Optional audience from the step before Q1 — rides along unchanged. */
  audience?: AudienceGender | null;
  /** Current context selections (`null` = «فرقی نمی‌کنه» = no filter). */
  season: SeasonFilter | null;
  occasion: Occasion | null;
  onSeasonChange: (season: SeasonFilter | null) => void;
  onOccasionChange: (occasion: Occasion | null) => void;
  /** Returns to the personality result screen without losing selections. */
  onBack: () => void;
}

/**
 * The optional context step: one short screen AFTER the personality result
 * and BEFORE the recommendations link.
 *
 * It asks two optional purchase-context questions (season, occasion) using the
 * same `QuizOption` radio cards as every other screen, so the visual language
 * stays identical. It is NOT a personality question: the selections live in the
 * quiz-flow state, never enter `selections`, and can never change the vector or
 * the archetype. «فرقی نمی‌کنه» (and proceeding without choosing) both mean no
 * filter and serialise to an omitted URL token.
 *
 * The continue link is the ONLY place the final results URL is built with the
 * context tokens; the legacy parameters (vector, archetype, store, source,
 * audience) are passed through unchanged.
 */
export default function ContextStep({
  result,
  storeId,
  audience,
  season,
  occasion,
  onSeasonChange,
  onOccasionChange,
  onBack,
}: ContextStepProps) {
  const { archetype, vector } = result;

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span aria-hidden="true" className="h-px w-12 bg-accent/50" />
        <h2 className="font-display text-[1.7rem] font-semibold leading-[1.0] tracking-[-0.01em] text-foreground sm:text-4xl">
          {CONTEXT_HEADING}
        </h2>
        <p className="font-editorial text-sm leading-7 text-muted">
          این مرحله اختیاریه؛ هر دو رو «فرقی نمی‌کنه» بذارید هم مشکلی نیست.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-3 font-display text-lg font-semibold leading-9 text-foreground sm:text-xl">
          {SEASON_QUESTION}
        </legend>
        <div className="flex flex-col gap-3">
          {SEASON_OPTIONS.map((option, optionIndex) => (
            <QuizOption
              key={option.id}
              name="context-season"
              optionId={option.id}
              label={option.label}
              index={optionIndex}
              selected={season === option.id}
              onSelect={() => onSeasonChange(option.id)}
            />
          ))}
          <QuizOption
            name="context-season"
            optionId={NO_PREFERENCE_ID}
            label={NO_PREFERENCE_LABEL}
            index={SEASON_OPTIONS.length}
            selected={season === null}
            onSelect={() => onSeasonChange(null)}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-3 font-display text-lg font-semibold leading-9 text-foreground sm:text-xl">
          {OCCASION_QUESTION}
        </legend>
        <div className="flex flex-col gap-3">
          {OCCASION_OPTIONS.map((option, optionIndex) => (
            <QuizOption
              key={option.id}
              name="context-occasion"
              optionId={option.id}
              label={option.label}
              index={optionIndex}
              selected={occasion === option.id}
              onSelect={() => onOccasionChange(option.id)}
            />
          ))}
          <QuizOption
            name="context-occasion"
            optionId={NO_PREFERENCE_ID}
            label={NO_PREFERENCE_LABEL}
            index={OCCASION_OPTIONS.length}
            selected={occasion === null}
            onSelect={() => onOccasionChange(null)}
          />
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-12 items-center justify-center rounded-2xl border border-border-soft px-5 text-sm text-muted transition-colors hover:border-accent/50 hover:text-foreground"
        >
          قبلی
        </button>
        <Link
          href={resultsHref}
          onClick={() => {
            // Navigating to /result starts the results attempt: clear the
            // once-guards so RESULT_VIEWED can fire for this navigation and
            // again for a future attempt (Phase 7, §12) — identical to the
            // personality result card's legacy behaviour.
            resetAnalyticsFlow();
          }}
          className="btn-primary flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-accent px-5 font-medium text-background"
        >
          دیدن عطرهای پیشنهادی
        </Link>
      </div>
    </div>
  );
}
