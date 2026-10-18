import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import FaqSection, { FAQS } from "@/components/landing/FaqSection";
import SampleResultSection from "@/components/landing/SampleResultSection";
import { getArchetypeById } from "@/lib/personality/archetypes";

/**
 * Server-side render smoke tests for the landing depth sections (same
 * convention as the other UI tests: react-dom/server, no jsdom, no browser).
 * Expand/collapse interaction and keyboard operability are covered by the
 * browser gate; here we verify structure, honesty labelling and a11y hooks.
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

describe("sample result preview", () => {
  it("shows the شعله sample card, always labelled as an example", () => {
    const html = render(<SampleResultSection />);
    const flame = getArchetypeById("bold-one")!;

    expect(html).toContain("نمونه نتیجه");
    expect(html).toContain(flame.label);
    expect(html).toContain(flame.description);
    // Never presented as a real user's outcome.
    expect(html).toContain("نمونه");
    expect(html).not.toMatch(/کاربر|مشتری|رضایت|درصد/);
  });

  it("uses the real شعله colorway and links the quiz CTA", () => {
    const html = render(<SampleResultSection />);
    const flame = getArchetypeById("bold-one")!;

    expect(flame.accentColor).toBe("#C8102E");
    expect(html).toContain("--accent:#C8102E");
    expect(html).toContain('href="/quiz"');
    expect(html).toContain("شروع آزمون");
  });
});

describe("landing FAQ", () => {
  it("renders four honest questions as collapsed accessible buttons", () => {
    const html = render(<FaqSection />);

    for (const question of [
      "این آزمون چقدر دقیقه؟",
      "برای دیدن نتیجه باید ثبت‌نام کنم؟",
      "عطرها از کجا انتخاب می‌شن؟",
      "قیمت و خرید عطرها رو از کجا ببینم؟",
    ]) {
      expect(html).toContain(question);
    }
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(4);
    // Real buttons, keyboard operable by default; panels hidden until opened
    // (aria-controls references are fine — no panel *elements* rendered).
    expect(html).toContain("<button");
    expect(html).not.toContain('id="faq-panel-');
    // No invented stats, no testimonials, no counters anywhere.
    expect(html).not.toMatch(/کاربر|مشتری|رضایت|٪.*دقت|دقت.*٪/);
  });

  it("answers truthfully: taste model, no signup, 200 catalog, torob", () => {
    expect(FAQS).toHaveLength(4);
    const answers = FAQS.map((faq) => faq.answer).join("\n");

    // The honest facts, each verifiable: taste model not lab test, no
    // signup, the 200-perfume catalog, the Torob price button.
    expect(answers).toContain("۹ محور");
    expect(answers).toContain("ثبت‌نام");
    expect(answers).toContain("۲۰۰");
    expect(answers).not.toContain("۵۹");
    expect(answers).toContain("ترب");
    // No overclaiming, no invented stats, no social proof.
    expect(answers).not.toMatch(/کاربر|مشتری|رضایت|\d+٪.*دق|تضمین/);
  });
});
