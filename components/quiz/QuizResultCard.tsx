import Link from "next/link";

import TraitBars from "@/components/results/TraitBars";
import { BottleMark } from "@/components/ui-icons";

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
 * explanation belong to later phases and are deliberately absent here.
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
      className="quiz-rise flex flex-col gap-5 transition-colors duration-300"
      style={{
        "--accent": archetype.accentColor,
        "--accent-soft": `color-mix(in srgb, ${archetype.accentColor} 14%, white)`,
        "--accent-contrast": archetype.id === "clean-minimalist" || archetype.id === "elegant-classic" ? "#2A2420" : "#FFFFFF",
      } as CSSProperties}
    >
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-accent/40 bg-accent-soft p-6 text-center sm:p-8">
        <span className="text-sm text-accent">پروفایل عطری تو</span>
        <BottleMark className="h-8 w-8 text-accent" />
        <h1 className="text-2xl font-bold sm:text-3xl">{archetype.label}</h1>
        <p className="text-sm leading-8 text-foreground/80">
          {archetype.description}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-border-soft bg-surface p-6">
        <h2 className="font-semibold">رایحه‌ای که بهت میاد</h2>
        <p className="text-sm leading-8 text-muted">{archetype.fragranceHint}</p>
        <Link
          href={resultsHref}
          onClick={() => {
            // Navigating to /result starts the results attempt: clear the
            // once-guards so RESULT_VIEWED can fire for this navigation and
            // again for a future attempt (Phase 7, §12).
            resetAnalyticsFlow();
          }}
          className="flex min-h-12 w-full items-center justify-center rounded-2xl btn-primary bg-accent px-5 font-medium text-background transition-colors hover:bg-accent/90"
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
        className="flex min-h-12 items-center justify-center rounded-2xl btn-primary bg-accent px-5 font-medium text-background transition-colors hover:bg-accent/90"
      >
        شروع دوباره
      </button>
    </section>
  );
}
