import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AboutPage, { metadata } from "@/app/about/page";
import { archetypeEmblemImageFor } from "@/components/archetype-emblems";
import SiteFooter from "@/components/site/SiteFooter";
import { ARCHETYPES } from "@/lib/personality/archetypes";

/** The contact address — must match the mailto in the page and the footer. */
const CONTACT_EMAIL = "majid@fiage.ir";

/**
 * Server-side render smoke tests for the trust infrastructure (same
 * convention as the other UI tests: react-dom/server, no jsdom, no browser).
 * Navigation and the mailto CTA are covered by the browser gate.
 *
 * Batch 50: the copy pins below are the owner-approved brand rewrite — his
 * exact strings, asserted verbatim, not paraphrases.
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

/** Every non-generated text source file under one of the app dirs. */
function sourceFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "generated"].includes(entry.name)) {
      continue;
    }

    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(ts|tsx|css|json|md)$/.test(entry.name)) {
      files.push(path);
    }
  }

  return files;
}

describe("about page", () => {
  it("has the Persian page title", () => {
    expect(metadata.title).toContain("درباره‌ی فیاژ");
  });

  it("carries the approved metadata description", () => {
    expect(metadata.description).toContain("هر کسی یه امضای بویایی داره");
    expect(metadata.description).toContain("سه عطر منتخب رو با دلیل");
  });

  it("opens on the approved headline and brand story", () => {
    const html = render(<AboutPage />);

    expect(html).toContain("هر کسی یه امضای بویایی داره");
    expect(html).toContain("عطر خریدن معمولاً شانسیه");
    expect(html).toContain("همه‌شون شبیه همن");
    expect(html).toContain("نه گرون‌ترین، نه معروف‌ترین");
    expect(html).toContain("با دلیل");
    expect(html).toContain("بدون ثبت‌نام");
  });

  it("explains what FIAGE does and offers the contact CTA", () => {
    const html = render(<AboutPage />);

    expect(html).toContain("۱۰ سوال");
    expect(html).toContain("فیاژ چطور کار می‌کنه؟");
    expect(html).toContain("سه عطر، با دلیل");
    expect(html).toContain("نقشهٔ سلیقه\u200cتون ساخته می\u200cشه");
    expect(html).toContain("از جواب\u200cهاتون یه پروفایل بویایی روی ۹ محور درست می\u200cشه.");
    expect(html).toContain("در اسرع وقت پاسخ می‌دیم");
    expect(html).toContain(`mailto:${CONTACT_EMAIL}`);
    expect(html).toContain("ایمیل بزنید");
    expect(html).toContain("تماس با ما");
    expect(html).toContain('href="/quiz"');
  });
});

describe("about page — the eight-archetype emblem strip", () => {
  const LABELS = ["ماه", "قطره", "خورشید", "الماس", "پر", "رز", "شعله", "تاج"];
  const NAMES = [
    "The Moon",
    "The Droplet",
    "The Sun",
    "The Diamond",
    "The Feather",
    "The Rose",
    "The Flame",
    "The Crown",
  ];

  it("renders the approved heading", () => {
    expect(render(<AboutPage />)).toContain("هشت تیپ عطری");
  });

  it("shows every emblem from the exhaustive archetype lookup", () => {
    const html = render(<AboutPage />);

    for (const archetype of ARCHETYPES) {
      expect(html).toContain(`src="${archetypeEmblemImageFor(archetype.id)}"`);
    }

    expect(ARCHETYPES.map((archetype) => archetype.id)).toEqual([
      "mysterious-explorer",
      "clean-minimalist",
      "charismatic",
      "elegant-classic",
      "free-spirit",
      "romantic",
      "bold-one",
      "sophisticated",
    ]);
  });

  it("renders all eight Persian labels and English names", () => {
    const html = render(<AboutPage />);

    for (const label of LABELS) {
      expect(html).toContain(label);
    }

    for (const name of NAMES) {
      expect(html).toContain(name);
      expect(html).toContain(`dir="ltr"`);
    }

    // The names are the archetype data's own strings, not a local copy.
    expect(ARCHETYPES.map((archetype) => archetype.label)).toEqual(LABELS);
    expect(ARCHETYPES.map((archetype) => archetype.name)).toEqual(NAMES);
  });

  it("sits after the steps section and before the contact section", () => {
    const html = render(<AboutPage />);

    const steps = html.indexOf("فیاژ چطور کار می‌کنه؟");
    const strip = html.indexOf("هشت تیپ عطری");
    const contact = html.indexOf("تماس با ما");

    expect(steps).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(steps);
    expect(contact).toBeGreaterThan(strip);
  });
});

describe("site footer trust links", () => {
  it("links /about and the contact email alongside the existing links", () => {
    const html = render(<SiteFooter />);

    expect(html).toContain('href="/about"');
    expect(html).toContain("درباره‌ی فیاژ");
    expect(html).toContain(`mailto:${CONTACT_EMAIL}`);
    expect(html).toContain("تماس");
    // The data page is linked from the same row (it exists, so link it).
    expect(html).toContain('href="/data-policy"');
    expect(html).toContain("حریم خصوصی و داده‌ها");
    // Merchant landing page, added alongside it (batch 10).
    expect(html).toContain('href="/for-stores"');
    expect(html).toContain("برای فروشگاه‌ها");
    // Existing links and the protected tagline are untouched.
    expect(html).toContain("آزمون سلیقه");
    expect(html).toContain("چطور کار می‌کند");
    expect(html).toContain("انتخاب عطر بر اساس پروفایل تو");
  });
});

describe("contact address — the business mailbox is the only one", () => {
  it("has no personal Gmail left anywhere under app/, components/ or lib/", () => {
    const files = ["app", "components", "lib"].flatMap((dir) =>
      sourceFiles(join(process.cwd(), dir)),
    );

    expect(files.length).toBeGreaterThan(50);

    const offenders = files.filter((file) =>
      readFileSync(file, "utf8").includes("majidemoon0@gmail.com"),
    );

    expect(offenders).toEqual([]);
  });
});
