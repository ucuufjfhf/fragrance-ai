/**
 * Outbound attribution for widget CTAs.
 *
 * A click from the widget lands on the merchant's own site, where this app has
 * no visibility. Tagging the link is the cheapest honest proof that the visit
 * came from the widget — the merchant reads it in their own analytics with no
 * integration on either side. Pure and synchronous: no DB, no network, so both
 * the browser and tests can use it, and the STORED `productUrl` is never
 * mutated — attribution happens at render time only.
 *
 * Rules (each one is pinned by tests/widget/attribution.test.ts):
 *  - only absolute http(s) URLs are modified; anything else is returned as-is;
 *  - existing query parameters survive, and an existing `#hash` stays last;
 *  - a parameter already present is never duplicated or overwritten — the
 *    merchant's own tagging wins;
 *  - an empty store id adds nothing, and unparseable input comes back
 *    byte-identical.
 */

export const WIDGET_UTM_SOURCE = "fiage_widget";
export const WIDGET_UTM_MEDIUM = "quiz";

/**
 * Returns `url` with `utm_source`/`utm_medium`/`utm_campaign` appended for the
 * given store. Idempotent: applying it twice changes nothing the second time.
 *
 * The result is rebuilt from the ORIGINAL string rather than from
 * `URL.toString()`, because the URL parser normalises (`https://shop.example`
 * would gain a trailing slash, and existing parts could be re-encoded). Only the
 * appended parameters may differ from the input.
 */
export function withWidgetAttribution(url: string, storeId: string): string {
  if (typeof url !== "string" || url === "" || typeof storeId !== "string" || storeId === "") {
    return url;
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    // Not an absolute URL (relative path, malformed string) — leave it alone.
    return url;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return url;
  }

  const params: Array<[string, string]> = [
    ["utm_source", WIDGET_UTM_SOURCE],
    ["utm_medium", WIDGET_UTM_MEDIUM],
    ["utm_campaign", storeId],
  ];

  const missing = params.filter(([key]) => !parsed.searchParams.has(key));

  if (missing.length === 0) {
    return url;
  }

  const hashIndex = url.indexOf("#");
  const hash = hashIndex === -1 ? "" : url.slice(hashIndex);
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const separator = base.includes("?")
    ? base.endsWith("?") || base.endsWith("&")
      ? ""
      : "&"
    : "?";
  const query = missing.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");

  return `${base}${separator}${query}${hash}`;
}
