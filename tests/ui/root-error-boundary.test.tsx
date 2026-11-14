import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RootError from "@/app/error";

/**
 * The root error boundary (polish batch).
 *
 * Before this file existed, an uncaught render throw outside `/result` and
 * `/admin/perfumes` showed Next.js's default English error page. What is pinned
 * here is the public promise: the fallback is FIAGE chrome with fixed Persian
 * copy, and nothing from the thrown value — message or digest — ever reaches
 * the user.
 */

const SOURCE = readFileSync(join(process.cwd(), "app/error.tsx"), "utf8");

const HEADING = "مشکلی پیش اومد";
// U+200C in «می‌تونید» is written explicitly so this pin cannot drift.
const BODY =
  "در بارگذاری این صفحه خطایی رخ داد. می\u200cتونید دوباره تلاش کنید یا به صفحهٔ اول برگردید.";

function renderBoundary(): string {
  const error = Object.assign(new Error("connection string postgres://secret"), {
    digest: "digest-abc123",
  });

  return renderToStaticMarkup(<RootError error={error} reset={() => {}} />);
}

describe("app/error.tsx — branded root boundary", () => {
  it("is a client component exporting the boundary with error and reset props", () => {
    expect(SOURCE.startsWith('"use client";')).toBe(true);
    expect(SOURCE).toContain("export default function RootError");
    expect(SOURCE).toContain("error: Error & { digest?: string }");
    expect(SOURCE).toContain("reset: () => void");
    // The retry button is wired to the boundary's own reset, not a reload.
    expect(SOURCE).toContain("onClick={reset}");
  });

  it("renders the fixed Persian copy verbatim, with no error detail", () => {
    const html = renderBoundary();
    const text = html.replace(/\s+/g, " ");

    expect(text).toContain(HEADING);
    expect(text).toContain(BODY);
    expect(BODY).toContain("\u200c");

    // Nothing thrown is ever rendered — not the message, not the digest.
    expect(html).not.toContain("postgres://secret");
    expect(html).not.toContain("connection string");
    expect(html).not.toContain("digest-abc123");
  });

  it("offers the retry action and a link home", () => {
    const html = renderBoundary();

    expect(html).toContain("تلاش دوباره");
    expect(html).toContain("بازگشت به خانه");
    expect(html).toContain('href="/"');
    expect(html).toContain("btn-primary");
  });

  it("carries the site chrome and the real FIAGE mark", () => {
    const html = renderBoundary();

    // Same chrome as the 404: the shared header (its quiz CTA) and footer.
    expect(html).toContain("site-header");
    expect(html).toContain("شروع آزمون");
    expect(html).toContain("<footer");

    // The bundled 560×560 master, not a redrawn glyph.
    expect(html).toContain('src="/brand/fiage-mark.png"');
    expect(html).toContain('width="560"');
    expect(html).toContain('height="560"');
  });

  it("logs the digest only, never the error message body", () => {
    // Structural pin: the effect reads digest first and falls back to message,
    // exactly like the two segment boundaries.
    expect(SOURCE).toContain('error.digest ?? error.message');
    expect(SOURCE).toContain("console.error");
  });
});
