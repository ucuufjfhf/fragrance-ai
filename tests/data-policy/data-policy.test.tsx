import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DataPolicyPage, { metadata } from "@/app/data-policy/page";
import { ANALYTICS_EVENT_TYPES } from "@/lib/analytics/types";
// The copy lives outside the page module (a page may export only metadata and
// the component), so the assertions read it from there.
import {
  COLLECTED_DATA,
  CONTACT_EMAIL,
  EVENT_LABELS,
  NOT_COLLECTED,
} from "@/lib/data-policy/content";

/**
 * The public data page, rendered statically (same convention as the other UI
 * suites: react-dom/server, no jsdom).
 *
 * The point of these assertions is honesty, not aesthetics: the page must name
 * every event the code records, must not claim to collect anything it doesn't,
 * and must not promise automated deletion or a retention period that does not
 * exist.
 */

const html = renderToStaticMarkup(<DataPolicyPage />).replace(/<!--[\s\S]*?-->/g, "");

describe("data policy page — what is actually collected", () => {
  it("has the Persian title and the warm شما register", () => {
    expect(metadata.title).toContain("حریم خصوصی و داده‌ها");
    expect(html).toContain("داده‌ی شما، شفاف و کم");
    expect(html).toContain("پاسخ‌های شما به ۱۰ سؤال");
  });

  it("names every canonical analytics event", () => {
    // The label map is exhaustive by type, so this cannot drift from the
    // contract in lib/analytics/types.ts.
    expect(Object.keys(EVENT_LABELS).sort()).toEqual([...ANALYTICS_EVENT_TYPES].sort());

    for (const eventType of ANALYTICS_EVENT_TYPES) {
      expect(html).toContain(EVENT_LABELS[eventType]);
    }

    // Batch 1's widget impression is a real event and must be visible here.
    expect(html).toContain("باز شدن ویجت");
  });

  it("says the profile is computed from the answers and the token is anonymous", () => {
    expect(html).toContain("پروفایل عطری ۹محوره");
    expect(html).toContain("توکن نشست ناشناس");
    expect(html).toContain("حافظهٔ همان تب مرورگر");
  });

  it("claims no data category the code does not collect", () => {
    const collected = COLLECTED_DATA.map((item) => `${item.title} ${item.detail}`).join(" ");

    for (const term of NOT_COLLECTED) {
      expect(collected, `the collected-data copy mentions ${term}`).not.toContain(term);
    }
  });

  it("lists the categories it never asks for", () => {
    for (const term of NOT_COLLECTED) {
      expect(html, `${term} is missing from the never-collected list`).toContain(term);
    }
  });
});

describe("data policy page — who sees what, and honesty limits", () => {
  it("states that each store sees only its own aggregate report", () => {
    expect(html).toContain("گزارش تجمیعی خودش");
    expect(html).toContain("پاسخ‌های فردی");
  });

  it("does not promise automation or a retention period that does not exist", () => {
    // Export/deletion is on request; no self-serve mechanism, no promised period.
    expect(html).toContain("به‌صورت درخواستی");
    expect(html).not.toContain("خودکار حذف می‌شود");
    for (const duration of ["۳۰ روز", "۹۰ روز", "یک سال", "۶ ماه"]) {
      expect(html).not.toContain(duration);
    }
  });

  it("offers the same public contact address as /about", () => {
    expect(CONTACT_EMAIL).toBe("majid@fiage.ir");
    expect(html).toContain(`mailto:${CONTACT_EMAIL}`);
  });
});
