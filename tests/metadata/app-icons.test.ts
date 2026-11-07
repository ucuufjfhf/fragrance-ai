import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

// The layout imports a Google font, which only resolves under Next's SWC
// transform; the metadata object itself needs no font.
vi.mock("next/font/google", () => ({
  Vazirmatn: () => ({ variable: "--font-persian", className: "font-persian" }),
}));

import { metadata } from "@/app/layout";
import manifest from "@/app/manifest";

/**
 * Icon and manifest hygiene, pinned at the source and on disk.
 *
 * Buyer-audit round 5 found production fiage.ir returning 404 for both
 * `/apple-touch-icon.png` and `/manifest.json`/`/site.webmanifest`. Two separate
 * problems sat behind that:
 *
 *  - the apple entry pointed at the 560×560 tab mark, a size no Apple client
 *    uses, so clients that probe the conventional root path got nothing;
 *  - there was no manifest at all, so Android had no name, colour or icon.
 *
 * A rendering test cannot catch either: the tag can be present while the file
 * is missing, and the manifest is a route, not markup. So this suite checks the
 * declared metadata, the manifest object, AND the bytes on disk — including the
 * PNG dimensions, because a wrong-sized image behind a correct `sizes` string is
 * the same bug wearing a link tag.
 */

const PUBLIC = new URL("../../public/", import.meta.url);
const pngPath = (relative: string) => fileURLToPath(new URL(relative, PUBLIC));

/**
 * `metadata.icons` is a union (`string | IconURL | Icon[] | Icons`); this app
 * only ever uses the keyed object form, so narrow it once here.
 */
function headIcons(): { icon?: unknown; apple?: unknown } {
  const icons = metadata.icons;

  if (!icons || typeof icons === "string" || Array.isArray(icons)) {
    throw new Error("expected metadata.icons to be the keyed object form");
  }

  return icons as { icon?: unknown; apple?: unknown };
}

/** Reads the real pixel size from a PNG's IHDR chunk. */
function pngSize(relative: string): { width: number; height: number; bytes: number } {
  const buffer = readFileSync(pngPath(relative));

  expect(buffer.subarray(0, 8).toString("hex"), `${relative} must be a PNG`).toBe("89504e470d0a1a0a");

  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
}

describe("app icons", () => {
  it("declares a dedicated 180x180 apple touch icon at the conventional root path", () => {
    expect(headIcons().apple).toEqual([
      { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
    ]);
  });

  it("leaves the tab icon alone", () => {
    // Out of scope for this change; asserted so the apple fix cannot drift it.
    expect(headIcons().icon).toEqual([
      { url: "/brand/fiage-mark.png", type: "image/png", sizes: "560x560" },
    ]);
  });

  it("serves a real 180x180 PNG at /apple-touch-icon.png", () => {
    expect(pngSize("apple-touch-icon.png")).toMatchObject({ width: 180, height: 180 });
  });
});

describe("app/manifest.ts", () => {
  it("returns exactly the shipped web app manifest", () => {
    expect(manifest()).toEqual({
      name: "FIAGE",
      short_name: "FIAGE",
      description:
        "تست بدهید، آرکتایپ عطری‌تان را بشناسید؛ FIAGE عطری را پیدا می‌کند که واقعاً شماست.",
      start_url: "/",
      display: "standalone",
      background_color: "#faf7f2",
      theme_color: "#faf7f2",
      lang: "fa",
      dir: "rtl",
      icons: [
        { src: "/brand/fiage-icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/brand/fiage-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
  });

  it("repeats the site description verbatim instead of paraphrasing it", () => {
    expect(manifest().description).toBe(metadata.description);
  });

  it("points its icons at files that exist, at the sizes it claims", () => {
    const icons = manifest().icons ?? [];

    expect(icons).toHaveLength(2);

    for (const icon of icons) {
      const relative = icon.src!.replace(/^\//, "");
      const [width, height] = icon.sizes!.split("x").map(Number);

      expect(pngSize(relative)).toMatchObject({ width, height });
    }
  });
});
