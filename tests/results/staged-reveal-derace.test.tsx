import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import StagedReveal from "@/components/results/StagedReveal";

/**
 * Regression lock for the N-to-1 flash: StagedReveal used to mount every card
 * and drop to one inside requestAnimationFrame, so any paint in between
 * showed all cards vanishing — the opposite of a reveal. The staging is now
 * CSS-driven: the server markup already carries `data-shown="1"` with every
 * card mounted, and the stylesheet hides stops 2+ from the very first paint.
 * These tests pin that contract on both sides (markup + stylesheet + flag).
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

const root = new URL("../../", import.meta.url);
const read = (path: string): string =>
  readFileSync(new URL(path, root), "utf8");

describe("staged reveal never renders N-to-1", () => {
  it("stages from the first commit: data-shown=1 with every card mounted", () => {
    const html = render(
      <StagedReveal>
        <li>first</li>
        <li>second</li>
        <li>third</li>
      </StagedReveal>,
    );

    // All three stops are in the markup (final-first, no-JS safe) in order,
    // but the reveal opens at one — never more than a later frame shows.
    expect(html).toContain('data-shown="1"');
    const first = html.indexOf("<li>first</li>");
    const second = html.indexOf("<li>second</li>");
    const third = html.indexOf("<li>third</li>");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it("hides stops 2+ in CSS from the first paint (JS + motion-OK only)", () => {
    const css = read("app/globals.css");

    // Motion-OK browsers with JS hide the later stops; no-JS (no `html.js`)
    // and reduced-motion never match, so they keep the full static page.
    expect(css).toContain(
      "html.js .staged-reveal[data-shown=\"1\"] > li:nth-child(n + 2)",
    );
    expect(css).toContain(
      "html.js .staged-reveal[data-shown=\"2\"] > li:nth-child(n + 3)",
    );

    const mediaIndex = css.indexOf(
      "@media (prefers-reduced-motion: no-preference)",
    );
    expect(mediaIndex).toBeGreaterThan(-1);
    expect(
      css.indexOf(
        "html.js .staged-reveal[data-shown=\"1\"]",
        mediaIndex,
      ),
    ).toBeGreaterThan(mediaIndex);
  });

  it("flags JS presence before first paint from the root layout", () => {
    const layout = read("app/layout.tsx");

    expect(layout).toContain('strategy="beforeInteractive"');
    expect(layout).toContain('document.documentElement.classList.add("js")');
  });
});
