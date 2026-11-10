"use client";

import { useState } from "react";

import { buildShareCardModel, resolveShareCardImage } from "@/lib/results/share-card";
import { downloadShareCard } from "@/lib/results/share-card-painter";
import type { Archetype, PersonalityVector } from "@/types/personality";
import type { MatchedPerfume } from "@/types/recommendation";

/**
 * «دانلود کارت نتیجه» — the shopper's own result as a 4:5 PNG.
 *
 * Everything is client-side: the pure model is built from the archetype and the
 * first recommendation exactly as the page renders them, then the painter draws
 * it and triggers a real download. No server route, no new dependency and no new
 * analytics event — the card is a picture of what is already on screen.
 *
 * A failed render or a blocked download leaves the page untouched and says so in
 * a polite live region; the button is never disabled permanently.
 */
export default function DownloadResultCardButton({
  archetype,
  recommendation,
  vector,
}: {
  archetype: Archetype;
  recommendation: MatchedPerfume;
  /** The shopper's own five matching-axis values — the radar on the card. */
  vector: PersonalityVector;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setFailed(false);

    try {
      const model = buildShareCardModel(archetype, {
        name: recommendation.name,
        brand: recommendation.brand,
        presentationScore: recommendation.presentationScore,
        // Same-origin only: a merchant photo on another host would taint the
        // canvas, so it resolves to null and the card centres its text instead.
        imageUrl: resolveShareCardImage(recommendation),
      }, vector);

      const ok = await downloadShareCard(model);
      if (!ok) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void download()}
        aria-busy={busy}
        className="btn-secondary flex min-h-12 flex-1 items-center justify-center px-5 text-sm text-muted hover:text-foreground"
      >
        {busy ? "در حال ساخت کارت" : "دانلود کارت نتیجه"}
      </button>
      <span className="sr-only" aria-live="polite" role="status">
        {failed ? "ساخت کارت نتیجه انجام نشد؛ دوباره تلاش کنید." : ""}
      </span>
    </>
  );
}
