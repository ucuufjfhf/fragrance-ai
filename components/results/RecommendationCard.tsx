"use client";

import { ArrowLeftMark, BottleMark, StarMark } from "@/components/ui-icons";
import { trackEvent } from "@/lib/analytics/client";
import { formatPersianScore, toPersianDigits } from "@/lib/persian";
import type { MatchedPerfume } from "@/types/recommendation";

interface RecommendationCardProps {
  recommendation: MatchedPerfume;
  /** Persian «چرا این عطر؟» copy, present only when the AI answered. */
  explanation?: string;
}

/**
 * One deterministic recommendation, presented as an editorial entry rather
 * than a store shelf tile.
 *
 * Every value comes straight from the Phase 3 engine output (`MatchedPerfume`)
 * — this component never recomputes, re-rounds or re-orders anything. The
 * presentation score is displayed as-is; the AI explanation, when present, is
 * decoration on top and its absence never blocks or alters the card.
 *
 * The top-ranked recommendation gets a wider, image-led treatment; the rest are
 * compact rows. Both share one visual system (hairline borders, champagne
 * accents, the same match meter), so emphasis varies without variating style.
 */
export default function RecommendationCard({
  recommendation,
  explanation,
}: RecommendationCardProps) {
  const { rank, name, brand, presentationScore, productUrl, imageUrl, perfumeId, storeId } =
    recommendation;
  const isTop = rank === 1;

  // PERFUME_CLICKED — a real click on the product link (§6/§12).
  // Viewing the card never records an event.
  const handleProductClick = () => {
    void trackEvent({ eventType: "PERFUME_CLICKED", storeId, perfumeId });
  };

  const image = imageUrl ? (
    // Plain <img> keeps the demo data working without a configured
    // image domain; the URL comes from the merchant inventory.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={`تصویر عطر ${name}`}
      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
    />
  ) : (
    <span aria-hidden="true" className="flex h-full w-full items-center justify-center">
      <BottleMark className={isTop ? "h-10 w-10 text-champagne-deep/70" : "h-6 w-6 text-champagne-deep/60"} />
    </span>
  );

  const matchMeter = (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted">میزان تطابق</span>
        <span
          className={`tnum accent-ink font-heading font-semibold ${
            isTop ? "text-xl" : "text-sm"
          }`}
        >
          {formatPersianScore(presentationScore)}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border-soft/70"
        role="progressbar"
        aria-valuenow={Math.round(presentationScore)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`میزان تطابق ${name}`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${presentationScore}%`,
            backgroundImage:
              "linear-gradient(to left, var(--accent), color-mix(in srgb, var(--accent) 58%, var(--foreground)))",
          }}
        />
      </div>
    </div>
  );

  const explanationBlock = explanation ? (
    <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] bg-accent-soft p-4">
      <span className="eyebrow flex items-center gap-2 text-champagne-deep">
        <StarMark className="h-3 w-3" />
        چرا بهت میاد؟
      </span>
      <p className="text-sm leading-8 text-foreground/90">{explanation}</p>
    </div>
  ) : null;

  if (isTop) {
    return (
      <article className="quiz-rise group overflow-hidden rounded-[var(--radius-lg)] border border-border-soft bg-surface">
        <div className="flex flex-col sm:flex-row">
          <div className="relative flex min-h-44 shrink-0 items-center justify-center overflow-hidden bg-surface-2 sm:min-h-56 sm:w-56">
            {image}
            <span className="absolute end-3 top-3 flex items-center gap-1.5 rounded-full border border-champagne-deep/40 bg-background/90 px-3 py-1 text-[0.68rem] text-champagne-deep">
              <StarMark className="h-3 w-3" />
              نزدیک‌ترین رایحه
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-4 p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="display-md text-ink">{name}</h3>
                <span className="text-sm text-muted">{brand}</span>
              </div>
              <span
                aria-label={`رتبه ${rank}`}
                className="tnum shrink-0 rounded-full border border-border-soft px-3 py-1 text-xs text-muted"
              >
                {toPersianDigits(rank)}
              </span>
            </div>

            {matchMeter}
            {explanationBlock}

            {productUrl ? (
              <a
                href={productUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleProductClick}
                className="btn-primary mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-medium sm:w-fit"
              >
                مشاهده عطر
                <ArrowLeftMark className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="quiz-rise group flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-surface p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-surface-2 sm:h-24 sm:w-24">
        {image}
      </div>

      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="font-heading text-base text-ink">{name}</h3>
            <span className="text-xs text-muted">{brand}</span>
          </div>
          <span
            aria-label={`رتبه ${rank}`}
            className="tnum shrink-0 text-xs text-muted"
          >
            {toPersianDigits(rank)}
          </span>
        </div>

        {matchMeter}
        {explanationBlock}
      </div>

      {productUrl ? (
        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleProductClick}
          className="btn-ghost flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium sm:self-center"
        >
          مشاهده عطر
          <ArrowLeftMark className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </article>
  );
}
