import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const css = readFileSync(new URL("app/globals.css", root), "utf8");

/** The two cursor data-URIs: body default + interactive elements. */
function cursorUris(): string[] {
  const block = css.slice(
    css.indexOf("/* Sparkle cursor:"),
    css.indexOf("/* Reduced motion: everything Phase 1"),
  );
  const uris = [...block.matchAll(/url\("data:image\/svg\+xml,([\s\S]*?)"\)/g)].map(
    (match) => match[1],
  );
  expect(uris).toHaveLength(2);
  return uris;
}

describe("compound-sparkle cursor", () => {
  it("draws the concave star plus four outward satellite triangles", () => {
    const [ink, gold] = cursorUris();

    for (const uri of [ink, gold]) {
      // 24px canvas with a centered hotspot for legibility.
      expect(uri).toContain("width='24'");
      expect(uri).toContain("viewBox='0 0 24 24'");
      // One concave-sided 4-point star (5 curve segments) + 4 separate
      // diagonal satellite triangles (each its own M…Z subpath).
      const subpaths = uri.match(/M[^M]*?Z/g) ?? [];
      expect(subpaths.length).toBe(5);
      expect(uri).toContain("C");
    }

    // Solid fills only: ink by default, marker gold when interactive.
    expect(ink).toContain("fill='%232a2420'");
    expect(gold).toContain("fill='%23d99a2b'");
    expect(ink).not.toContain("d99a2b");
  });

  it("retires the old plain 4-point star", () => {
    expect(css).not.toContain("M10 0C10.8 6 12 8 20 10");
  });

  it("keeps the pointer:fine gating, fallbacks and reduced-motion escape", () => {
    expect(css).toContain("@media (pointer: fine)");
    expect(css).toMatch(/12 12,\s*\n?\s*auto;/);
    expect(css).toMatch(/12 12,\s*\n?\s*pointer;/);

    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/body\s*\{\s*\n?\s*cursor:\s*auto;/);
  });
});
