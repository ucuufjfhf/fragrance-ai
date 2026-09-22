"use client";

import { trackEvent } from "@/lib/analytics/client";
import { formatPersianScore } from "@/lib/persian";
import type { MatchedPerfume } from "@/types/recommendation";

interface RecommendationCardProps {
  recommendation: MatchedPerfume;
  /** Persian «چرا این عطر؟» copy, present only when the AI answered. */
  explanation?: string;
}

/**
 * One deterministic recommendation in the ranked list.
 *
 * Every value comes straight from the Phase 3 engine output (`MatchedPerfume`)
 * — this component never recomputes, re-rounds or re-orders anything. The
 * presentation score is displayed as-is; the AI explanation, when present, is
 * decoration on top and its absence never blocks or alters the card.
 */
export default function RecommendationCard({
  recommendation,
  explanation,
}: RecommendationCardProps) {
  const { rank, name, brand, presentationScore, productUrl, imageUrl, perfumeId, storeId } =
    recommendation;

  return (
    <article className="quiz-rise flex flex-col gap-4 rounded-3xl border border-border-soft bg-surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {imageUrl ? (
            // Plain <img> keeps the demo data working without a configured
            // image domain; the URL comes from the merchant inventory.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`تصویر عطر ${name}`}
              className="h-16 w-16 shrink-0 rounded-2xl border border-border-soft object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-border-soft bg-surface-2 text-2xl"
            >
              🧴
            </span>
          )}

          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-bold leading-8">{name}</h3>
            <span className="text-sm text-muted">{brand}</span>
          </div>
        </div>

        <span
          aria-label={`رتبه ${rank}`}
          className="tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-sm font-bold text-accent"
        >
          {rank}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={Math.round(presentationScore)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`میزان تطابق ${name}`}
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${presentationScore}%` }}
          />
        </div>
        <span className="tnum shrink-0 text-sm font-semibold text-accent">
          {formatPersianScore(presentationScore)} تطابق
        </span>
      </div>

      {explanation ? (
        <div className="flex flex-col gap-1 rounded-2xl border border-accent/25 bg-accent-soft/60 p-4">
          <span className="text-xs font-semibold text-accent">چرا بهت میاد؟</span>
          <p className="text-sm leading-8 text-foreground/90">{explanation}</p>
        </div>
      ) : null}

      {productUrl ? (
        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            // PERFUME_CLICKED — a real click on the product link (§6/§12).
            // Viewing the card never records an event.
            void trackEvent({ eventType: "PERFUME_CLICKED", storeId, perfumeId });
          }}
          className="flex min-h-11 items-center justify-center rounded-2xl border border-border-soft px-5 text-sm font-medium text-foreground transition-colors hover:border-accent/50 hover:text-accent"
        >
          مشاهده عطر →
        </a>
      ) : null}
    </article>
  );
}
