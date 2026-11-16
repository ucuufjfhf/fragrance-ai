import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import WidgetError from "@/app/widget/error";

/**
 * The widget's own error boundary (polish batch).
 *
 * `/widget` is embedded in a merchant's iframe, where the site's public chrome
 * must never appear. The root boundary (`app/error.tsx`) was the previous
 * fallback and imports exactly that chrome, so this file pins the opposite
 * contract: one compact card, fixed Persian copy, retry as the only action, and
 * nothing from the thrown value.
 */

const SOURCE = readFileSync(join(process.cwd(), "app/widget/error.tsx"), "utf8");
/** The file with comments removed — the doc comment may NAME what it avoids. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const LOADER = readFileSync(join(process.cwd(), "public/widget.js"), "utf8");

const HEADING = "مشکلی پیش اومد";
// U+200C in «می‌تونید» is explicit so this pin cannot drift.
const BODY = "در بارگذاری ویجت خطایی رخ داد. می\u200cتونید دوباره تلاش کنید.";

function renderBoundary(): string {
  const error = Object.assign(new Error("prisma://secret-connection"), {
    digest: "widget-digest-42",
  });

  return renderToStaticMarkup(<WidgetError error={error} reset={() => {}} />);
}

describe("app/widget/error.tsx — chromeless widget boundary", () => {
  it("is a client component exporting the boundary with error and reset props", () => {
    expect(SOURCE.startsWith('"use client";')).toBe(true);
    expect(SOURCE).toContain("export default function WidgetError");
    expect(SOURCE).toContain("error: Error & { digest?: string }");
    expect(SOURCE).toContain("reset: () => void");
    expect(SOURCE).toContain("onClick={reset}");
  });

  it("renders the fixed Persian copy verbatim, with no error detail", () => {
    const html = renderBoundary();
    const text = html.replace(/\s+/g, " ");

    expect(text).toContain(HEADING);
    expect(text).toContain(BODY);
    expect(BODY).toContain("\u200c");

    expect(html).not.toContain("prisma://secret-connection");
    expect(html).not.toContain("widget-digest-42");
  });

  it("is chromeless: no site header, footer or any link", () => {
    // Imports, not mentions: the doc comment explains what is deliberately
    // absent, and that explanation is not a dependency.
    expect(CODE).not.toContain("SiteHeader");
    expect(CODE).not.toContain("SiteFooter");
    expect(CODE).not.toContain("@/components/site/");
    expect(CODE).not.toMatch(/\bLink\b/);

    const html = renderBoundary();

    expect(html).not.toContain("site-header");
    expect(html).not.toContain("<header");
    expect(html).not.toContain("<footer");
    // No anchors at all: inside the frame a link would navigate the iframe, so
    // retry is the only action. (React's image preload emits a <link href>, which
    // is a resource hint, not a navigable link.)
    expect(html).not.toMatch(/<a[\s>]/);
    expect(html).not.toContain("بازگشت به خانه");
  });

  it("shows the retry action and the bundled FIAGE mark", () => {
    const html = renderBoundary();

    expect(html).toContain("تلاش دوباره");
    expect(html).toContain("btn-primary");
    expect(html).toContain('src="/brand/fiage-mark.png"');
    expect(html).toContain('width="560"');
    expect(html).toContain('height="560"');
    expect(html).toContain("h-10 w-10");
  });

  it("logs the digest only", () => {
    expect(SOURCE).toContain("error.digest ?? error.message");
    expect(SOURCE).toContain("console.error");
  });

  it("leaves the loader's down-state watchdog untouched", () => {
    // The 12s fallback for a frame that never loads is a different path (it
    // runs in the merchant page, before/without this boundary ever rendering).
    expect(LOADER).toContain("var LOAD_TIMEOUT_MS = 12000");
    expect(LOADER).toContain("showFallback");
    expect(LOADER).toContain("fragrance-ai:resize");
  });
});
