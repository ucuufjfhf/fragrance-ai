"use client";

import { toPersianDigits } from "@/lib/persian";
import type { ShareCardEmphasisSegment, ShareCardModel } from "@/lib/results/share-card";

/**
 * The canvas painter for the downloadable share card (1080×1350, 4:5).
 *
 * Thin shell over `lib/results/share-card.ts`: every string, number and image
 * URL comes from the model, and `buildShareCardLayout` (pure) decides where each
 * block sits — which is what the tests pin. There is no pixel assertion here and
 * no visual-regression infra, so the layout maths is the contract.
 *
 * Rules the painter must never break:
 *  - the cream background is painted first, and the bottle is drawn with
 *    `multiply` on top of it, so the catalogue photo's studio white disappears;
 *  - the bottle is skipped entirely (and the text column centres) when the model
 *    carries no image, or when the image fails to load — a missing photo can
 *    cost the bottle, never the download;
 *  - the bar's length is `topPick.barPercent`, which IS the printed number;
 *  - fonts are awaited with a timeout, so a slow font delays the download by at
 *    most that timeout instead of blocking it.
 */

export interface ShareCardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShareCardPoint {
  x: number;
  y: number;
}

export interface ShareCardLayout {
  width: number;
  height: number;
  frames: [ShareCardRect, ShareCardRect];
  header: { wordmark: ShareCardPoint; tagline: ShareCardPoint };
  medallion: ShareCardPoint & {
    radius: number;
    ringWidth: number;
    haloRadius: number;
  };
  profileLabel: ShareCardPoint;
  archetypeLabel: ShareCardPoint;
  description: ShareCardRect & { align: CanvasTextAlign };
  divider: ShareCardPoint;
  topPick:
    | (ShareCardRect & {
        align: CanvasTextAlign;
        bottle: ShareCardRect | null;
        bottleRadial: ShareCardPoint & { radius: number } | null;
        shadow: ShareCardRect | null;
        composite: "multiply" | "source-over";
      })
    | null;
  footer: ShareCardPoint;
  textCentred: boolean;
}

/** Cream, ink and gold — the shipped palette values the card is built on. */
const CREAM = "#faf7f2";
const INK = "#2a2420";
const MUTED = "#756b5e";
const GOLD = "#d99a2b";

const FONT_DISPLAY = '"SG Kara"';
const FONT_EDITORIAL = '"Estedad"';
const FONT_BODY = '"Vazirmatn"';

export const SHARE_CARD_HALO_ALPHA = 0.25;
export const SHARE_CARD_BOTTLE_ALPHA = 0.34;

/** Where every block sits. Pure: same model + same bottle answer ⇒ same layout. */
export function buildShareCardLayout(
  model: ShareCardModel,
  options: { hasBottleImage: boolean },
): ShareCardLayout {
  const { width, height } = model;
  const centred = model.textCentred || !options.hasBottleImage;
  const textRight = 990;
  const anchorX = centred ? width / 2 : textRight;
  const align: CanvasTextAlign = centred ? "center" : "right";

  return {
    width,
    height,
    frames: [
      { x: 40, y: 40, width: width - 80, height: height - 80 },
      { x: 52, y: 52, width: width - 104, height: height - 104 },
    ],
    header: {
      wordmark: { x: width / 2, y: 176 },
      tagline: { x: width / 2, y: 220 },
    },
    medallion: { x: width / 2, y: 402, radius: 92, ringWidth: 3, haloRadius: 112 },
    profileLabel: { x: width / 2, y: 528 },
    archetypeLabel: { x: width / 2, y: 596 },
    description: { x: anchorX, y: 650, width: 860, height: 220, align },
    divider: { x: width / 2, y: 890 },
    topPick: model.topPick
      ? {
          x: anchorX,
          y: 946,
          width: 860,
          height: 300,
          align,
          bottle: centred
            ? null
            : { x: 96, y: 968, width: 320, height: 300 },
          bottleRadial: centred
            ? null
            : { x: 256, y: 1088, radius: 208 },
          shadow: centred ? null : { x: 116, y: 1236, width: 280, height: 26 },
          composite: centred ? "source-over" : "multiply",
        }
      : null,
    footer: { x: width / 2, y: 1286 },
    textCentred: centred,
  };
}

