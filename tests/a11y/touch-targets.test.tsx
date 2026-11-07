import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";

/**
 * Touch-target floor for the plain-text actions (buyer audit round 6).
 *
 * `.btn-tertiary` defined no size at all, so «رد شدن» / «شروع دوباره» /
 * «قبلی» rendered at the font's own ~20px in the mobile quiz flow. The header,
 * footer and widget-chrome text links were the same. The fix is class-level,
 * so this suite pins the classes rather than individual call sites: the
 * tertiary class owns 44px, and every text link carries a 40px minimum height.
 */

const read = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const anchors = (html: string): string[] => html.match(/<a\b[^>]*>/g) ?? [];

describe(".btn-tertiary", () => {
  it("owns a 44px hit area and horizontal padding in the stylesheet", () => {
    const css = read("app/globals.css");
    const start = css.indexOf(".btn-tertiary {");
    const block = css.slice(start, css.indexOf("}", start));

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("display: inline-flex");
    expect(block).toContain("min-height: 44px");
    expect(block).toContain("padding-inline");
  });
});

describe("header and footer text links", () => {
  it("gives every header link a 40px-tall target", () => {
    const links = anchors(renderToStaticMarkup(<SiteHeader />));

    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link).toContain("min-h-10");
    }
  });

  it("gives every footer link a 40px-tall target, merchant paths included", () => {
    const html = renderToStaticMarkup(<SiteFooter />);
    const links = anchors(html);

    expect(links.length).toBeGreaterThanOrEqual(6);
    for (const link of links) {
      expect(link).toContain("min-h-10");
    }
    // The merchant entry points are footer links like any other.
    expect(html).toContain('href="/for-stores"');
    expect(html).toContain('href="/data-policy"');
  });
});

describe("widget chrome links", () => {
  it("gives both public links a 40px-tall target", () => {
    const source = read("components/widget/WidgetChrome.tsx");
    const footer = source.slice(source.indexOf("export function WidgetChromeFooter"));

    expect(footer.match(/min-h-10/g) ?? []).toHaveLength(2);
    expect(footer).toContain('href="https://fiage.ir"');
    expect(footer).toContain('href="https://fiage.ir/data-policy"');
  });
});
