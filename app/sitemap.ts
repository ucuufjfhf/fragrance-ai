import type { MetadataRoute } from "next";

/**
 * GET /sitemap.xml — the four public pages, and nothing else.
 *
 * Deliberately not generated from the filesystem: `/result`, `/store-report`
 * and the admin routes exist but are not public destinations, so the list is
 * written out. A new public page means adding it here on purpose.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://fiage.ir/" },
    { url: "https://fiage.ir/quiz" },
    { url: "https://fiage.ir/about" },
    { url: "https://fiage.ir/data-policy" },
    { url: "https://fiage.ir/for-stores" },
  ];
}