/** Letter-spaced text, so FIAGE / FIND YOUR SCENT read like the site header. */
function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
) {
  const characters = [...text];
  const total =
    characters.reduce((sum, character) => sum + ctx.measureText(character).width, 0) +
    tracking * Math.max(0, characters.length - 1);
  let cursor = x - total / 2;

  for (const character of characters) {
    ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + tracking;
  }
}

/**
 * One paragraph of the archetype description, wrapped per WORD and drawing the
 * emphasised runs with a soft accent band + bold face. Word-level wrapping keeps
 * every run's text intact, so the copy is never rewritten to fit.
 */
function drawDescription(
  ctx: CanvasRenderingContext2D,
  segments: readonly ShareCardEmphasisSegment[],
  block: ShareCardLayout["description"],
  accent: string,
) {
  const words = segments.flatMap((segment) =>
    segment.text
      .split(/(\s+)/)
      .filter((part) => part !== "")
      .map((part) => ({ text: part, emphasized: segment.emphasized })),
  );

  const spaceWidth = () => {
    ctx.font = `400 30px ${FONT_BODY}`;
    return ctx.measureText(" ").width;
  };

  const lines: { text: string; emphasized: boolean }[][] = [[]];
  let lineWidth = 0;
  const limit = block.width;

  for (const word of words) {
    ctx.font = `${word.emphasized ? "700" : "400"} 30px ${FONT_BODY}`;
    const wordWidth = ctx.measureText(word.text).width;
    if (word.text.trim() === "") {
      lineWidth += spaceWidth();
      continue;
    }
    const extra = lines[lines.length - 1].length > 0 ? spaceWidth() : 0;
    if (lineWidth + extra + wordWidth > limit && lines[lines.length - 1].length > 0) {
      lines.push([]);
      lineWidth = 0;
    }
    lines[lines.length - 1].push(word);
    lineWidth += (lines[lines.length - 1].length > 1 ? spaceWidth() : 0) + wordWidth;
  }

  const lineHeight = 46;
  lines.forEach((line, index) => {
    const y = block.y + index * lineHeight;
    const widths = line.map((word) => {
      ctx.font = `${word.emphasized ? "700" : "400"} 30px ${FONT_BODY}`;
      return ctx.measureText(word.text).width;
    });
    const totalWidth =
      widths.reduce((sum, value) => sum + value, 0) + spaceWidth() * Math.max(0, line.length - 1);
    let cursor =
      block.align === "center" ? block.x - totalWidth / 2 : block.x - totalWidth;

    line.forEach((word, wordIndex) => {
      ctx.font = `${word.emphasized ? "700" : "400"} 30px ${FONT_BODY}`;
      ctx.fillStyle = INK;
      if (word.emphasized) {
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.22;
        ctx.fillRect(cursor - 4, y - 24, widths[wordIndex] + 8, 36);
        ctx.globalAlpha = 1;
        ctx.fillStyle = INK;
      }
      ctx.fillText(word.text, cursor, y);
      cursor += widths[wordIndex] + spaceWidth();
    });
  });
}

/** The two bundled images the card can draw (both may legitimately be null). */
export interface ShareCardImages {
  bottle: CanvasImageSource | null;
  emblem: CanvasImageSource | null;
}

