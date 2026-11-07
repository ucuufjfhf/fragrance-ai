import type { MetadataRoute } from "next";

/**
 * GET /robots.txt — the public crawl policy.
 *
 * Everything a shopper can see is crawlable (the landing page, the quiz, the
 * two trust pages). The merchant/admin surface is not: `/admin` (dashboards),
 * `/api/` (route handlers, widgets, exports) and `/store-report` (the
 * secret-link aggregate report) are all disallowed, so a leaked report URL
 * cannot be indexed by accident. The sitemap is declared so crawlers find the
 * four public URLs without guessing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/store-report"],
    },
    sitemap: "https://fiage.ir/sitemap.xml",
  };
}
