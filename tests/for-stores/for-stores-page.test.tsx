import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AboutPage from "@/app/about/page";
import ForStoresPage, { metadata } from "@/app/for-stores/page";
import SiteFooter from "@/components/site/SiteFooter";
import {
  WIDGET_DEMO_STORE_ID,
  WIDGET_LOADER_ATTRIBUTES,
  WIDGET_LOADER_PATH,
} from "@/lib/for-stores/content";

/**
 * The merchant-facing /for-stores page, rendered statically (the repo's UI-test
 * convention: react-dom/server, no jsdom, no browser).
 *
 * These assertions are about honesty and about the demo being real:
 *  - the live demo is the SHIPPED loader with the demo store's id, not a mock;
 *  - the page promises no price, trial duration, uptime/SLA or backup/retention
 *    the code does not implement;
 *  - the contact address is the one already public on /about.
 *
 * The browser gate (a real journey at 390 px and desktop width) is separate.
 */

function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

/** Visible copy only: tags stripped, so attribute values never leak in. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ");
}

const html = render(<ForStoresPage />);

describe("for-stores page — the offer, in code-backed terms", () => {
  it("has the Persian title and heading", () => {
    expect(metadata.title).toContain("برای فروشگاه‌ها");
    expect(html).toContain("برای فروشگاه‌ها");
    expect(html).toContain("ویجت عطر، روی موجودی خودتان");
  });

  it("explains installation with the shipped one-line loader", () => {
    // The snippet is the loader's documented install line (public/widget.js),
    // with a placeholder id — no production host is invented on the page.
    expect(html).toContain("widget.js");
    expect(html).toContain("data-store-id");
    expect(html).toContain("STORE_ID");
    expect(html).toContain("YOUR-DOMAIN");
  });

  it("says the recommendations come from the merchant's own catalog", () => {
    expect(html).toContain("موجودی خودتان");
    expect(html).toContain("کاتالوگ");
    expect(html).toContain("فهرست عمومی");
  });
});

describe("for-stores page — the demo is the real widget", () => {
  it("embeds the shipped loader at the demo store, same origin", () => {
    // Exactly what a merchant pastes: <script src="/widget.js" data-store-id="…">.
    // It is injected after mount (a server-rendered copy is destroyed by React
    // hydration — the loader's mount div is an unknown child), so the SSR panel
    // carries the same attributes the client applies to the real script tag.
    expect(WIDGET_LOADER_ATTRIBUTES).toEqual({
      src: "/widget.js",
      "data-store-id": "store-demo-perfume-shop",
    });
    expect(html).toContain(`data-widget-loader="${WIDGET_LOADER_PATH}"`);
    expect(html).toContain(`data-store-id="${WIDGET_DEMO_STORE_ID}"`);
    // Inside the demo panel, not floating elsewhere on the page.
    const panel = html.indexOf("data-for-stores-demo");
    expect(panel).toBeGreaterThan(-1);
    expect(html.indexOf('data-store-id="store-demo-perfume-shop"')).toBeGreaterThan(panel);
    // The host the loader's iframe mounts into.
    expect(html).toContain("data-widget-demo-host");
  });

  it("names the demo store and does not pretend it is a customer's store", () => {
    expect(html).toContain("عطرسرای نمونه");
    expect(html).toContain("فروشگاه نمایشی");
  });
});

describe("for-stores page — promises the code cannot keep are absent", () => {
  const copy = textOf(html);

  it("names no price or currency", () => {
    expect(copy).not.toMatch(/تومان|ریال|دلار|درهم|هزار تومان/);
    expect(copy).not.toMatch(/\d[\d,.]*\s*(تومان|ریال)/);
  });

  it("states no trial duration and no free-price claim", () => {
    // No «۱۴ روز» / «۳ ماه» style promise in Latin or Persian digits.
    expect(copy).not.toMatch(/(\d+|[۰-۹]+)\s*(روز|ماه|هفته|ساعت|سال)/);
    expect(copy).not.toMatch(/رایگان|تخفیف|تخفیف ویژه/);
  });

  it("claims no uptime, SLA, backup or retention guarantee", () => {
    expect(copy).not.toMatch(/SLA|آپ‌تایم|آپتایم|uptime|پشتیبان|backup|۹۹[.٫]۹|99[.٫]9/i);
    expect(copy).not.toMatch(/۲۴\/۷|24\/7|همیشه در دسترس/);
  });

  it("says plainly that clicks are tracked and sales are not", () => {
    expect(html).toContain("utm_source=fiage_widget");
    expect(html).toContain("utm_medium=quiz");
    expect(copy).toContain("فروش اندازه‌گیری نمی‌شود");
    expect(copy).toContain("پیکسل");
  });

  it("describes only the report sections that actually render", () => {
    expect(copy).toContain("بازدید ویجت");
    expect(copy).toContain("شروع آزمون");
    expect(copy).toContain("تکمیل آزمون");
    expect(copy).toContain("نرخ کلیک");
    // The report page renders no revenue/sales figure — nor may this page.
    expect(copy).not.toMatch(/درآمد فروش|رقم فروش/);
    expect(copy).toContain("نه درآمد");
  });

  it("keeps the data facts and links the full policy", () => {
    expect(copy).toContain("نام، شماره تلفن، ایمیل و اطلاعات پرداخت");
    expect(copy).toContain("توکن نشست ناشناس");
    expect(copy).toContain("گزارش تجمیعی خودش");
    expect(copy).toContain("به‌صورت درخواستی");
    expect(html).toContain('href="/data-policy"');
  });

  it("keeps the new result-features sentence inside the same rules (batch 47)", () => {
    const start = copy.indexOf("در نتیجهٔ آزمون");
    expect(start).toBeGreaterThan(-1);

    const sentence = copy.slice(start, copy.indexOf(".", start) + 1);

    // The sentence may describe shipped features only: no price, trial,
    // uptime/SLA or duration claim may ride along with it.
    expect(sentence).not.toMatch(/تومان|ریال|دلار|درهم|رایگان|تخفیف/);
    expect(sentence).not.toMatch(/SLA|آپ‌تایم|آپتایم|uptime|پشتیبان|backup|۲۴\/۷|24\/7/i);
    expect(sentence).not.toMatch(/(\d+|[۰-۹]+)\s*(روز|ماه|هفته|ساعت|سال)/);
  });
});

describe("for-stores page — contact and footer", () => {
  it("uses exactly the address already public on /about", () => {
    const about = render(<AboutPage />);
    const aboutMailto = about.match(/mailto:([^"]+)/)?.[1];
    const forStoresMailto = html.match(/mailto:([^"]+)/)?.[1];

    expect(aboutMailto).toBe("majid@fiage.ir");
    expect(forStoresMailto).toBe(aboutMailto);
  });

  it("links the page from the footer with the right href", () => {
    const footer = render(<SiteFooter />);

    expect(footer).toContain('href="/for-stores"');
    expect(footer).toContain("برای فروشگاه‌ها");
  });
});

describe("for-stores page — the widget result features it now ships", () => {
  // Batch 47: the widget result ships the five-axis scent radar (batch 41) and
  // the head-to-head comparison of two of the top three (batch 40). The live
  // demo on this page renders that widget, so this sentence describes what a
  // merchant already sees rather than a roadmap.
  const PARAGRAPH =
    "در نتیجهٔ آزمون، مشتری نمودار رایحهٔ خودش را روی پنج محور می‌بیند و می‌تواند هر دو تا از سه پیشنهاد اول را رودررو مقایسه کند — همه داخل همان ویجت، روی موجودی شما.";

  it("renders the radar/head-to-head sentence verbatim", () => {
    expect(textOf(html)).toContain(PARAGRAPH);
  });

  it("sits directly after the demo intro and before the demo box", () => {
    const text = textOf(html);
    const intro = text.indexOf("یک‌بار تا آخر بروید و نتیجه را ببینید.");
    const paragraph = text.indexOf(PARAGRAPH);

    expect(intro).toBeGreaterThan(-1);
    expect(paragraph).toBeGreaterThan(intro);
    // The demo panel follows it: the copy introduces the live widget.
    expect(paragraph).toBeLessThan(html.indexOf("data-for-stores-demo"));
  });
});
