import { archetypeEmblemImageFor } from "@/components/archetype-emblems";
import {
  SCENT_RADAR_AXES,
  SCENT_RADAR_LABELS,
  radarValuesFromVector,
  scentRadarSummary,
} from "@/lib/fragrance/radar";
import { artworkForPerfume } from "@/lib/perfumes/artwork";
import { splitEmphasis } from "@/lib/personality/archetypes";
import type { Archetype, PersonalityVector } from "@/types/personality";

/**
 * The downloadable share card's CONTENT model — pure data, no canvas, no React.
 *
 * Everything the 1080×1350 card shows is decided here, so the painter is a thin
 * shell that can only draw what the model says. That keeps three honesty rules
 * testable without a browser:
 *
 *  - the closeness number is the SAME rounded whole number the recommendation
 *    card prints (`Math.round(presentationScore)`) and the bar length IS that
 *    number — one value, never two;
 *  - the archetype copy is `splitEmphasis` output over the stored description,
 *    so the emphasised runs rejoin to the exact stored string;
 *  - the bottle zone exists only when a same-origin image is available. No
 *    image ⇒ no bottle and a centred text block, never a placeholder, never a
 *    cross-origin draw into the canvas.
 */

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

export const SHARE_CARD_WORDMARK = "FIAGE";
export const SHARE_CARD_TAGLINE = "FIND YOUR SCENT";
export const SHARE_CARD_PROFILE_LABEL = "پروفایل عطری شما";
export const SHARE_CARD_DIVIDER = "✦";
export const SHARE_CARD_TOP_LABEL = "پیشنهاد اول شما";
export const SHARE_CARD_CLOSENESS_LABEL = "شاخص نزدیکی";
export const SHARE_CARD_FOOTER_SITE = "fiage.ir";
export const SHARE_CARD_FOOTER_TITLE = "عطر خودتو پیدا کن";

/** One run of the archetype description: plain copy, or an emphasised trait. */
export interface ShareCardEmphasisSegment {
  text: string;
  emphasized: boolean;
}

/** The top recommendation, as the share card needs it. */
export interface ShareCardTopPickInput {
  name: string;
  brand: string;
  /** The engine's presentation score; rounded here, exactly as the card does. */
  presentationScore: number;
  /** Same-origin bottle image, or null. The model never invents one. */
  imageUrl?: string | null;
}

export interface ShareCardTopPick {
  name: string;
  brand: string;
  /** «شاخص نزدیکی» — the label the card prints. */
  label: string;
  /** The rounded whole number: what the card prints AND the bar's length. */
  score: number;
  /** Duplicated on purpose: the painter never re-derives the bar length. */
  barPercent: number;
  bottleImageUrl: string | null;
  /** True when the bottle zone is painted; false ⇒ text block is centred. */
  bottle: boolean;
}

export interface ShareCardModel {
  width: number;
  height: number;
  header: { wordmark: string; tagline: string };
  profileLabel: string;
  archetype: {
    label: string;
    description: string;
    segments: ShareCardEmphasisSegment[];
    accentColor: string;
    emblemUrl: string;
  };
  divider: string;
  /**
   * The five-axis scent radar, from the SAME module the page's SVG uses — the
   * card's picture of the shopper's own five matching-axis values.
   */
  radar: {
    axes: readonly string[];
    labels: string[];
    values: number[];
    summary: string;
  };
  topPick: ShareCardTopPick | null;
  /** True when there is no bottle, so the text column centres. */
  textCentred: boolean;
  footer: { site: string; title: string };
}

/**
 * The bottle image for the share card, resolved the same way the result card
 * resolves its artwork — but NEVER across origins.
 *
 * - a same-origin `imageUrl` (a bundled or relative path) is used as-is;
 * - an absolute/cross-origin `imageUrl` (merchant inventory on another host)
 *   resolves to `null`: drawing it would taint the canvas and kill the download;
 * - no `imageUrl` at all falls back to that perfume's bundled curated artwork,
 *   which is what the demo catalog's imageless rows show on the page too.
 */
export function resolveShareCardImage(pick: {
  imageUrl?: string | null;
  perfumeId?: string;
}): string | null {
  if (pick.imageUrl) return pick.imageUrl.startsWith("/") ? pick.imageUrl : null;
  if (pick.perfumeId) return artworkForPerfume(pick.perfumeId);
  return null;
}

/**
 * Builds the whole card's content. `topPick` is the first recommendation as
 * rendered; `null` (an empty result) simply omits the top block.
 */
export function buildShareCardModel(
  archetype: Archetype,
  topPick: ShareCardTopPickInput | null,
  vector: PersonalityVector,
): ShareCardModel {
  const segments = splitEmphasis(archetype.description, archetype.emphasisWords);
  const radarValues = radarValuesFromVector(vector);
  const score = topPick ? Math.round(topPick.presentationScore) : 0;
  const bottleImageUrl = topPick?.imageUrl ?? null;
  const bottle = bottleImageUrl !== null;

  return {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    header: { wordmark: SHARE_CARD_WORDMARK, tagline: SHARE_CARD_TAGLINE },
    profileLabel: SHARE_CARD_PROFILE_LABEL,
    archetype: {
      label: archetype.label,
      description: archetype.description,
      segments,
      accentColor: archetype.accentColor,
      emblemUrl: archetypeEmblemImageFor(archetype.id),
    },
    divider: SHARE_CARD_DIVIDER,
    radar: {
      axes: SCENT_RADAR_AXES,
      labels: SCENT_RADAR_AXES.map((axis) => SCENT_RADAR_LABELS[axis]),
      values: radarValues,
      summary: scentRadarSummary(radarValues),
    },
    topPick: topPick
      ? {
          name: topPick.name,
          brand: topPick.brand,
          label: SHARE_CARD_CLOSENESS_LABEL,
          score,
          barPercent: score,
          bottleImageUrl,
          bottle,
        }
      : null,
    textCentred: !bottle,
    footer: { site: SHARE_CARD_FOOTER_SITE, title: SHARE_CARD_FOOTER_TITLE },
  };
}
