import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import WidgetStoreHeader from "@/components/widget/WidgetStoreHeader";

/**
 * Store branding in the embedded widget — static-markup tests.
 *
 * The header lives inside the widget's iframe document, which SSRs the
 * validation notice and only receives store identity after the client fetch,
 * so the component is rendered directly here. Same project convention as the
 * other UI suites: `react-dom/server`, no jsdom, no browser.
 */

const NAME = "فروشگاه نمونه";

describe("WidgetStoreHeader — store identity strip", () => {
  it("renders the logo and the store name", () => {
    const html = renderToStaticMarkup(
      <WidgetStoreHeader name={NAME} logoUrl="https://shop.example/logo.png" />,
    );

    expect(html).toContain(`alt="${NAME}"`);
    expect(html).toContain('src="https://shop.example/logo.png"');
    expect(html).toContain(NAME);
  });

  it("keeps the logo at 32px with object-contain (no distortion)", () => {
    const html = renderToStaticMarkup(
      <WidgetStoreHeader name={NAME} logoUrl="https://shop.example/logo.png" />,
    );

    expect(html).toContain('height="32"');
    expect(html).toContain("h-8");
    expect(html).toContain("object-contain");
    // Never upscaled wider than the row: capped and shrink-safe.
    expect(html).toContain("max-w-28");
    expect(html).toContain("shrink-0");
  });

  it("renders the name alone when the store has no logo", () => {
    const html = renderToStaticMarkup(<WidgetStoreHeader name={NAME} logoUrl={null} />);

    expect(html).not.toContain("<img");
    expect(html).toContain(NAME);
  });

  it("cannot overflow at 390px: the name shrinks and truncates", () => {
    const html = renderToStaticMarkup(
      <WidgetStoreHeader
        name={"فروشگاه بسیار طولانی عطر و ادکلن با نام تجاری unusually-long-brand-name"}
        logoUrl="https://shop.example/logo.png"
      />,
    );

    expect(html).toContain("min-w-0");
    expect(html).toContain("truncate");
  });
});
