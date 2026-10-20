"use client";

import { artworkForPerfume } from "@/lib/perfumes/artwork";
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
 *
 * Phase D: each card leads with a 16:10 artwork panel. The merchant's own
 * `imageUrl` keeps absolute precedence; when the engine returns none (every
 * demo/reference-catalog card), the bundled curated artwork for that perfume id
 * fills the panel instead of the bare bottle glyph. The mapping is pure and
 * id-derived (`lib/perfumes/artwork.ts`) — decoration only, never an input to
 * eligibility, scoring or ranking. Rank, score, product link and analytics are
 * unchanged.
 */
export default function RecommendationCard({
  recommendation,
  explanation,
}: RecommendationCardProps) {
  const { rank, name, brand, presentationScore, productUrl, imageUrl, perfumeId, storeId } =
    recommendation;

  // Merchant inventory wins; the curated artwork only covers the gap the demo
  // catalog leaves (it stores no image URLs at all).
  const artwork = imageUrl ? null : artworkForPerfume(perfumeId);

  return (
    <article className="quiz-rise relative flex flex-col overflow-hidden rounded-3xl border border-border-soft bg-surface shadow-[var(--shadow-card)]">
      {/* --- artwork panel --- */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-2">
        {imageUrl ? (
          // Plain <img> keeps merchant data working without a configured image
          // domain; the URL comes from the merchant inventory.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`تصویر عطر ${name}`}
            className="h-full w-full object-cover"
          />
        ) : (
          // The curated artwork is a CSS cover layer in the same frame (the
          // demo catalog has no merchant image URL). It carries the card's
          // accessible image semantics via role/aria-label.
          <span
            role="img"
            aria-label={`تصویر عطر ${name}`}
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${artwork})` }}
          />
        )}

        {/* Scrim: keeps the rank badge and the name legible on any photo, dark
            or bright, without dimming the artwork's top half. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/80 via-black/25 to-transparent"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/15"
        />

        <span
          aria-label={`رتبه ${rank}`}
          className="tnum absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/45 bg-background/85 text-sm font-bold text-accent shadow-[var(--shadow-card)] backdrop-blur"
        >
          {rank}
        </span>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-4">
          <h3 className="font-heading text-lg font-bold leading-7 text-background drop-shadow-sm">
            {name}
          </h3>
          <span className="text-xs text-background/80">{brand}</span>
        </div>
      </div>

      {/* --- card body: match, explanation, details --- */}
      <div className="flex flex-col gap-4 p-5 sm:p-6">
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
              className="h-full rounded-full"
              style={{
                width: `${presentationScore}%`,
                backgroundImage:
                  "linear-gradient(to left, var(--accent) 0%, var(--accent) 55%, color-mix(in srgb, var(--accent) 55%, white) 100%)",
              }}
            />
          </div>
          <span className="tnum shrink-0 text-sm font-semibold text-accent">
            {formatPersianScore(presentationScore)} تطابق
          </span>
        </div>

        {explanation ? (
          <div className="flex flex-col gap-1 rounded-2xl border border-accent/25 bg-accent-soft/60 p-4">
            <span className="text-xs font-semibold text-accent">چرا بهتون میاد؟</span>
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
            className="btn-secondary flex min-h-11 items-center justify-center px-5 text-sm font-medium text-foreground hover:text-accent"
          >
            مشاهده در ترب
          </a>
        ) : null}
      </div>
    </article>
  );
}
