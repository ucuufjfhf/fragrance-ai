import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ARCHETYPES, getArchetypeById } from "@/lib/personality/archetypes";
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  buildShareCardModel,
  resolveShareCardImage,
} from "@/lib/results/share-card";
import { buildShareCardLayout } from "@/lib/results/share-card-painter";

/**
 * Batch 36 — the downloadable share card, at the model/layout boundary.
 *
 * The card's PNG is not asserted here (there is no visual-regression
 * infrastructure): what IS pinned is everything that could silently lie — the
 * score, the copy, the fallbacks, the canvas size, where the bottle goes, and
 * that the bottle is composited with `multiply`.
 */

const PAINTER_SOURCE = readFileSync(
  new URL("../../lib/results/share-card-painter.ts", import.meta.url),
  "utf8",
);

const archetype = getArchetypeById("bold-one")!;

const fullPick = {
  name: "نویر آزمون",
  brand: "خانه آزمون",
  presentationScore: 92.4,
  imageUrl: "/perfumes/perfume-01.jpg" as string | null,
};

const modelWith = (overrides: Partial<typeof fullPick> = {}) =>
  buildShareCardModel(archetype, { ...fullPick, ...overrides });

describe("share card model — content", () => {
  const model = modelWith();

  it("carries every block the approved card draws", () => {
    expect(model.width).toBe(1080);
    expect(model.height).toBe(1350);
    expect(model.header).toEqual({ wordmark: "FIAGE", tagline: "FIND YOUR SCENT" });
    expect(model.profileLabel).toBe("پروفایل عطری شما");
    expect(model.divider).toBe("✦");

    expect(model.archetype.label).toBe(archetype.label);
    expect(model.archetype.accentColor).toBe(archetype.accentColor);
    expect(model.archetype.emblemUrl).toBe(`/archetypes/${archetype.id}.jpg`);
    expect(model.archetype.description).toBe(archetype.description);

    expect(model.topPick).toMatchObject({
      name: fullPick.name,
      brand: fullPick.brand,
      label: "شاخص نزدیکی",
      bottle: true,
      bottleImageUrl: fullPick.imageUrl,
    });
    expect(model.textCentred).toBe(false);
  });

  it("names the footer exactly: the site, the quiz title and nothing else", () => {
    expect(model.footer.site).toBe("fiage.ir");
    expect(model.footer.title).toBe("عطر خودتو پیدا کن");
  });

  it("leaves room for the radar that comes next, without shipping one", () => {
    expect(Object.keys(model)).not.toContain("radar");
  });
});

describe("share card model — the score is the printed number", () => {
  it("rounds exactly like the recommendation card", () => {
    for (const [raw, rounded] of [
      [92.4, 92],
      [89.6, 90],
      [92.5, 93],
      [78.2, 78],
      [100, 100],
      [0, 0],
    ] as const) {
      const model = modelWith({ presentationScore: raw });

      expect(model.topPick!.score, `${raw}`).toBe(rounded);
      // The bar length is the same value, not a second calculation.
      expect(model.topPick!.barPercent, `${raw}`).toBe(rounded);
      expect(model.topPick!.score).toBe(model.topPick!.barPercent);
    }
  });
});

describe("share card model — emphasis is lossless", () => {
  it("bands the declared words and reassembles the copy byte-for-byte", () => {
    for (const candidate of ARCHETYPES) {
      const model = buildShareCardModel(candidate, fullPick);
      const banded = model.archetype.segments
        .filter((segment) => segment.emphasized)
        .map((segment) => segment.text);

      expect(banded.sort(), `${candidate.id}: banded`).toEqual(
        [...candidate.emphasisWords].sort(),
      );
      expect(
        model.archetype.segments.map((segment) => segment.text).join(""),
        `${candidate.id}: copy`,
      ).toBe(candidate.description);
    }
  });
});

describe("share card — fallbacks", () => {
  it("imageless top pick: no bottle, text centred", () => {
    const model = modelWith({ imageUrl: null });

    expect(model.topPick!.bottle).toBe(false);
    expect(model.topPick!.bottleImageUrl).toBeNull();
    expect(model.textCentred).toBe(true);

    const layout = buildShareCardLayout(model, { hasBottleImage: false });
    expect(layout.topPick!.bottle).toBeNull();
    expect(layout.topPick!.bottleRadial).toBeNull();
    expect(layout.topPick!.shadow).toBeNull();
    expect(layout.topPick!.align).toBe("center");
    expect(layout.description.align).toBe("center");
  });

  it("cross-origin merchant image: dropped instead of tainting the canvas", () => {
    const external = "https://shop.example/p/1.jpg";

    expect(resolveShareCardImage({ imageUrl: external, perfumeId: "p-1" })).toBeNull();

    // Feeding that resolution through the model gives the same fallback.
    const model = modelWith({ imageUrl: resolveShareCardImage({ imageUrl: external }) });
    expect(model.topPick!.bottle).toBe(false);
    expect(model.textCentred).toBe(true);
  });

  it("an imageless demo row uses its bundled curated artwork", () => {
    const bundled = resolveShareCardImage({ imageUrl: null, perfumeId: "perfume-test-noir" });

    expect(bundled).not.toBeNull();
    expect(bundled!.startsWith("/perfumes/")).toBe(true);
    // Bundled artwork is same-origin, so it is safe to draw.
    expect(modelWith({ imageUrl: bundled }).topPick!.bottle).toBe(true);
  });

  it("no top pick at all: model stays complete, minus the block", () => {
    const model = buildShareCardModel(archetype, null);

    expect(model.topPick).toBeNull();
    expect(model.textCentred).toBe(true);
    expect(model.archetype.description).toBe(archetype.description);
  });
});

describe("share card — canvas and bottle compositing", () => {
  it("draws at 1080×1350", () => {
    const layout = buildShareCardLayout(modelWith(), { hasBottleImage: true });

    expect(SHARE_CARD_WIDTH).toBe(1080);
    expect(SHARE_CARD_HEIGHT).toBe(1350);
    expect(layout.width).toBe(1080);
    expect(layout.height).toBe(1350);
  });

  it("paints the bottle on the left with multiply, text on the right", () => {
    const layout = buildShareCardLayout(modelWith(), { hasBottleImage: true });

    expect(layout.topPick!.composite).toBe("multiply");
    expect(layout.topPick!.bottle).not.toBeNull();
    expect(layout.topPick!.bottleRadial).not.toBeNull();
    expect(layout.topPick!.shadow).not.toBeNull();
    // Bottle sits in the left third; the text column is right-aligned.
    expect(layout.topPick!.bottle!.x).toBeLessThan(540);
    expect(layout.topPick!.align).toBe("right");
    // The painter really applies the layout's operation.
    expect(PAINTER_SOURCE).toContain("globalCompositeOperation = pick.composite");
  });

  it("a failed image load falls back, it never fails the download", () => {
    // The loader resolves null on error, and a null bottle is simply not painted.
    expect(PAINTER_SOURCE).toContain("image.onerror = () => resolve(null)");
    // Every draw/download failure returns false instead of throwing at the page.
    expect(PAINTER_SOURCE).toContain("} catch {");
    expect(PAINTER_SOURCE).toContain("if (!blob) return false;");
    expect(PAINTER_SOURCE).toContain("if (!ctx) return false;");
  });
});
