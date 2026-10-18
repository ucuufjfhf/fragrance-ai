import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AnalysisInterstitial, {
  ANALYSIS_DURATION_MS,
  ANALYSIS_PROGRESS_STEPS,
  ANALYSIS_TICK_MS,
  artworkIndexForTick,
  INTERSTITIAL_LINES,
  progressForTick,
} from "@/components/quiz/AnalysisInterstitial";
import FilteringCountdown, {
  buildCountdownSteps,
  FILTERING_DURATION_MS,
  FILTERING_FINAL_COUNT,
} from "@/components/quiz/FilteringCountdown";
import { artworkForPerfume } from "@/lib/perfumes/artwork";
import { toPersianDigits } from "@/lib/persian";
import { QUIZ_QUESTIONS } from "@/lib/personality/questions";
import { scoreQuiz } from "@/lib/personality/scoring";
import {
  parseResultsParams,
  serializeResultsParams,
} from "@/lib/results/params";
import type { QuizMatchPreview } from "@/types/personality";

/**
 * Phase 2 pacing beats — pure-logic and static-markup tests.
 *
 * They need no browser and no jsdom: the timer choreography itself is proven
 * in the browser gate on the production build (countdown ~3s, interstitial
 * ~6.5s, skip jumps, total ~9.5s). Here the contracts are locked: the steps
 * start at the live count and land on 3, the progress bar fills 0 → 100
 * monotonically at a steady rate and never holds at 100, the sillage
 * ornament is fully gone, the skip link exists, and reduced motion renders
 * static.
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

const noop = (): void => undefined;

const root = new URL("../../", import.meta.url);
const read = (path: string): string =>
  readFileSync(new URL(path, root), "utf8");

const previewMatches = (): QuizMatchPreview[] => [
  { perfumeId: "ref-a", name: "نام یک", brand: "برند یک" },
  { perfumeId: "ref-b", name: "نام دو", brand: "برند دو" },
  { perfumeId: "ref-c", name: "نام سه", brand: "برند سه" },
];

describe("filtering countdown steps", () => {
  it("starts at the live catalog count and lands on 3", () => {
    for (const count of [59, 41, 12]) {
      const steps = buildCountdownSteps(count);

      expect(steps[0]).toBe(count);
      expect(steps[steps.length - 1]).toBe(FILTERING_FINAL_COUNT);
    }
  });

  it("falls in strictly decreasing integers, decelerating", () => {
    const steps = buildCountdownSteps(59);

    for (const step of steps) {
      expect(Number.isInteger(step)).toBe(true);
      expect(step).toBeGreaterThanOrEqual(FILTERING_FINAL_COUNT);
    }

    const drops = steps.slice(1).map((step, index) => steps[index] - step);
    for (const drop of drops) {
      expect(drop).toBeGreaterThan(0);
    }

    // Decelerating: the first drop is the largest, the last the smallest.
    expect(drops[0]).toBeGreaterThan(drops[drops.length - 1]);
  });

  it("degrades a tiny pool to the final state", () => {
    expect(buildCountdownSteps(3)).toEqual([FILTERING_FINAL_COUNT]);
    expect(buildCountdownSteps(1)).toEqual([FILTERING_FINAL_COUNT]);
  });

  it("breathes: countdown ~3s and the whole performance ~9.5s", () => {
    expect(FILTERING_DURATION_MS).toBe(3000);
    expect(ANALYSIS_DURATION_MS).toBe(6500);
    expect(FILTERING_DURATION_MS + ANALYSIS_DURATION_MS).toBe(9500);
  });
});

describe("filtering countdown rendering", () => {
  it("opens on the live count with the شما-register line", () => {
    const html = render(
      <FilteringCountdown catalogCount={59} onDone={noop} />,
    );

    expect(html).toContain(toPersianDigits(59));
    expect(html).toContain("از بین");
    expect(html).toContain("مناسب شما پیدا شد");
    expect(html).toContain("quiz-rise");
    // Unboxed: no card classes on the beat's own section.
    expect(html).not.toContain("rounded-3xl");
    expect(html).not.toContain("bg-surface");
  });

  it("resolves to the final state instantly under reduced motion", () => {
    const html = render(
      <FilteringCountdown
        catalogCount={59}
        onDone={noop}
        reducedMotionOverride
      />,
    );

    expect(html).toContain(`>${toPersianDigits(FILTERING_FINAL_COUNT)}<`);
  });
});

describe("analysis interstitial progress", () => {
  it("fills 0 → 100 monotonically at a steady rate", () => {
    expect(progressForTick(0)).toBe(0);
    expect(progressForTick(ANALYSIS_PROGRESS_STEPS - 1)).toBe(100);

    const values = Array.from(
      { length: ANALYSIS_PROGRESS_STEPS },
      (_, tick) => progressForTick(tick),
    );

    for (const value of values) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }

    const deltas = values.slice(1).map((value, index) => value - values[index]);
    for (const delta of deltas) {
      // Monotonic, never a jump backwards — and never a leap: one tick is
      // ~1.5 points, so the fill reads as a constant rate, not jumps.
      expect(delta).toBeGreaterThanOrEqual(0);
      expect(delta).toBeLessThanOrEqual(2);
    }

    // Synced to the duration: 100ms ticks over ~6.5s.
    expect(ANALYSIS_TICK_MS).toBe(100);
    expect(ANALYSIS_TICK_MS * ANALYSIS_PROGRESS_STEPS).toBe(
      ANALYSIS_DURATION_MS,
    );
  });

  it("cycles through every artwork while the bar fills", () => {
    const seen = new Set(
      Array.from({ length: ANALYSIS_PROGRESS_STEPS }, (_, tick) =>
        artworkIndexForTick(tick, 3),
      ),
    );

    expect(seen).toEqual(new Set([0, 1, 2]));
    expect(artworkIndexForTick(0, 3)).toBe(0);
    expect(artworkIndexForTick(0, 0)).toBe(0);
  });
});

describe("analysis interstitial performance", () => {
  it("rotates warm شما-register microcopy with zero emojis", () => {
    expect(INTERSTITIAL_LINES.length).toBeGreaterThanOrEqual(3);

    for (const line of INTERSTITIAL_LINES) {
      expect(line).toContain("شما");
      expect(line).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
    }
  });

  it("opens the bar at zero with the artwork, lines and skip beside it", () => {
    const matches = previewMatches();
    const html = render(
      <AnalysisInterstitial matches={matches} onDone={noop} onSkip={noop} />,
    );

    // First frame: the bar starts empty at ۰٪ with the progressbar contract,
    // first line, first match.
    expect(html).toContain("۰٪");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain(INTERSTITIAL_LINES[0]);
    expect(html).toContain(artworkForPerfume(matches[0].perfumeId));
    expect(html).toContain(matches[0].name);
    expect(html).toContain(matches[0].brand);

    // No sillage ornament anywhere: the bar is the hero, images + lines +
    // ambience carry the rest.
    expect(html).not.toContain("sillage");

    // The skip is always visible: the beat is performed, never a forced gate.
    expect(html).toContain("رد شدن");

    // Unboxed: no card classes on the beat's own section (the bar track's
    // `bg-surface-2` is the quiz's own progressbar chrome, not a card).
    expect(html).toContain("quiz-rise");
    expect(html).not.toContain("rounded-3xl");
    expect(html).not.toContain("bg-surface\"");
  });

  it("shows one static frame under reduced motion", () => {
    const html = render(
      <AnalysisInterstitial
        matches={previewMatches()}
        onDone={noop}
        onSkip={noop}
        reducedMotionOverride
      />,
    );

    expect(html).toContain("۳۴٪");
    expect(html).not.toContain("sillage");
    expect(html).toContain("رد شدن");
  });

  it("removes every sillage trace from the stylesheet", () => {
    expect(read("app/globals.css")).not.toContain("sillage");
  });
});

describe("interstitial skip target", () => {
  it("builds a valid /result URL with no purchase context", () => {
    const answers = QUIZ_QUESTIONS.map((question) => ({
      questionId: question.id,
      optionId: question.options[0].id,
    }));
    const scored = scoreQuiz(answers);

    // Exactly what the skip handler serialises: vector + archetype + audience,
    // season/occasion omitted like «فرقی نمی‌کنه» in the context step.
    const href = `/result?${serializeResultsParams(
      scored.vector,
      scored.archetype.id,
      undefined,
      undefined,
      "MEN",
      null,
      null,
    )}`;

    const parsed = parseResultsParams(
      Object.fromEntries(new URL(href, "http://localhost").searchParams.entries()),
    );

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.vector).toEqual(scored.vector);
      expect(parsed.value.archetype.id).toBe(scored.archetype.id);
      expect(parsed.value.audience).toBe("MEN");
      expect(parsed.value.season).toBeNull();
      expect(parsed.value.occasion).toBeNull();
    }
  });
});
