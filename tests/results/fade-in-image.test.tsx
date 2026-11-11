import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import FadeInImage, {
  MEDIA_FADE_IN_CLASS,
  fadeClassFor,
  initialFadeState,
} from "@/components/media/FadeInImage";

/**
 * Batch 45 — the shared one-shot image entrance.
 *
 * Two properties carry the risk: an image must never be invisible because its
 * entrance did not run (SSR/no-JS, error, cached-before-hydration), and the
 * entrance must fire once, on a real load, never on a clock. The state machine
 * is pure and pinned here; the four surfaces are pinned to the one wrapper.
 */

const read = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const IMAGE = read("components/media/FadeInImage.tsx");
const CSS = read("app/globals.css");
const FADE_CSS = CSS.slice(CSS.indexOf("Batch 45 — one-shot image entrance"));

renderToStaticMarkup;

describe("FadeInImage — visibility is never sacrificed", () => {
  it("renders the image fully visible in server markup (and no-JS)", () => {
    const html = renderToStaticMarkup(
      <FadeInImage
        src="/perfumes/x.jpg"
        alt="عطر"
        width={10}
        height={10}
        className="h-full w-full object-cover"
      />,
    );

    // Attribute-for-attribute the old bare <img>: existing pins keep their teeth.
    expect(html).toContain(
      '<img src="/perfumes/x.jpg" alt="عطر" width="10" height="10" class="h-full w-full object-cover"/>',
    );
    // Neither the pre-load hidden state nor the animation is in server markup.
    expect(html).not.toContain("opacity-0");
    expect(html).not.toContain(MEDIA_FADE_IN_CLASS);
  });

  it("settles visible when the image is already complete at mount", () => {
    expect(
      initialFadeState({ reducedMotion: false, complete: true }),
    ).toBe("static");
  });

  it("settles visible under reduced motion", () => {
    expect(
      initialFadeState({ reducedMotion: true, complete: false }),
    ).toBe("static");
    expect(fadeClassFor("static")).toBeUndefined();
  });

  it("only hides while the client is genuinely waiting for the load", () => {
    expect(
      initialFadeState({ reducedMotion: false, complete: false }),
    ).toBe("hidden");
    expect(fadeClassFor("hidden")).toBe("opacity-0");
    expect(fadeClassFor("animate")).toBe(MEDIA_FADE_IN_CLASS);
  });

  it("resolves on load, on error, and under reduced motion", () => {
    // Real-load gate, not a timer.
    expect(IMAGE).toContain("onLoad");
    expect(IMAGE).toContain("current === \"hidden\" ? \"animate\" : current");
    expect(IMAGE).not.toContain("setTimeout");
    // Error handler is a fail-safe to the final, visible state.
    expect(IMAGE).toContain("onError");
    expect(IMAGE).toContain('setState("static")');
    // Already-complete check comes from the browser itself.
    expect(IMAGE).toContain("image.complete");
    // Runs once: mount-only effect, no dependency on state.
    expect(IMAGE).toContain("}, []);");
    // md reduced-motion read happens at the client boundary.
    expect(IMAGE).toContain('"(prefers-reduced-motion: reduce)"');
  });
});

describe("FadeInImage — one shared mechanism for all four surfaces", () => {
  it("is the only image element in the four result spots", () => {
    for (const file of [
      "components/results/RecommendationCard.tsx",
      "components/widget/WidgetRecommendationCard.tsx",
      "components/results/ResultsView.tsx",
      "components/widget/WidgetApp.tsx",
    ]) {
      const source = read(file);

      expect(source, `${file} must use the shared wrapper`).toContain("<FadeInImage");
      // No bare image element left behind: that eslint directive only ever
      // guarded the plain <img> elements this wrapper replaced.
      expect(source).not.toContain("@next/next/no-img-element");
    }
  });

  it("uses the approved curve and duration, transform/opacity only", () => {
    expect(FADE_CSS).toContain("translateY(10px) scale(0.96)");
    expect(FADE_CSS).toContain("media-fade-in 900ms cubic-bezier(0.22, 0.8, 0.3, 1)");

    for (const forbidden of ["filter:", "blur(", "backdrop-filter", "background-position"]) {
      expect(FADE_CSS).not.toContain(forbidden);
    }
  });

  it("has a reduced-motion path that removes the entrance entirely", () => {
    expect(FADE_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.media-fade-in \{\s*animation: none;/,
    );
  });
});
