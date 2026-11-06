import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import WidgetShell from "@/components/widget/WidgetShell";
import { validateAccentColor } from "@/lib/store/branding";

/**
 * The merchant accent: validated in ONE place, applied in exactly one place.
 *
 * The guard at the bottom is the important one for the main site: the override
 * may exist only inside the widget shell, so a store's brand colour can never
 * leak into FIAGE's own pages.
 */

const SOURCE = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("validateAccentColor — the canonical rule", () => {
  it("accepts #rrggbb and normalises the case", () => {
    expect(validateAccentColor("#1F6F5C")).toEqual({ ok: true, value: "#1f6f5c" });
    expect(validateAccentColor("#1f6f5c")).toEqual({ ok: true, value: "#1f6f5c" });
  });

  it("treats absent and empty as 'keep the default'", () => {
    expect(validateAccentColor(undefined)).toEqual({ ok: true, value: null });
    expect(validateAccentColor(null)).toEqual({ ok: true, value: null });
    expect(validateAccentColor("   ")).toEqual({ ok: true, value: null });
  });

  it("rejects malformed colours instead of storing them", () => {
    for (const bad of ["#12345", "#1234567", "1f6f5c", "#gggggg", "red", "rgb(0,0,0)", "#1F6F5"]) {
      const result = validateAccentColor(bad);

      expect(result.ok, `${bad} was accepted`).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("#RRGGBB");
      }
    }
  });

  it("rejects non-string values", () => {
    expect(validateAccentColor(123).ok).toBe(false);
    expect(validateAccentColor({}).ok).toBe(false);
  });
});

describe("WidgetShell — the accent is scoped to the widget", () => {
  it("applies the stored colour as --accent on the shell", () => {
    const html = renderToStaticMarkup(
      <WidgetShell accentColor="#1F6F5C">
        <p>body</p>
      </WidgetShell>,
    );

    expect(html).toContain("--accent:#1f6f5c");
    expect(html).toContain("data-widget-shell");
  });

  it("renders no override at all when the store has no colour", () => {
    const html = renderToStaticMarkup(
      <WidgetShell accentColor={null}>
        <p>body</p>
      </WidgetShell>,
    );

    expect(html).not.toContain("--accent");
    expect(html).toContain("data-widget-shell");
  });

  it("renders no override for a stored value that is no longer valid", () => {
    const html = renderToStaticMarkup(
      <WidgetShell accentColor="chartreuse">
        <p>body</p>
      </WidgetShell>,
    );

    expect(html).not.toContain("--accent");
  });
});

describe("main site — provably unaffected", () => {
  it("has no accent override in the app shell or the site chrome", () => {
    for (const path of ["app/layout.tsx", "app/globals.css", "components/site/SiteHeader.tsx"]) {
      const source = SOURCE(path);

      expect(source, `${path} sets --accent inline`).not.toMatch(/"--accent"\s*:/);
    }
  });

  it("is imported only inside the widget app", () => {
    const app = SOURCE("components/widget/WidgetApp.tsx");

    expect(app).toContain('from "@/components/widget/WidgetShell"');

    // The shell itself must not be referenced by any main-site page or layout.
    for (const path of ["app/layout.tsx", "app/page.tsx", "app/quiz/page.tsx", "app/result/page.tsx"]) {
      expect(SOURCE(path), `${path} imports the widget shell`).not.toContain("WidgetShell");
    }
  });
});
