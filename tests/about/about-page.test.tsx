import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AboutPage, { metadata } from "@/app/about/page";
import SiteFooter from "@/components/site/SiteFooter";

/** The contact address — must match the mailto in the page and the footer. */
const CONTACT_EMAIL = "majidemoon0@gmail.com";

/**
 * Server-side render smoke tests for the trust infrastructure (same
 * convention as the other UI tests: react-dom/server, no jsdom, no browser).
 * Navigation and the mailto CTA are covered by the browser gate.
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

describe("about page", () => {
  it("has the Persian page title", () => {
    expect(metadata.title).toContain("درباره‌ی فیاژ");
  });

  it("tells the founder story in his voice, without invented details", () => {
    const html = render(<AboutPage />);

    expect(html).toContain("دستیار شخصی رایگان عطر شماست");
    expect(html).toContain("دو سال استفاده از عطرهای مختلف");
    expect(html).toContain("نشانه‌ی خودشونه");
    expect(html).toContain("بدون ثبت‌نام");
  });

  it("explains what FIAGE does and offers the contact CTA", () => {
    const html = render(<AboutPage />);

    expect(html).toContain("۱۰ سوال");
    expect(html).toContain("فیاژ چطور کار می‌کنه؟");
    expect(html).toContain("۳ عطر منتخب");
    expect(html).toContain(`mailto:${CONTACT_EMAIL}`);
    expect(html).toContain("ایمیل بزنید");
    expect(html).toContain("تماس با ما");
    expect(html).toContain('href="/quiz"');
  });
});

describe("site footer trust links", () => {
  it("links /about and the contact email alongside the existing links", () => {
    const html = render(<SiteFooter />);

    expect(html).toContain('href="/about"');
    expect(html).toContain("درباره‌ی فیاژ");
    expect(html).toContain(`mailto:${CONTACT_EMAIL}`);
    expect(html).toContain("تماس");
    // Existing links and the protected tagline are untouched.
    expect(html).toContain("آزمون سلیقه");
    expect(html).toContain("چطور کار می‌کند");
    expect(html).toContain("انتخاب عطر بر اساس پروفایل تو");
  });
});
