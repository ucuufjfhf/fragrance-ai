import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import GlobalError from "@/app/global-error";

/**
 * The full-document error boundary (batch 59).
 *
 * `app/error.tsx` cannot catch a throw in the root layout, so this file is the
 * only fallback for that case — and it runs without `globals.css`, fonts or the
 * router. The pins below are therefore as much about self-containment as about
 * copy: a single class-based style or shared import here would render dead or
 * re-break with the layout.
 */

const SOURCE = readFileSync(join(process.cwd(), "app/global-error.tsx"), "utf8");

const HEADING = "مشکلی پیش اومد";
// U+200C in «می‌تونید» is written explicitly so this pin cannot drift.
const BODY =
  "در بارگذاری این صفحه خطایی رخ داد. می\u200cتونید دوباره تلاش کنید یا به صفحهٔ اول برگردید.";

function renderBoundary(): string {
  const error = Object.assign(new Error("db://secret-connection-string"), {
    digest: "global-digest-7",
  });

  return renderToStaticMarkup(<GlobalError error={error} retry={() => {}} />);
}

describe("app/global-error.tsx — self-contained document boundary", () => {
  it("renders its own Persian RTL document", () => {
    const html = renderBoundary();

    expect(html).toContain('lang="fa"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("<body");
    expect(html.startsWith("<html")).toBe(true);
  });

  it("carries a React title, since metadata exports are unsupported here", () => {
    const html = renderBoundary();

    expect(html).toContain("<title>");
    expect(html).toContain("مشکلی پیش اومد | FIAGE");
  });

  it("renders the fixed copy verbatim and never the thrown value", () => {
    const html = renderBoundary();
    const text = html.replace(/\s+/g, " ");

    expect(text).toContain(HEADING);
    expect(text).toContain(BODY);
    expect(BODY).toContain("\u200c");

    expect(html).not.toContain("db://secret-connection-string");
    expect(html).not.toContain("global-digest-7");
  });

  it("uses retry — not reset — and a plain anchor home", () => {
    const html = renderBoundary();

    expect(SOURCE).toContain("retry: () => void");
    expect(SOURCE).toContain("onClick={() => retry()}");
    // No reset prop anywhere (the doc comment may NAME it to explain why).
    expect(SOURCE).not.toContain("reset: () => void");
    expect(SOURCE).not.toMatch(/\breset\b\s*[,}]/);

    expect(html).toContain('href="/"');
    expect(html).toContain("بازگشت به خانه");
    expect(html).toContain("تلاش دوباره");
    // A plain <a>: no router dependency in a document that may itself be broken.
    expect(SOURCE).not.toContain("next/link");
  });

  it("is self-contained: no globals, fonts, chrome or class-based styling", () => {
    // Imports, not mentions: the doc comment NAMES what it deliberately avoids.
    expect(SOURCE).not.toMatch(/import\s+["'][^"']*\.css["']/);
    expect(SOURCE).not.toMatch(/from\s+["']next\/font/);
    expect(SOURCE).not.toContain("@/components/site/SiteHeader");
    expect(SOURCE).not.toContain("@/components/site/SiteFooter");
    expect(SOURCE).not.toContain("className");
    // The warning glyph is inlined, not imported (the shared icon is class-only).
    expect(SOURCE).not.toContain("@/components/ui-icons");
  });

  it("styles with the literal brand hexes and the real mark", () => {
    const html = renderBoundary();

    expect(SOURCE).toContain("#faf7f2");
    expect(SOURCE).toContain("#ffffff");
    expect(SOURCE).toContain("#2a2420");
    expect(html).toContain('src="/brand/fiage-mark.png"');
    expect(html).toContain('width="560"');
    expect(html).toContain('height="560"');
    expect(html).toContain("64px");
  });

  it("logs the digest only", () => {
    expect(SOURCE).toContain("error.digest ?? error.message");
    expect(SOURCE).toContain('console.error("global error boundary:"');
  });
});
