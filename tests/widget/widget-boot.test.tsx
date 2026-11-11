import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import WidgetApp from "@/components/widget/WidgetApp";
import WidgetBoot from "@/components/widget/WidgetBoot";

/**
 * Batch 45 — the widget's boot state.
 *
 * The boot is WidgetApp's INITIAL view (phase "validating"), replaced in the
 * same commit that lands the store config — never held on screen to satisfy a
 * minimum display time. Its motion is loading-scoped, small-area and
 * transform/opacity only, and it is fully static under reduced motion.
 */

const WIDGET_APP = readFileSync(
  new URL("../../components/widget/WidgetApp.tsx", import.meta.url),
  "utf8",
);
const BOOT = readFileSync(
  new URL("../../components/widget/WidgetBoot.tsx", import.meta.url),
  "utf8",
);
const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

const bootCssStart = CSS.indexOf("Batch 45 — the widget boot state");
const bootCssEnd = CSS.indexOf("Batch 45 — one-shot image entrance");
const BOOT_CSS = CSS.slice(bootCssStart, bootCssEnd);

const html = renderToStaticMarkup(<WidgetApp storeId="store-A" />).replace(
  /<!--[\s\S]*?-->/g,
  "",
);

describe("widget boot — the initial view", () => {
  it("is what the widget renders before the store config resolves", () => {
    // The old neutral loading notice is gone; the branded boot is the first paint.
    expect(html).not.toContain("در حال بارگذاری…");

    expect(html).toContain("FIAGE");
    expect(html).toContain("FIND YOUR SCENT");
    expect(html).toContain("در حال آماده‌سازی آزمون…");
    expect(html).toContain("widget-boot-star");
    expect(html).toContain("widget-boot-shimmer");
    expect(html).toContain("✦");
    expect(html).toContain('aria-busy="true"');
    // Three skeleton bars: static geometry, opacity-only pulse.
    expect(html.match(/widget-boot-bar/g) ?? []).toHaveLength(3);
  });

  it("is the component's own render, not something injected later", () => {
    // Same markup from the component and from the widget's initial phase.
    const direct = renderToStaticMarkup(<WidgetBoot />);
    const start = direct.indexOf("widget-boot");

    expect(start).toBeGreaterThan(-1);
    expect(html).toContain(direct.slice(direct.indexOf(">"), direct.indexOf(">") + 40));
  });

  it("has no minimum display time and no timer to fake one", () => {
    // The boot is chosen by the phase, not by a delay.
    expect(WIDGET_APP).toContain('if (state.phase === "validating")');
    expect(WIDGET_APP).toContain("<WidgetBoot />");
    expect(WIDGET_APP.match(/<WidgetBoot/g) ?? []).toHaveLength(1);

    // The one occurrence is inside the validating branch.
    expect(WIDGET_APP.indexOf("<WidgetBoot />")).toBeGreaterThan(
      WIDGET_APP.indexOf('state.phase === "validating"'),
    );

    // Nothing in the widget schedules the hand-off.
    expect(WIDGET_APP).not.toContain("setTimeout");
    expect(WIDGET_APP).not.toContain("setInterval");
    // The config effect replaces validating → intro in the same commit.
    expect(WIDGET_APP).toContain('phase: "intro", store: data.config');
    // And the boot copy exists in exactly one place.
    expect(WIDGET_APP).not.toContain("در حال آماده‌سازی آزمون…");
    expect(BOOT).toContain("در حال آماده‌سازی آزمون…");
  });
});

describe("widget boot — motion stays inside the red lines", () => {
  it("moves only transform and opacity", () => {
    expect(BOOT_CSS.length).toBeGreaterThan(0);

    // transform + opacity are the whole vocabulary.
    expect(BOOT_CSS).toContain("transform: scale(0.88)");
    expect(BOOT_CSS).toContain("transform: translateX");
    expect(BOOT_CSS).toContain("opacity");

    for (const forbidden of [
      "filter:",
      "blur(",
      "backdrop-filter",
      "background-position",
      "box-shadow",
    ]) {
      expect(BOOT_CSS, `boot CSS must not animate ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it("keeps the approved timings", () => {
    expect(BOOT_CSS).toContain("widget-boot-breathe 1.8s ease-in-out infinite");
    expect(BOOT_CSS).toContain("widget-boot-shimmer 1.6s ease-in-out infinite");
    expect(BOOT_CSS).toContain("widget-boot-fade 280ms ease-out both");
  });

  it("renders static under reduced motion", () => {
    const media = BOOT_CSS.slice(BOOT_CSS.indexOf("@media (prefers-reduced-motion: reduce)"));

    for (const selector of [
      ".widget-boot,",
      ".widget-boot-star,",
      ".widget-boot-shimmer,",
      ".widget-boot-bar",
    ]) {
      expect(media).toContain(selector);
    }
    expect(media).toContain("animation: none;");
  });
});
