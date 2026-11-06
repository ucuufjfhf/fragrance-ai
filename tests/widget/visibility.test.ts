import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  WIDGET_VISIBLE_MESSAGE,
  isEmbeddedWidget,
  isWidgetVisibleMessage,
  shouldFireFromMessage,
  shouldFireWidgetViewedOnMount,
} from "@/lib/widget/visibility";

/**
 * WIDGET_VIEWED must mean "a shopper saw it", not "the iframe mounted".
 *
 * The decision lives in pure helpers so the branch can be pinned without a
 * browser (the suite is SSR-only, like the other UI tests): top-level visits
 * keep firing on config load, embedded widgets wait for the loader's first
 * visibility message and never count a mount, a wrong store or garbage.
 */

const LOADER = readFileSync("public/widget.js", "utf8");
const WIDGET_APP = readFileSync("components/widget/WidgetApp.tsx", "utf8");

function topLevelWindow() {
  const win = {} as { top: unknown };

  win.top = win;

  return win;
}

const EMBEDDED_WINDOW = { top: {} };

describe("isEmbeddedWidget — top-level vs iframe", () => {
  it("is false for a direct visit (window.top is the window itself)", () => {
    expect(isEmbeddedWidget(topLevelWindow())).toBe(false);
    expect(isEmbeddedWidget(null)).toBe(false);
    expect(isEmbeddedWidget(undefined)).toBe(false);
  });

  it("is true inside a parent document", () => {
    expect(isEmbeddedWidget(EMBEDDED_WINDOW)).toBe(true);
  });
});

describe("WIDGET_VIEWED — when does a mount count?", () => {
  it("embedded: a mount alone never fires (no visibility message yet)", () => {
    expect(shouldFireWidgetViewedOnMount(true)).toBe(false);
  });

  it("top-level: the widget is the page, so config load still fires", () => {
    expect(shouldFireWidgetViewedOnMount(false)).toBe(true);
  });
});

describe("WIDGET_VIEWED — what the loader's message may trigger", () => {
  const visible = { type: WIDGET_VISIBLE_MESSAGE, storeId: "store-A" };

  it("accepts this store's visibility message", () => {
    expect(isWidgetVisibleMessage(visible, "store-A")).toBe(true);
    expect(shouldFireFromMessage(visible, "store-A", false)).toBe(true);
  });

  it("ignores a message naming another store", () => {
    expect(isWidgetVisibleMessage(visible, "store-B")).toBe(false);
    expect(shouldFireFromMessage({ type: WIDGET_VISIBLE_MESSAGE, storeId: "store-B" }, "store-A", false)).toBe(false);
  });

  it("ignores malformed messages", () => {
    for (const data of [null, undefined, "fiage-widget:visible", 42, {}, { type: WIDGET_VISIBLE_MESSAGE }, { storeId: "store-A" }, { type: "fragrance-ai:resize", storeId: "store-A", height: 400 }]) {
      expect(isWidgetVisibleMessage(data, "store-A")).toBe(false);
      expect(shouldFireFromMessage(data, "store-A", false)).toBe(false);
    }
  });

  it("never fires twice, even for a duplicate message", () => {
    expect(shouldFireFromMessage(visible, "store-A", true)).toBe(false);
  });
});

describe("loader and widget share one contract", () => {
  it("the shipped loader posts the documented type and echo store id", () => {
    expect(LOADER).toContain(`type: "${WIDGET_VISIBLE_MESSAGE}"`);
    expect(LOADER).toContain("storeId: storeId");
  });

  it("the widget only listens for the parent's message, and for its own store", () => {
    expect(WIDGET_APP).toContain("event.source !== window.parent");
    expect(WIDGET_APP).toContain("shouldFireFromMessage(event.data, storeId, viewedRef.current)");
    expect(WIDGET_APP).toContain("shouldFireWidgetViewedOnMount(isEmbeddedWidget(window))");
    expect(WIDGET_APP).toContain("trackWidgetViewed(storeId)");
    // The listener is removed both on delivery and on unmount.
    expect(WIDGET_APP).toContain('window.removeEventListener("message", onMessage)');
  });
});
