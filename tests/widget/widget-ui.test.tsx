import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { INTERSTITIAL_LINES } from "@/components/quiz/AnalysisInterstitial";
import WidgetAnalysis from "@/components/widget/WidgetAnalysis";
import WidgetRecommendationCard from "@/components/widget/WidgetRecommendationCard";
import type { WidgetRecommendation } from "@/lib/widget/contract";

/**
 * Gilded Editorial widget chrome — static-markup tests.
 *
 * The widget lives inside an iframe and reaches these screens through client
 * state, so the components are rendered directly here. Same project convention
 * as the other UI suites: `react-dom/server`, no jsdom, no browser. The live
 * journey (intro → 10 questions → analysis → result) is verified in the demo
 * harness; these lock the contracts that are cheap to guard: the performed
 * analysis reuses the shared timing/microcopy and mounts every crossfade slide,
 * and the card keeps its rank, match bar, explanation, CTA and fallbacks.
 */

const MATCHES: readonly WidgetRecommendation[] = [
  {
    perfumeId: "p-1",
    rank: 1,
    name: "عطر یک",
    brand: "برند یک",
    productUrl: "https://shop.example/p/1",
    imageUrl: "https://shop.example/p/1.jpg",
    price: 1_250_000,
    matchPercent: 91.4,
  },
  {
    perfumeId: "p-2",
    rank: 2,
    name: "عطر دو",
    brand: "برند دو",
    productUrl: null,
    imageUrl: null,
    price: null,
    matchPercent: 78.2,
    explanation: "چون رایحه‌های گرم و چوبی با سلیقه شما هماهنگ‌اند.",
  },
  {
    perfumeId: "p-3",
    rank: 3,
    name: "عطر سه",
    brand: "برند سه",
    productUrl: null,
    imageUrl: null,
    price: 0,
    matchPercent: 64,
  },
];

const noop = () => {};

describe("WidgetAnalysis — performed analysis", () => {
  it("opens on the shared static frame: percent, bar, line and the skip", () => {
    const html = renderToStaticMarkup(
      <WidgetAnalysis matches={[]} onDone={noop} onSkip={noop} />,
    );

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain(INTERSTITIAL_LINES[0]);
    expect(html).toContain("رد شدن");
    // Nothing is invented before the API response lands.
    expect(html).not.toContain("<img");
  });

  it("keeps every crossfade slide mounted at once (no keyed remount)", () => {
    const html = renderToStaticMarkup(
      <WidgetAnalysis matches={MATCHES} onDone={noop} onSkip={noop} />,
    );

    expect(html.match(/<img/g)).toHaveLength(3);
    for (const match of MATCHES) {
      expect(html).toContain(match.name);
      expect(html).toContain(match.brand);
    }
  });

  it("renders one static frame under reduced motion (no live count)", () => {
    const html = renderToStaticMarkup(
      <WidgetAnalysis matches={[]} onDone={noop} onSkip={noop} reducedMotionOverride />,
    );

    expect(html).toContain('aria-valuenow="34"');
  });
});

describe("WidgetRecommendationCard — data contracts", () => {
  it("renders the rank, the match bar + «تطابق», the explanation and the CTA", () => {
    const html = renderToStaticMarkup(
      <WidgetRecommendationCard recommendation={MATCHES[1]} storeId="store-A" />,
    );

    expect(html).toContain('aria-label="رتبه 2"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="78"');
    expect(html).toContain("تطابق");
    expect(html).toContain("چرا بهتون میاد؟");
    // No productUrl AND no store site → no CTA at all, never a fake link.
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("مشاهده عطر");
    expect(html).not.toContain("مشاهده در فروشگاه");
  });

  it("renders the product CTA with render-time UTM attribution", () => {
    const html = renderToStaticMarkup(
      <WidgetRecommendationCard recommendation={MATCHES[0]} storeId="store-A" />,
    );

    // The stored URL is not mutated; the tags are appended where it is used.
    expect(html).toContain(
      'href="https://shop.example/p/1?utm_source=fiage_widget&amp;utm_medium=quiz&amp;utm_campaign=store-A"',
    );
    expect(html).toContain("مشاهده عطر");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("attributes with the store SLUG — the campaign id a merchant can read", () => {
    const html = renderToStaticMarkup(
      <WidgetRecommendationCard
        recommendation={MATCHES[0]}
        storeId="clx0opaqueid000"
        storeSlug="my-shop"
      />,
    );

    expect(html).toContain(
      'href="https://shop.example/p/1?utm_source=fiage_widget&amp;utm_medium=quiz&amp;utm_campaign=my-shop"',
    );
    // The opaque store id is not what the merchant reads.
    expect(html).not.toContain("utm_campaign=clx0opaqueid000");
  });

  it("attributes the fallback CTA with the slug too", () => {
    const html = renderToStaticMarkup(
      <WidgetRecommendationCard
        recommendation={MATCHES[2]}
        storeId="clx0opaqueid000"
        storeSlug="my-shop"
        storeWebsiteUrl="https://shop.example"
      />,
    );

    expect(html).toContain("utm_campaign=my-shop");
  });

  it("falls back to the store id when no slug is known", () => {
    const html = renderToStaticMarkup(
      <WidgetRecommendationCard
        recommendation={MATCHES[0]}
        storeId="store-A"
        storeSlug={null}
      />,
    );

    expect(html).toContain("utm_campaign=store-A");
  });

  it("never shows the product CTA when there is no productUrl", () => {
    const html = renderToStaticMarkup(
      <WidgetRecommendationCard
        recommendation={MATCHES[2]}
        storeId="store-A"
        storeWebsiteUrl="https://shop.example"
      />,
    );

    expect(html).not.toContain("مشاهده عطر");
  });

  it("falls back to the store site when a recommendation has no productUrl", () => {
    const html = renderToStaticMarkup(
      <WidgetRecommendationCard
        recommendation={MATCHES[2]}
        storeId="store-A"
        storeWebsiteUrl="https://shop.example"
      />,
    );

    expect(html).toContain("مشاهده در فروشگاه");
    expect(html).toContain(
      'href="https://shop.example?utm_source=fiage_widget&amp;utm_medium=quiz&amp;utm_campaign=store-A"',
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("prefers the product link over the fallback when both exist", () => {
    const html = renderToStaticMarkup(
      <WidgetRecommendationCard
        recommendation={MATCHES[0]}
        storeId="store-A"
        storeWebsiteUrl="https://shop.example"
      />,
    );

    expect(html).toContain("مشاهده عطر");
    expect(html).not.toContain("مشاهده در فروشگاه");
  });

  it("renders the stored price in Persian digits, with the currency label", () => {
    const html = renderToStaticMarkup(
      <WidgetRecommendationCard recommendation={MATCHES[0]} storeId="store-A" />,
    );

    expect(html).toContain("۱,۲۵۰,۰۰۰ تومان");
  });

  it("renders no price line for a null or zero price", () => {
    for (const recommendation of [MATCHES[1], MATCHES[2]]) {
      const html = renderToStaticMarkup(
        <WidgetRecommendationCard recommendation={recommendation} storeId="store-A" />,
      );

      expect(html).not.toContain("تومان");
    }
  });

  it("falls back to BottleMark (not invented artwork) when imageUrl is absent", () => {
    const html = renderToStaticMarkup(
      <WidgetRecommendationCard recommendation={MATCHES[2]} storeId="store-A" />,
    );

    expect(html).not.toContain("<img");
    expect(html).toContain("<svg");
    // No explanation for this match → the block is absent, not empty.
    expect(html).not.toContain("چرا بهتون میاد؟");
  });
});
