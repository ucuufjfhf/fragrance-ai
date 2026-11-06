import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import WidgetApp from "@/components/widget/WidgetApp";

/**
 * The widget's privacy link.
 *
 * It lives in the widget shell, so it is present on every phase — including the
 * very first server-rendered frame (`validating`), before any store data has
 * arrived. That is exactly the frame rendered here: no fetch, no effects.
 */

describe("widget privacy link", () => {
  const html = renderToStaticMarkup(<WidgetApp storeId="store-A" />);

  it("links to /data-policy and opens in a new tab", () => {
    expect(html).toContain('href="/data-policy"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("labels the link in Persian, quietly", () => {
    expect(html).toContain("حریم خصوصی و داده‌ها");
    expect(html).toContain("text-xs");
  });

  it("keeps the link inside the widget shell", () => {
    const shell = html.indexOf("data-widget-shell");

    expect(shell).toBeGreaterThan(-1);
    expect(html.indexOf('href="/data-policy"')).toBeGreaterThan(shell);
  });
});
