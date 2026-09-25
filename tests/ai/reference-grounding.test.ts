import { describe, expect, it } from "vitest";

import {
  buildProfileUserPrompt,
  buildReferenceGrounding,
} from "@/lib/ai/perfume-profile";
import { makeProfileInput } from "./fixtures";
import type { FragranceReferenceEntry } from "@/lib/ai/reference-lookup";

const REFERENCE: FragranceReferenceEntry = {
  b: "Dior",
  n: "Sauvage",
  g: "MEN",
  t: ["calabrian bergamot", "pepper", "ambroxan", "labdanum", "vanilla"],
  a: ["fresh spicy", "amber", "citrus"],
  y: "2015",
};

describe("buildReferenceGrounding", () => {
  it("formats accords, notes and year for a matched entry", () => {
    const grounding = buildReferenceGrounding(REFERENCE);

    expect(grounding).toContain("Main accords: fresh spicy, amber, citrus");
    expect(grounding).toContain("calabrian bergamot");
    expect(grounding).toContain("Release year: 2015");
    expect(grounding).toContain("Verified reference data");
  });

  it("returns null for no match (and omits the year line when absent)", () => {
    expect(buildReferenceGrounding(null)).toBeNull();
    expect(buildReferenceGrounding(undefined)).toBeNull();

    const noYear = buildReferenceGrounding({ ...REFERENCE, y: null });
    expect(noYear).not.toContain("Release year");
  });

  it("caps notes and accords to bounded lengths", () => {
    const huge: FragranceReferenceEntry = {
      ...REFERENCE,
      t: Array.from({ length: 30 }, (_value, index) => `note ${index}`),
      a: Array.from({ length: 10 }, (_value, index) => `accord ${index}`),
    };

    const grounding = buildReferenceGrounding(huge)!;
    expect(grounding).not.toContain("note 8");
    expect(grounding).not.toContain("accord 5");
    expect(grounding).toContain("note 7");
    expect(grounding).toContain("accord 4");
  });
});

describe("buildProfileUserPrompt with grounding", () => {
  it("includes the grounding block when a reference match exists", () => {
    const prompt = buildProfileUserPrompt(makeProfileInput(), REFERENCE);

    expect(prompt).toContain("Verified reference data");
    expect(prompt).toContain("Main accords: fresh spicy, amber, citrus");
    // Grounding sits before the final JSON-shape instruction.
    expect(prompt.indexOf("Verified reference data")).toBeLessThan(
      prompt.indexOf("Return JSON like"),
    );
  });

  it("is byte-identical to the non-grounded prompt when no match exists", () => {
    const input = makeProfileInput();

    expect(buildProfileUserPrompt(input, null)).toBe(buildProfileUserPrompt(input));
    expect(buildProfileUserPrompt(input, undefined)).toBe(buildProfileUserPrompt(input));
  });

  it("keeps the output contract intact: grounding never changes the JSON instruction", () => {
    const grounded = buildProfileUserPrompt(makeProfileInput(), REFERENCE);
    const plain = buildProfileUserPrompt(makeProfileInput());

    // The closing instruction and the read-only matching axes line are unchanged.
    expect(grounded.endsWith(plain.split("\n").pop()!)).toBe(true);
    expect(grounded).toContain("Reference profile (read-only, do not repeat or change)");
  });
});
