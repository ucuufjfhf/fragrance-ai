import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SiteHeader from "@/components/site/SiteHeader";

/**
 * Skip-to-content link (accessibility batch).
 *
 * Batch 15 deliberately left this out pending a landmark decision: there is no
 * shared page wrapper, so the link lives in `SiteHeader` (the one shared public
 * chrome) and each page's own `<main>` carries the target. What is pinned here
 * is the contract that makes the link work: one link, first in tab order, fixed
 * copy, hidden until focus — and a real `id`/`tabIndex` target on every main the
 * header is rendered above.
 */

const SKIP_COPY = "پرش به محتوای اصلی";
const SKIP_HREF = 'href="#main-content"';

const HEADER_FILES = [
  "app/page.tsx",
  "app/quiz/page.tsx",
  "app/result/page.tsx",
  "app/about/page.tsx",
  "app/for-stores/page.tsx",
  "app/data-policy/page.tsx",
  "app/not-found.tsx",
  "app/error.tsx",
];

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("skip-to-content link", () => {
  const html = renderToStaticMarkup(<SiteHeader />);
  const skipTag = html.match(/<a[^>]*href="#main-content"[^>]*>/)?.[0] ?? "";

  it("renders exactly one skip link with the fixed copy", () => {
    expect((html.match(/href="#main-content"/g) ?? []).length).toBe(1);
    expect(html).toContain(SKIP_COPY);
    expect(html).toMatch(
      /<a[^>]*href="#main-content"[^>]*>\s*پرش به محتوای اصلی\s*<\/a>/,
    );
  });

  it("is the first anchor in the header markup, so it is first in tab order", () => {
    const firstAnchor = html.indexOf("<a ");

    expect(firstAnchor).toBeGreaterThan(-1);
    expect(html.slice(firstAnchor, firstAnchor + 200)).toContain(SKIP_HREF);
  });

  it("is hidden until focused and never animated", () => {
    expect(skipTag).toContain("sr-only");
    expect(skipTag).toContain("focus:not-sr-only");
    // No transition of any kind on the skip link itself.
    expect(skipTag).not.toContain("transition");
  });

  it("targets main-content on all nine mains across the eight pages", () => {
    for (const file of HEADER_FILES) {
      const source = read(file);
      const mains = (source.match(/<main\b/g) ?? []).length;

      expect(mains, file).toBeGreaterThan(0);
      expect((source.match(/id="main-content"/g) ?? []).length, file).toBe(mains);
      expect((source.match(/tabIndex=\{-1\}/g) ?? []).length, file).toBe(mains);
    }

    // /result has two branches (results + error state), both targeted.
    expect(
      (read("app/result/page.tsx").match(/id="main-content"/g) ?? []).length,
    ).toBe(2);
  });

  it("keeps the widget chromeless and link-free", () => {
    for (const file of ["app/widget/page.tsx", "app/widget/error.tsx"]) {
      const source = read(file);

      expect(source, file).not.toContain("#main-content");
      expect(source, file).not.toContain(SKIP_COPY);
    }
  });
});
