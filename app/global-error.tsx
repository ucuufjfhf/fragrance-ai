"use client";

import { useEffect } from "react";

/**
 * The full-document error boundary — the root layout's own safety net.
 *
 * `app/error.tsx` wraps pages, loading, not-found and nested layouts, but the
 * Next 16 `error.js` reference is explicit that it does NOT wrap the layout
 * above it. A throw inside `app/layout.tsx` therefore used to land on Next's
 * default English page; `global-error` replaces that layout when active.
 *
 * Global-error runs in a document Next does not style, so this file is fully
 * self-contained by design: its own <html>/<body>, inline styles with literal
 * brand hexes, a system font stack, a plain <a> for the way home, and an
 * inlined warning glyph. Nothing here depends on `globals.css`, a font loader,
 * the site header/footer or the router — any of those could be the thing that
 * just broke.
 *
 * Recovery is `retry`, not `reset`: the docs recommend it (stable since
 * 16.3.0) and it re-fetches as well as re-renders, which is what a root-layout
 * failure actually needs. Logging is digest-only; the thrown value is never
 * rendered.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("global error boundary:", error.digest ?? error.message);
  }, [error]);

  return (
    <html lang="fa" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 16px",
          boxSizing: "border-box",
          background: "#faf7f2",
          color: "#2a2420",
          fontFamily: "Tahoma, system-ui, -apple-system, 'Segoe UI', sans-serif",
          textAlign: "center",
        }}
      >
        {/* Metadata exports are not supported here; React's title is. */}
        <title>مشکلی پیش اومد | FIAGE</title>

        <div
          style={{
            width: "100%",
            maxWidth: "28rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            border: "1px solid #eae2d4",
            borderRadius: "16px",
            background: "#ffffff",
            padding: "28px 20px",
            boxSizing: "border-box",
          }}
        >
          {/* Bundled public/ asset, not merchant data — the same mark the rest
              of the site uses, sized inline because no stylesheet is loaded. */}
          <img
            src="/brand/fiage-mark.png"
            alt="FIAGE"
            width={560}
            height={560}
            style={{ width: 64, height: 64, objectFit: "contain" }}
          />

          {/* Inlined warning triangle: the shared icon accepts a class only, and
              class-based styling is dead in this document. */}
          <svg
            aria-hidden="true"
            width={32}
            height={32}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#b5652d"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m12 3 9 17H3L12 3Z" />
            <path d="M12 9v4M12 16h.01" />
          </svg>

          <h1
            style={{
              margin: 0,
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#2a2420",
            }}
          >
            مشکلی پیش اومد
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: "0.875rem",
              lineHeight: 2,
              color: "#756b5e",
            }}
          >
            در بارگذاری این صفحه خطایی رخ داد. می‌تونید دوباره تلاش کنید یا به صفحهٔ اول
            برگردید.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
            }}
          >
            <button
              type="button"
              onClick={() => retry()}
              style={{
                border: "0",
                borderRadius: "3px",
                background: "#b5652d",
                color: "#ffffff",
                fontFamily: "inherit",
                fontSize: "1rem",
                fontWeight: 500,
                minHeight: "48px",
                padding: "0 24px",
                cursor: "pointer",
              }}
            >
              تلاش دوباره
            </button>
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "44px",
                padding: "0 16px",
                color: "#756b5e",
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              بازگشت به خانه
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
