import { describe, expect, it } from "vitest";

import { metadata as accessMetadata } from "@/app/admin/access/page";
import { metadata as analyticsMetadata } from "@/app/admin/analytics/page";
import { metadata as perfumesMetadata } from "@/app/admin/perfumes/page";

/**
 * Admin tab titles (batch 63).
 *
 * Batch 60 finished the شما pass on shopper-facing copy but left these three
 * metadata titles on the old «عطر خودتو پیدا کن» string. They are admin-only
 * and noindex, yet they are what the owner reads in his own browser tabs, so
 * they follow the same voice as everything else.
 */
const TITLES = [
  { page: "access", title: accessMetadata.title },
  { page: "analytics", title: analyticsMetadata.title },
  { page: "perfumes", title: perfumesMetadata.title },
];

describe("admin page titles", () => {
  it("address the owner with شما, not تو", () => {
    expect(accessMetadata.title).toBe("ورود مدیریت | عطر خودتون رو پیدا کنید");
    expect(analyticsMetadata.title).toBe("تحلیل عملکرد | عطر خودتون رو پیدا کنید");
    expect(perfumesMetadata.title).toBe("مدیریت عطرها | عطر خودتون رو پیدا کنید");
  });

  it("keeps each admin prefix", () => {
    expect(accessMetadata.title).toContain("ورود مدیریت | ");
    expect(analyticsMetadata.title).toContain("تحلیل عملکرد | ");
    expect(perfumesMetadata.title).toContain("مدیریت عطرها | ");
  });

  it("has left no joined تو form in any title", () => {
    for (const { page, title } of TITLES) {
      expect(String(title), page).not.toContain("خودتو پیدا");
    }
  });
});
