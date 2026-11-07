import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  WidgetChromeFooter,
  WidgetChromeHeader,
  shouldRenderWidgetChrome,
} from "@/components/widget/WidgetChrome";

/**
 * The standalone-widget chrome is mode-gated: it exists when the widget IS the
 * page, and is absent — not merely hidden — inside a merchant's iframe, because
 * the embedded document's own measured height is what the resize bridge reports
 * to the parent.
 *
 * The suite is SSR-only by design (`environment: "node"`, no jsdom, no Testing
 * Library), so a real mount cannot run here. The gate is therefore pinned as
 * pure logic against the same `WidgetWindowLike` stubs the visibility tests use;
 * the pre-mount render is rendered for real and must be empty; and the chrome's
 * own markup contract is asserted against the component source — the convention
 * `widget-shell.test.tsx` and `visibility.test.ts` already use for the widget.
 */

const SOURCE = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const CHROME = SOURCE("components/widget/WidgetChrome.tsx");
const PAGE = SOURCE("app/widget/page.tsx");

const HEADER = CHROME.slice(
  CHROME.indexOf("export function WidgetChromeHeader"),
  CHROME.indexOf("export function WidgetChromeFooter"),
);
const FOOTER = CHROME.slice(CHROME.indexOf("export function WidgetChromeFooter"));

function topLevelWindow() {
  const win = {} as { top: unknown };

  win.top = win;

  return win;
}

const EMBEDDED_WINDOW = { top: {} };

describe("shouldRenderWidgetChrome — top-level visits only", () => {
  it("renders chrome when the widget is the whole page", () => {
    expect(shouldRenderWidgetChrome(topLevelWindow())).toBe(true);
  });

  it("renders nothing inside a merchant iframe", () => {
    expect(shouldRenderWidgetChrome(EMBEDDED_WINDOW)).toBe(false);
  });

  it("renders nothing before a window exists (SSR and the first render)", () => {
    expect(shouldRenderWidgetChrome(null)).toBe(false);
    expect(shouldRenderWidgetChrome(undefined)).toBe(false);
  });
});

describe("no chrome flash, in either mode", () => {
  it("server markup is empty — the mode is unknown until mount", () => {
    expect(renderToStaticMarkup(<WidgetChromeHeader />)).toBe("");
    expect(renderToStaticMarkup(<WidgetChromeFooter />)).toBe("");
  });

  it("decides once, at mount, from the shared embed helper", () => {
    expect(CHROME).toContain("useEffect");
    expect(CHROME).toContain("shouldRenderWidgetChrome(window)");
    expect(CHROME).toContain("isEmbeddedWidget");

    // Undecided or embedded is an early `return null` in both components: no
    // wrapper element is ever emitted, so the embedded document gains no height.
    expect(CHROME.match(/if \(!standalone\) \{\s*return null;/g) ?? []).toHaveLength(2);
  });
});

describe("masthead contract", () => {
  it("shows the bundled mark beside FIAGE as typography, over a hairline", () => {
    expect(HEADER).toContain('src="/brand/fiage-mark.png"');
    expect(HEADER).toContain('alt="FIAGE"');
    expect(HEADER).toContain("h-9 w-9");
    expect(HEADER).toContain("font-display");
    expect(HEADER).toContain("tracking-[0.3em]");
    expect(HEADER).toContain("border-b border-border-soft");
    expect(HEADER).toContain("pb-4");
    // Quiet chrome only: no tagline, no nav, no links.
    expect(HEADER).not.toContain("href=");
    expect(HEADER).not.toContain("<nav");
  });
});

describe("footer contract", () => {
  it("rests at the bottom of the column, above a hairline", () => {
    expect(FOOTER).toContain("mt-auto");
    expect(FOOTER).toContain("border-t border-border-soft");
    expect(FOOTER).toContain("pt-4");
    expect(FOOTER).toContain("text-muted");
  });

  it("states who runs the quiz, with the two public links", () => {
    expect(FOOTER).toContain("این آزمون توسط FIAGE ارائه می‌شه");
    expect(FOOTER).toContain('href="https://fiage.ir"');
    // The link's own label (the href above also contains the host).
    expect(FOOTER).toMatch(/\n\s*fiage\.ir\s*\n\s*<\/a>/);
    expect(FOOTER).toContain('href="https://fiage.ir/data-policy"');
    expect(FOOTER).toContain("حریم داده‌ها");
    expect(FOOTER).toContain("hover:underline");
    expect(FOOTER).toContain("hover:text-foreground");
  });

  it("never borrows the store's accent colour", () => {
    expect(CHROME).not.toContain("--accent");
  });
});

describe("the page wires the chrome around the column", () => {
  it("stays a server component and keeps the resize bridge", () => {
    expect(PAGE).not.toContain('"use client"');
    expect(PAGE).toContain("<WidgetResizeBridge />");
  });

  it("renders the header above the column and the footer below it", () => {
    const header = PAGE.indexOf("<WidgetChromeHeader />");
    const column = PAGE.indexOf("<WidgetApp storeId={storeId} />");
    const footer = PAGE.indexOf("<WidgetChromeFooter />");

    expect(header).toBeGreaterThan(-1);
    expect(footer).toBeGreaterThan(-1);
    expect(header).toBeLessThan(column);
    expect(footer).toBeGreaterThan(column);
  });
});
