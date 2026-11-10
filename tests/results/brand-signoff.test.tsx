import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ResultsView from "@/components/results/ResultsView";
import { BRAND_SIGNOFF_LINE } from "@/components/results/BrandSignoff";
import { getArchetypeById } from "@/lib/personality/archetypes";
import type { ResultsViewData } from "@/lib/results/service";
import { makeMatchResult, makeVector } from "@/tests/ai/fixtures";

/**
 * Batch 32 — the FIAGE sign-off that closes /result.
 *
 * The page now ends like a letter: mark → FIAGE → FIND YOUR SCENT → one Persian
 * sentence. The strict parts are that it comes last in BOTH result modes, that
 * the share/retake actions above it are unchanged, and that the owner-picked
 * line is byte-exact.
 */

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");

const WIDGET_SOURCE = read("components/widget/WidgetApp.tsx");

/** The owner-picked line, typed again here so copy drift fails on either side. */
const PICKED_LINE = "این فقط یه عطر نیست؛ امضای شماست.";

const archetype = getArchetypeById("mysterious-explorer")!;
const vector = makeVector(50);

const viewData = (isEmpty: boolean): ResultsViewData => ({
  recommendations: isEmpty ? [] : makeMatchResult().recommendations,
  explanations: new Map(),
  aiAvailable: false,
  isEmpty,
});

const renderView = (isEmpty = false): string =>
  renderToStaticMarkup(
    <ResultsView
      vector={vector}
      archetype={archetype}
      data={viewData(isEmpty)}
    /> as ReactElement,
  ).replace(/<!--[\s\S]*?-->/g, "");

describe("results sign-off", () => {
  it("is the last section of the page, in both result modes", () => {
    for (const isEmpty of [false, true]) {
      const html = renderView(isEmpty);
      const signoffAt = html.indexOf("brand-signoff");
      expect(signoffAt, `sign-off missing (isEmpty=${isEmpty})`).toBeGreaterThan(-1);

      // Nothing else opens a section after it: the page ends on the signature.
      expect(html.indexOf("<section", signoffAt)).toBe(-1);

      // …and it comes after the actions it closes, not before them.
      const retakeAt = html.indexOf("شروع دوباره");
      expect(retakeAt).toBeGreaterThan(-1);
      expect(signoffAt).toBeGreaterThan(retakeAt);

      // The items above it are still there, in their existing order.
      expect(html.indexOf("پروفایل عطری شما")).toBeLessThan(retakeAt);
    }
  });

  it("carries the mark, the wordmark, the tagline and the picked line", () => {
    const html = renderView();
    const signoff = html.slice(html.indexOf("brand-signoff"));
    const closing = signoff.slice(0, signoff.indexOf("</section>"));

    // (a) the bundled mark, decorative and at ~72px — no new asset.
    expect(closing).toContain('src="/brand/fiage-mark.png"');
    expect(closing).toContain('alt=""');
    expect(closing).toContain("h-[72px] w-[72px]");

    // (b) the letterspaced wordmark.
    expect(closing).toContain("FIAGE");
    expect(closing).toContain("tracking-[0.3em]");

    // (c) the Latin tagline, explicitly LTR inside the RTL page.
    expect(closing).toContain('dir="ltr"');
    expect(closing).toContain("FIND YOUR SCENT");

    // (d) the closing sentence, byte-exact (ZWNJ-sensitive comparison).
    expect(BRAND_SIGNOFF_LINE).toBe(PICKED_LINE);
    expect(closing).toContain(`>${PICKED_LINE}</p>`);
    // It is the last paragraph of the page.
    expect(closing.lastIndexOf("<p")).toBeLessThan(closing.indexOf(PICKED_LINE));
    expect(closing.indexOf(PICKED_LINE)).toBeGreaterThan(
      closing.indexOf("FIND YOUR SCENT"),
    );
  });

  it("closes quietly: one-shot rise, nothing looping", () => {
    const html = renderView();
    const signoff = html.slice(html.indexOf("<section class=\"brand-signoff"));

    // The page's existing entrance, used once here.
    expect(signoff).toContain("quiz-rise");
    expect(signoff).not.toContain("infinite");

    // Reduced motion: `.quiz-rise` is switched off by the stylesheet.
    const CSS = read("app/globals.css");
    const reducedAt = CSS.indexOf(
      "@media (prefers-reduced-motion: reduce) {\n  .quiz-rise {",
    );
    expect(reducedAt, "no reduced-motion rule for quiz-rise").toBeGreaterThan(-1);
    expect(CSS.slice(reducedAt)).toContain("animation: none;");
  });

  it("leaves the share and retake actions exactly as they were", () => {
    const html = renderView();
    const signoffAt = html.indexOf("brand-signoff");
    const actions = html.slice(0, signoffAt);

    // The retake link keeps its own class contract and target.
    expect(actions).toContain('href="/quiz"');
    expect(actions).toContain(
      'class="btn-secondary flex min-h-12 flex-1 items-center justify-center px-5 text-sm text-muted hover:text-foreground"',
    );
    expect(actions).toContain("شروع دوباره");
    // The share action is still the shipped component, above the signature.
    expect(read("components/results/ResultsView.tsx")).toContain(
      "<ShareResultButton />",
    );
  });

  it("stays a /result surface: the widget does not mount it", () => {
    // The widget's result screen is merchant-site chrome, out of scope.
    expect(WIDGET_SOURCE).not.toContain("BrandSignoff");
    expect(WIDGET_SOURCE).not.toContain("brand-signoff");
  });
});
