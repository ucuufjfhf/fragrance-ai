import { describe, expect, it } from "vitest";

import { formatPersianPercent, formatPersianScore, toPersianDigits } from "@/lib/persian";

/**
 * The number on a recommendation card is the engine's normalised
 * inverse-distance presentation score, not a share of anything. Majid's
 * 2026-11-08 decision: show it as a whole-number closeness index («شاخص
 * نزدیکی») with no percent sign and no decimal, while genuine percentages keep
 * using `formatPersianPercent`.
 */
describe("formatPersianScore", () => {
  it("rounds to a whole number and renders Persian digits", () => {
    expect(formatPersianScore(92.4)).toBe("۹۲");
    expect(formatPersianScore(92.5)).toBe("۹۳");
    expect(formatPersianScore(78.2)).toBe("۷۸");
    expect(formatPersianScore(100)).toBe("۱۰۰");
    expect(formatPersianScore(0)).toBe("۰");
  });

  it("carries neither a percent sign nor a decimal separator", () => {
    for (const value of [0, 64, 78.2, 91.4, 92.4, 92.5, 99.9, 100]) {
      const formatted = formatPersianScore(value);

      expect(formatted).not.toContain("٪");
      expect(formatted).not.toContain("٫");
      expect(formatted).not.toContain(".");
      expect(formatted).toMatch(/^[۰-۹]+$/);
    }
  });

  it("leaves the genuine-percentage helper alone", () => {
    // Quiz progress, trait bars and admin/report KPIs are real percentages.
    expect(formatPersianPercent(35)).toBe("۳۵٪");
    expect(toPersianDigits(92)).toBe("۹۲");
  });
});