/** Draws one finished card. The caller owns the canvas and the loaded images. */
export function paintShareCard(
  ctx: CanvasRenderingContext2D,
  model: ShareCardModel,
  images: ShareCardImages,
): ShareCardLayout {
  const layout = buildShareCardLayout(model, { hasBottleImage: images.bottle !== null });
  const { width, height } = layout;

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.direction = "rtl";

  // Cream first: everything, including the multiplied bottle, sits on it.
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, width, height);

  // Thin double gold frame.
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.strokeRect(
    layout.frames[0].x,
    layout.frames[0].y,
    layout.frames[0].width,
    layout.frames[0].height,
  );
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    layout.frames[1].x,
    layout.frames[1].y,
    layout.frames[1].width,
    layout.frames[1].height,
  );
  ctx.globalAlpha = 1;

  // Header.
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.font = `600 46px ${FONT_DISPLAY}`;
  drawTracked(ctx, model.header.wordmark, layout.header.wordmark.x, layout.header.wordmark.y, 12);
  ctx.fillStyle = MUTED;
  ctx.font = `400 22px ${FONT_EDITORIAL}`;
  drawTracked(ctx, model.header.tagline, layout.header.tagline.x, layout.header.tagline.y, 8);

  // Medallion: gold halo, clipped emblem, 3px ring.
  const { x: mx, y: my, radius, ringWidth, haloRadius } = layout.medallion;
  ctx.beginPath();
  ctx.arc(mx, my, haloRadius, 0, Math.PI * 2);
  ctx.strokeStyle = GOLD;
  ctx.globalAlpha = SHARE_CARD_HALO_ALPHA;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#f5f0e8";
  ctx.fillRect(mx - radius, my - radius, radius * 2, radius * 2);
  if (images.emblem) {
    drawContainedImage(ctx, images.emblem, {
      x: mx - radius,
      y: my - radius,
      width: radius * 2,
      height: radius * 2,
    });
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(mx, my, radius, 0, Math.PI * 2);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = ringWidth;
  ctx.stroke();

  // Profile label + archetype name.
  ctx.textAlign = "center";
  ctx.fillStyle = model.archetype.accentColor;
  ctx.font = `400 28px ${FONT_BODY}`;
  ctx.fillText(model.profileLabel, layout.profileLabel.x, layout.profileLabel.y);
  ctx.fillStyle = INK;
  ctx.font = `600 64px ${FONT_DISPLAY}`;
  ctx.fillText(model.archetype.label, layout.archetypeLabel.x, layout.archetypeLabel.y);

  drawDescription(ctx, model.archetype.segments, layout.description, model.archetype.accentColor);

  // ✦ hairline divider.
  ctx.fillStyle = GOLD;
  ctx.font = `400 26px ${FONT_BODY}`;
  ctx.fillText(model.divider, layout.divider.x, layout.divider.y);
  ctx.globalAlpha = 0.35;
  ctx.fillRect(layout.divider.x - 140, layout.divider.y - 9, 100, 1);
  ctx.fillRect(layout.divider.x + 40, layout.divider.y - 9, 100, 1);
  ctx.globalAlpha = 1;

  const pick = layout.topPick;
  if (pick && model.topPick) {
    const top = model.topPick;

    // Text column (right in RTL, or centred when there is no bottle).
    ctx.textAlign = pick.align;
    ctx.fillStyle = GOLD;
    ctx.font = `400 24px ${FONT_EDITORIAL}`;
    ctx.fillText(model.topPick.label, pick.x, pick.y);

    ctx.fillStyle = INK;
    ctx.font = `600 46px ${FONT_DISPLAY}`;
    ctx.fillText(top.name, pick.x, pick.y + 56);

    ctx.fillStyle = MUTED;
    ctx.font = `400 26px ${FONT_EDITORIAL}`;
    ctx.fillText(top.brand, pick.x, pick.y + 100);

    // Closeness: label, the printed number, then the gold bar — one value.
    ctx.fillStyle = MUTED;
    ctx.font = `400 22px ${FONT_BODY}`;
    ctx.fillText(top.label, pick.x, pick.y + 156);

    ctx.fillStyle = INK;
    ctx.font = `600 40px ${FONT_DISPLAY}`;
    ctx.fillText(toPersianDigits(top.score), pick.x, pick.y + 208);

    const trackWidth = 300;
    const barHeight = 8;
    const trackRight = pick.x;
    const trackTop = pick.y + 232;
    ctx.fillStyle = "#f5f0e8";
    ctx.beginPath();
    ctx.roundRect(trackRight - trackWidth, trackTop, trackWidth, barHeight, barHeight / 2);
    ctx.fill();

    const fillWidth = (trackWidth * Math.min(100, Math.max(0, top.barPercent))) / 100;
    if (fillWidth > 0) {
      const gradient = ctx.createLinearGradient(trackRight, trackTop, trackRight - trackWidth, trackTop);
      gradient.addColorStop(0, GOLD);
      gradient.addColorStop(1, model.archetype.accentColor);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(trackRight - fillWidth, trackTop, fillWidth, barHeight, barHeight / 2);
      ctx.fill();
    }

    // Bottle: soft gold radial, the image multiplied onto the cream, and a
    // ground shadow. Skipped entirely when there is no usable image.
    if (pick.bottle && pick.bottleRadial && pick.shadow && images.bottle) {
      const radial = ctx.createRadialGradient(
        pick.bottleRadial.x,
        pick.bottleRadial.y,
        0,
        pick.bottleRadial.x,
        pick.bottleRadial.y,
        pick.bottleRadial.radius,
      );
      radial.addColorStop(0, `rgba(217, 154, 43, ${SHARE_CARD_BOTTLE_ALPHA})`);
      radial.addColorStop(0.55, "rgba(217, 154, 43, 0.14)");
      radial.addColorStop(1, "rgba(217, 154, 43, 0)");
      ctx.fillStyle = radial;
      ctx.fillRect(0, 700, width / 2 + 80, height - 700);

      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#2a2420";
      ctx.beginPath();
      ctx.ellipse(
        pick.shadow.x + pick.shadow.width / 2,
        pick.shadow.y + pick.shadow.height / 2,
        pick.shadow.width / 2,
        pick.shadow.height / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();

      ctx.save();
      // "multiply" drops the studio's white background into the cream.
      ctx.globalCompositeOperation = pick.composite;
      drawContainedImage(ctx, images.bottle, pick.bottle);
      ctx.restore();
    }
  }

  // Footer.
  ctx.textAlign = "center";
  ctx.fillStyle = MUTED;
  ctx.font = `400 24px ${FONT_BODY}`;
  ctx.fillText(`✦ ${model.footer.site} · ${model.footer.title}`, layout.footer.x, layout.footer.y);

  ctx.restore();
  return layout;
}

function drawContainedImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  box: ShareCardRect,
) {
  const source = image as { width?: number; height?: number };
  const naturalWidth = source.width ?? box.width;
  const naturalHeight = source.height ?? box.height;
  const scale = Math.min(box.width / naturalWidth, box.height / naturalHeight);
  const drawWidth = naturalWidth * scale;
  const drawHeight = naturalHeight * scale;

  ctx.drawImage(
    image,
    box.x + (box.width - drawWidth) / 2,
    box.y + (box.height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

/** Resolves an image without ever tainting the canvas (same-origin only). */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * Waits for the faces the card draws with, but never longer than `timeoutMs`:
 * a slow font may make the card's type fall back, it may not block the download.
 */
export async function ensureShareCardFonts(timeoutMs = 1500): Promise<boolean> {
  if (typeof document === "undefined" || !document.fonts) return false;

  const loads = [
    document.fonts.load(`600 48px ${FONT_DISPLAY}`, "FIAGE"),
    document.fonts.load(`400 28px ${FONT_EDITORIAL}`, "Estedad"),
    document.fonts.load(`400 30px ${FONT_BODY}`, "عطر"),
  ].map((promise) => promise.catch(() => [] as FontFace[]));

  const settled = await Promise.race([
    Promise.all(loads).then(() => true),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), timeoutMs);
    }),
  ]);

  return settled;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * Builds the card and downloads it as a PNG. Returns false instead of throwing:
 * a failed download must never break the page a shopper is reading.
 */
export async function downloadShareCard(model: ShareCardModel): Promise<boolean> {
  if (typeof document === "undefined") return false;

  try {
    await ensureShareCardFonts();

    const canvas = document.createElement("canvas");
    canvas.width = model.width;
    canvas.height = model.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    const bottleUrl = model.topPick?.bottleImageUrl ?? null;
    const [bottle, emblem] = await Promise.all([
      bottleUrl ? loadImage(bottleUrl) : Promise.resolve(null),
      loadImage(model.archetype.emblemUrl),
    ]);

    paintShareCard(ctx, model, { bottle, emblem });

    const blob = await toBlob(canvas);
    if (!blob) return false;

    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "fiage-result-card.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);

    return true;
  } catch {
    return false;
  }
}
