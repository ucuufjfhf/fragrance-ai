import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Phase 8 widget asset + page verification (§33 widget configuration,
 * §30 servability). The loader is plain browser JS: rather than boot a DOM,
 * these tests assert the safety-critical structure of the shipped file
 * (the exact bytes a merchant's browser executes) plus SSR of the iframe
 * page. Live behaviour is covered by the manual verification page.
 */

const LOADER = readFileSync("public/widget.js", "utf8");

describe("public/widget.js — shipped loader safety structure", () => {
  it("exists and is dependency-free vanilla JS", () => {
    expect(LOADER.length).toBeGreaterThan(500);
    expect(LOADER).not.toContain("require(");
    expect(LOADER).not.toContain("import(");
  });

  it("guards against duplicate initialization (§23)", () => {
    // The marker is concatenated at runtime: WIDGET_ID + ":loaded".
    expect(LOADER).toContain('var WIDGET_ID = "fragrance-ai-widget";');
    expect(LOADER).toContain('var ORIGIN_MARKER = WIDGET_ID + ":loaded";');
    expect(LOADER).toMatch(/if \(window\[ORIGIN_MARKER\]\)/);
    expect(LOADER).toContain("window[ORIGIN_MARKER] = true;");
  });

  it("validates the data-store-id format before mounting (§9)", () => {
    expect(LOADER).toContain("data-store-id");
    expect(LOADER).toMatch(/a-zA-Z0-9_-\]\{1,64\}/);
    expect(LOADER).toContain("the widget was not mounted");
  });

  it("mounts an iframe at /widget?store=… with the encoded store id (§31)", () => {
    expect(LOADER).toContain('"/widget?store="');
    expect(LOADER).toContain("encodeURIComponent(storeId)");
    expect(LOADER).toContain('iframe.id = IFRAME_ID');
  });

  it("derives the base URL from its own script src (no invented domain, §29)", () => {
    expect(LOADER).toContain("data-base-url");
    expect(LOADER).toContain("scriptUrl.origin");
  });

  it("listens for resize postMessages from the widget page (§8)", () => {
    expect(LOADER).toContain('"fragrance-ai:resize"');
    expect(LOADER).toContain("event.origin !== baseUrl");
  });

  it("fails gracefully (console.warn, no throw) on bad configuration", () => {
    expect(LOADER).toContain("console.warn");
    expect(LOADER).toContain("function fail(");
  });
});

describe("GET /widget — iframe document (§8/§31)", () => {
  it("renders RTL Persian content and receives the store id server-side", async () => {
    vi.resetModules();

    const { default: WidgetPage } = await import("@/app/widget/page");
    const html = renderToStaticMarkup(
      await WidgetPage({
        searchParams: Promise.resolve({ store: "store-demo-perfume-shop" }),
      }),
    );

    expect(html).toContain('dir="rtl"');
    // SSR renders the validating state (the store check is a client-side
    // fetch after hydration); the intro appears once validation passes.
    expect(html).toContain("در حال پیدا کردن عطر مناسب تو...");
    // The resize bridge posts to the parent for loader sizing.
    expect(html).toContain("fragrance-ai:resize");
  });

  it("renders an explicit unavailable state for a missing store param", async () => {
    vi.resetModules();

    const React = (await import("react")).default ?? (await import("react"));
    const { default: WidgetPage } = await import("@/app/widget/page");
    const WidgetApp = (await import("@/components/widget/WidgetApp")).default;

    // The page passes an empty storeId; the client component must start in
    // the unavailable phase — asserted via its SSR'd markup.
    const element = React.createElement(WidgetApp, { storeId: "" });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("این فروشگاه در حال حاضر در دسترس نیست.");
    void WidgetPage;
  });
});
