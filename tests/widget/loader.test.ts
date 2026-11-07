import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WIDGET_VISIBLE_MESSAGE } from "@/lib/widget/visibility";

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

  it("trusts the origin only together with this loader's own iframe (§8)", () => {
    // Origin + message type are public; frame identity is not forgeable from
    // another same-origin iframe on the same merchant page.
    expect(LOADER).toContain("event.source !== iframe.contentWindow");
  });

  it("ignores, rather than clamps, resize heights outside [200, 5000]", () => {
    expect(LOADER).toContain("var MIN_HEIGHT = 200;");
    expect(LOADER).toContain("var MAX_HEIGHT = 5000;");
    expect(LOADER).toContain("height < MIN_HEIGHT || height > MAX_HEIGHT");
    expect(LOADER).not.toContain("Math.min(");
  });

  it("replaces a frame that never loads with a loader-rendered down state", () => {
    expect(LOADER).toContain("var LOAD_TIMEOUT_MS = 12000;");
    expect(LOADER).toContain("setTimeout(showFallback, LOAD_TIMEOUT_MS)");
    expect(LOADER).toContain("آزمون عطر فیاژ در دسترس نیست");
    expect(LOADER).toContain("تلاش دوباره");
    expect(LOADER).toContain("retry.href = widgetUrl;");
    expect(LOADER).toContain('retry.target = "_blank";');
    expect(LOADER).toContain('retry.rel = "noopener";');
    // Inline styles only: nothing the host page's CSS can override.
    expect(LOADER).toContain('fallback.style.fontFamily = "sans-serif";');
    expect(LOADER).not.toContain("classList");
    // The first successful load cancels the watchdog for good.
    expect(LOADER).toContain("clearWatchdog();\n    loaded = true;");
  });

  it("fails gracefully (console.warn, no throw) on bad configuration", () => {
    expect(LOADER).toContain("console.warn");
    expect(LOADER).toContain("function fail(");
  });
});

describe("public/widget.js — WIDGET_VIEWED is an impression, not a load", () => {
  it("posts the visibility message with the store id the loader was given", () => {
    // The same literal the widget listens for (lib/widget/visibility.ts).
    expect(WIDGET_VISIBLE_MESSAGE).toBe("fiage-widget:visible");
    expect(LOADER).toContain('{ type: "fiage-widget:visible", storeId: storeId }');
  });

  it("observes the mount point and stops on the first intersection", () => {
    expect(LOADER).toContain('typeof IntersectionObserver === "function"');
    expect(LOADER).toContain("observer.observe(mount);");
    expect(LOADER).toContain("entries[index].isIntersecting");
    expect(LOADER).toContain("observer.disconnect();");
  });

  it("falls back to today's fire-on-load floor when no observer exists", () => {
    expect(LOADER).toMatch(/\} else \{\n      visible = true;/);
    expect(LOADER).toContain('iframe.addEventListener("load"');
    // At most one delivery, and never into a document that is not ready yet.
    expect(LOADER).toContain("if (!visible || !loaded || delivered)");
    expect(LOADER).toContain("delivered = true;");
  });

  it("cannot throw out of the visibility bridge", () => {
    expect(LOADER).toContain("void error;\n    visible = true;");
    expect(LOADER).toContain("if (iframe.contentWindow)");
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
    // Neutral config-load copy: no quiz exists yet at this phase.
    expect(html).toContain("در حال بارگذاری…");
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
