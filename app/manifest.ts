import type { MetadataRoute } from "next";

/**
 * Web app manifest — Next serves this file convention at `/manifest.webmanifest`
 * and injects the matching `<link rel="manifest">`.
 *
 * Why it exists: without it, Android's add-to-home-screen falls back to a
 * generated shortcut with no name, no colour and no icon. Everything below is
 * the minimum that produces a correct, installed-looking entry.
 *
 * Deliberate choices:
 *  - `name` and `short_name` are both "FIAGE": the brand is a Latin acronym even
 *    on a Persian site, and it is what fits under a home-screen icon.
 *  - `description` repeats the `<meta name="description">` string verbatim; the
 *    test asserts the two stay identical rather than trusting a copy.
 *  - `display: "standalone"` — the app is a quiz flow, and browser chrome adds
 *    nothing. `theme_color`/`background_color` are the site's own cream
 *    (`#faf7f2`), matching `viewport.themeColor`, so launch and splash do not
 *    flash a different white.
 *  - `lang: "fa"`, `dir: "rtl"`: the whole product is Persian and RTL.
 *  - 192 and 512 are the two sizes Android asks for (launcher and splash).
 *  - No screenshots, no shortcuts: neither has a designed asset yet, and an
 *    empty array of either is noise.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
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
  };
}
