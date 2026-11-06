import { describe, expect, it } from "vitest";

import {
  WIDGET_UTM_MEDIUM,
  WIDGET_UTM_SOURCE,
  withWidgetAttribution,
} from "@/lib/widget/attribution";

/**
 * The outbound attribution contract.
 *
 * A widget click leaves for the merchant's own site, so these tags are the only
 * proof the visit came from here. The rules are intentionally conservative: the
 * merchant's own tagging wins, their URLs are never rewritten beyond the three
 * parameters, and nothing unparseable is touched at all.
 */

const STORE = "store-A";
const TAIL = `utm_source=${WIDGET_UTM_SOURCE}&utm_medium=${WIDGET_UTM_MEDIUM}&utm_campaign=${STORE}`;

describe("withWidgetAttribution — appending", () => {
  it("appends the three tags to a plain product URL", () => {
    expect(withWidgetAttribution("https://shop.example/p/1", STORE)).toBe(
      `https://shop.example/p/1?${TAIL}`,
    );
  });

  it("keeps an existing query string and appends after it", () => {
    expect(withWidgetAttribution("https://shop.example/p/1?color=red&size=ml", STORE)).toBe(
      `https://shop.example/p/1?color=red&size=ml&${TAIL}`,
    );
  });

  it("keeps a #hash last, after the appended parameters", () => {
    expect(withWidgetAttribution("https://shop.example/p/1?color=red#reviews", STORE)).toBe(
      `https://shop.example/p/1?color=red&${TAIL}#reviews`,
    );
    expect(withWidgetAttribution("https://shop.example/p/1#reviews", STORE)).toBe(
      `https://shop.example/p/1?${TAIL}#reviews`,
    );
  });

  it("does not normalise the rest of the URL (no trailing slash appears)", () => {
    // `new URL(...).toString()` would turn this into `https://shop.example/`.
    expect(withWidgetAttribution("https://shop.example", STORE)).toBe(
      `https://shop.example?${TAIL}`,
    );
  });

  it("handles a URL that ends in a bare `?` or `&`", () => {
    expect(withWidgetAttribution("https://shop.example/p?", STORE)).toBe(
      `https://shop.example/p?${TAIL}`,
    );
    expect(withWidgetAttribution("https://shop.example/p?color=red&", STORE)).toBe(
      `https://shop.example/p?color=red&${TAIL}`,
    );
  });
});

describe("withWidgetAttribution — never overriding", () => {
  it("leaves a merchant's own utm_source alone and only fills the gaps", () => {
    expect(withWidgetAttribution("https://shop.example/p/1?utm_source=newsletter", STORE)).toBe(
      `https://shop.example/p/1?utm_source=newsletter&utm_medium=${WIDGET_UTM_MEDIUM}&utm_campaign=${STORE}`,
    );
  });

  it("leaves a fully tagged URL byte-identical", () => {
    const url = `https://shop.example/p/1?${TAIL}`;

    expect(withWidgetAttribution(url, STORE)).toBe(url);
  });

  it("is idempotent", () => {
    const once = withWidgetAttribution("https://shop.example/p/1", STORE);

    expect(withWidgetAttribution(once, STORE)).toBe(once);
  });
});

describe("withWidgetAttribution — untouched inputs", () => {
  it("returns non-http(s) URLs unchanged", () => {
    for (const url of [
      "mailto:shop@example.com",
      "javascript:alert(1)",
      "tel:+981234567",
      "ftp://shop.example/p/1",
    ]) {
      expect(withWidgetAttribution(url, STORE)).toBe(url);
    }
  });

  it("returns relative and malformed URLs unchanged", () => {
    for (const url of ["/p/1", "shop.example/p/1", "https://", "not a url", "  "]) {
      expect(withWidgetAttribution(url, STORE)).toBe(url);
    }
  });

  it("returns the URL unchanged when there is no store id to attribute to", () => {
    expect(withWidgetAttribution("https://shop.example/p/1", "")).toBe("https://shop.example/p/1");
  });
});
