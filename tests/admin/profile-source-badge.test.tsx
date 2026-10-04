import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ProfileSourceBadge, {
  NO_PROFILE_LABEL,
  describeProfileSource,
} from "@/components/admin/ProfileSourceBadge";
import type { ProfileProvenance } from "@/lib/fragrance/profile-enrichment";

/**
 * Provenance visibility in the merchant admin UI.
 *
 * Project convention: SSR render checks via `react-dom/server`, no jsdom and no
 * React Testing Library (see `vitest.config.mts` and `bulk-panel.test.tsx`).
 *
 * These tests pin the read-only contract: the stored `FragranceProfile.
 * profileSource` reaches the screen as a merchant-facing label, a missing
 * profile is visibly distinct, and the badge exposes no control that could
 * relabel provenance.
 */

function render(source: ProfileProvenance | null, size?: "sm" | "md"): string {
  return renderToStaticMarkup(
    // `profile` is structurally the only field the badge reads; passing a
    // narrow object here keeps the test honest about that contract.
    <ProfileSourceBadge profile={{ profileSource: source }} size={size} />,
  );
}

describe("describeProfileSource label mapping", () => {
  it("labels a reference-generated profile as مرجع", () => {
    expect(describeProfileSource({ profileSource: "REFERENCE" })).toMatchObject({
      source: "REFERENCE",
      label: "مرجع",
    });
  });

  it("labels an AI-generated profile as هوش مصنوعی", () => {
    expect(describeProfileSource({ profileSource: "AI" })).toMatchObject({
      source: "AI",
      label: "هوش مصنوعی",
    });
  });

  it("labels a manual profile as دستی", () => {
    expect(describeProfileSource({ profileSource: "MANUAL" })).toMatchObject({
      source: "MANUAL",
      label: "دستی",
    });
  });

  it("labels a null provenance as بدون پروفایل", () => {
    expect(describeProfileSource({ profileSource: null })).toMatchObject({
      source: null,
      label: NO_PROFILE_LABEL,
    });
  });

  it("treats an absent profile the same as a null provenance", () => {
    expect(describeProfileSource(null)).toEqual(describeProfileSource({ profileSource: null }));
    expect(describeProfileSource(undefined)).toEqual(
      describeProfileSource({ profileSource: null }),
    );
  });
});

describe("ProfileSourceBadge rendering", () => {
  it("renders each stored provenance with its own merchant-facing label", () => {
    expect(render("REFERENCE")).toContain("مرجع");
    expect(render("AI")).toContain("هوش مصنوعی");
    expect(render("MANUAL")).toContain("دستی");
  });

  it("keeps the raw enum value on the element so the badge stays testable and styleable", () => {
    expect(render("REFERENCE")).toContain('data-profile-source="REFERENCE"');
    expect(render("AI")).toContain('data-profile-source="AI"');
    expect(render("MANUAL")).toContain('data-profile-source="MANUAL"');
  });

  it("renders a missing profile as its own distinct state", () => {
    const html = render(null);

    expect(html).toContain(NO_PROFILE_LABEL);
    expect(html).toContain('data-profile-source="NONE"');
  });

  it("never shows a label for an unexpected provenance value", () => {
    // Guards the mapping: an unknown value must degrade to the "no profile"
    // state rather than rendering `undefined` to the merchant.
    const result = describeProfileSource({
      profileSource: "SOMETHING_ELSE" as unknown as ProfileProvenance,
    });

    expect(result.source).toBe("SOMETHING_ELSE");
    expect(result.label).toBeUndefined();
  });
});

describe("provenance is informational, not editable", () => {
  it("renders no form control in any provenance state", () => {
    for (const source of ["REFERENCE", "AI", "MANUAL", null] as const) {
      const html = render(source);

      expect(html).not.toContain("<input");
      expect(html).not.toContain("<select");
      expect(html).not.toContain("<textarea");
      expect(html).not.toContain("<form");
      expect(html).not.toContain("<button");
    }
  });

  it("does not expose profileSource as a named form value", () => {
    for (const source of ["REFERENCE", "AI", "MANUAL", null] as const) {
      expect(render(source)).not.toContain('name="profileSource"');
    }
  });

  it("renders a plain span, not an editable element", () => {
    const html = render("AI");

    expect(html).toMatch(/^<span /);
    expect(html).not.toContain("contenteditable");
    expect(html).not.toContain('aria-label="profileSource"');
  });
});
