import Link from "next/link";

import TraitBars from "@/components/results/TraitBars";
import { ArrowLeftMark, BottleMark, StarMark } from "@/components/ui-icons";

import { resetAnalyticsFlow } from "@/lib/analytics/flow-tracker";
import { serializeResultsParams } from "@/lib/results/params";
import type { CSSProperties } from "react";
import type { QuizResult } from "@/types/personality";

interface QuizResultCardProps {
  result: QuizResult;
  /** Set when the profile had to be computed locally because the API failed. */
  notice?: string | null;
  onRestart: () => void;
  /** Optional store context (Phase 9) — pinned into the results URL. */
  storeId?: string;
}

/**
 * Phase 1 result view: the archetype and the full 0–100 personality profile.
 *
 * Perfume recommendations, match percentages and the AI-written «چرا این عطر؟»
 * explanation belong to later phases and are deliberately absent here — the
 * screen exists to reveal the profile, not to sell.
 */
export default function QuizResultCard({
  result,
  notice,
  onRestart,
  storeId,
}: QuizResultCardProps) {
  const { archetype, vector } = result;

  // The results page is a server component: the profile travels in the URL and
  // the engine + AI run server-side (Phase 5). Works offline too, because the
  // same pure scorer produced this result even when the API failed.
  // Phase 9: when the quiz carries a store context it is pinned into the URL,
  // so recommendations come from that store instead of the default.
  const resultsHref = `/result?${serializeResultsParams(vector, archetype.id, storeId)}`;

  return (
    <section
      className="quiz-rise flex flex-col gap-6 transition-colors duration-300"
      style={
        {
          "--accent": archetype.accentColor,
          "--accent-soft": `color-mix(in srgb, ${archetype.accentColor} 20%, transparent)`,
        } as CSSProperties
      }
    >
      {/* --- the reveal: the archetype, lit from above by its own colour --- */}
      <div className="relative isolate overflow-hidden rounded-[var(--radius-lg)] border border-border-soft bg-surface/70 px-6 py-10 text-center sm:px-10 sm:py-14">
        <span
          aria-hidden="true"
          className="cosmic-layer"
          style={{
            background: `radial-gradient(58% 62% at 50% 0%, color-mix(in srgb, ${archetype.accentColor} 55%, transparent), transparent 72%)`,
          }}
        />
        <div className="relative flex flex-col items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full border"
            style={{ borderColor: `color-mix(in srgb, ${archetype.accentColor} 70%, transparent)` }}
          >
            <StarMark
              className="h-5 w-5"
              /* the archetype colour reads as decoration here, never as text */
            />
          </span>
          <span className="eyebrow flex items-center gap-2 text-champagne">
            <BottleMark className="h-3.5 w-3.5" />
            پروفایل عطری تو
          </span>
          <h1 className="display-xl max-w-lg text-ivory">{archetype.label}</h1>
          <p className="max-w-md text-sm leading-9 text-muted">{archetype.description}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-surface p-6">
        <span className="eyebrow flex items-center gap-2 text-champagne">
          <StarMark className="h-3 w-3" />
          رایحه‌ای که بهت میاد
        </span>
        <p className="text-sm leading-9 text-muted">{archetype.fragranceHint}</p>
        <Link
          href={resultsHref}
          onClick={() => {
            // Navigating to /result starts the results attempt: clear the
            // once-guards so RESULT_VIEWED can fire for this navigation and
            // again for a future attempt (Phase 7, §12).
            resetAnalyticsFlow();
          }}
          className="btn-primary mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 font-medium"
        >
          دیدن عطرهای پیشنهادی
          <ArrowLeftMark className="h-4 w-4" />
        </Link>
      </div>

      {/* Same shared animated trait bars as the recommendations screen —
          one implementation, identical duration/stagger/reduced-motion. */}
      <TraitBars vector={vector} />

      {notice ? (
        <p className="rounded-[var(--radius-md)] border border-border-soft bg-surface-2/60 p-4 text-xs leading-7 text-muted">
          {notice}
        </p>
      ) : null}

      <p className="text-xs leading-7 text-muted">
        این نتیجه یک تحلیل سلیقه‌ای برای انتخاب عطر است، نه یک تست روانشناسی.
      </p>

      <button
        type="button"
        onClick={onRestart}
        className="btn-ghost flex min-h-12 items-center justify-center rounded-full text-sm"
      >
        شروع دوباره
      </button>
    </section>
  );
}
