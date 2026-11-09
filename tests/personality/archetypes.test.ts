import { describe, expect, it } from "vitest";

import {
  ARCHETYPES,
  getArchetypeById,
  nearestArchetype,
  splitEmphasis,
  squaredDistance,
} from "@/lib/personality/archetypes";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { ArchetypeId, PersonalityVector } from "@/types/personality";

const EXPECTED_IDS: ArchetypeId[] = [
  "mysterious-explorer",
  "clean-minimalist",
  "charismatic",
  "elegant-classic",
  "free-spirit",
  "romantic",
  "bold-one",
  "sophisticated",
];

const PERSIAN_TEXT = /[\u0600-\u06FF]/;

/** Surfaces the accents render on: cream CTA text, ink card text. */
const CREAM = "#faf7f2";
const INK = "#2a2420";

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The card wash: `color-mix(in srgb, accent 14%, white)` as sRGB lerp. */
function washOf(accent: string): string {
  const [ar, ag, ab] = channels(accent);
  const mix = (v: number): string =>
    Math.round((v * 0.14 + 1 * 0.86) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(ar)}${mix(ag)}${mix(ab)}`;
}

function vectorOf(value: number): PersonalityVector {
  return Object.fromEntries(
    PERSONALITY_DIMENSIONS.map((dimension) => [dimension, value]),
  ) as PersonalityVector;
}

describe("archetypes", () => {
  it("ships the 8 documented archetypes with unique ids", () => {
    expect(ARCHETYPES).toHaveLength(8);
    expect(ARCHETYPES.map((archetype) => archetype.id)).toEqual(EXPECTED_IDS);
  });

  it("names every archetype after its emblem symbol (nouns, not adjectives)", () => {
    const expected: Array<[ArchetypeId, string, string]> = [
      ["mysterious-explorer", "ماه", "The Moon"],
      ["clean-minimalist", "قطره", "The Droplet"],
      ["charismatic", "خورشید", "The Sun"],
      ["elegant-classic", "الماس", "The Diamond"],
      ["free-spirit", "پر", "The Feather"],
      ["romantic", "رز", "The Rose"],
      ["bold-one", "شعله", "The Flame"],
      ["sophisticated", "تاج", "The Crown"],
    ];

    for (const [id, label, name] of expected) {
      const archetype = getArchetypeById(id)!;
      expect(archetype.label).toBe(label);
      expect(archetype.name).toBe(name);
    }
  });

  it("gives every archetype a valid accent color", () => {
    for (const archetype of ARCHETYPES) {
      expect(archetype.accentColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("keeps saturated jewel-tone accents readable (WCAG AA on both surfaces)", () => {
    // CTA buttons set cream text on the raw accent; the card wash mixes the
    // accent at 14% over white behind ink text. Both pairs must stay AA.
    for (const archetype of ARCHETYPES) {
      expect(contrastRatio(archetype.accentColor, CREAM)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrastRatio(washOf(archetype.accentColor), INK),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("gives every archetype Persian copy and an emoji badge", () => {
    for (const archetype of ARCHETYPES) {
      expect(archetype.name.length).toBeGreaterThan(0);
      expect(archetype.label).toMatch(PERSIAN_TEXT);
      expect(archetype.description).toMatch(PERSIAN_TEXT);
      expect(archetype.fragranceHint).toMatch(PERSIAN_TEXT);
      expect(archetype.emoji.length).toBeGreaterThan(0);
    }
  });

  it("keeps every centroid inside the 0–100 space with all 9 dimensions", () => {
    for (const archetype of ARCHETYPES) {
      expect(Object.keys(archetype.centroid).sort()).toEqual(
        [...PERSONALITY_DIMENSIONS].sort(),
      );

      for (const dimension of PERSONALITY_DIMENSIONS) {
        const value = archetype.centroid[dimension];
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("labels every centroid with its own archetype (self-identifying table)", () => {
    for (const archetype of ARCHETYPES) {
      expect(nearestArchetype(archetype.centroid).id).toBe(archetype.id);
    }
  });

  it("always returns an archetype for any 0–100 vector", () => {
    expect(EXPECTED_IDS).toContain(nearestArchetype(vectorOf(0)).id);
    expect(EXPECTED_IDS).toContain(nearestArchetype(vectorOf(100)).id);
    expect(EXPECTED_IDS).toContain(nearestArchetype(vectorOf(50)).id);
  });

  it("is stable across repeated calls with equal vectors", () => {
    const vector = ARCHETYPES[3].centroid;
    expect(nearestArchetype({ ...vector })).toBe(nearestArchetype(vector));
  });

  it("lists 3–4 emphasis words per archetype, each exactly once in its own copy", () => {
    for (const archetype of ARCHETYPES) {
      expect(archetype.emphasisWords.length).toBeGreaterThanOrEqual(3);
      expect(archetype.emphasisWords.length).toBeLessThanOrEqual(4);

      for (const word of archetype.emphasisWords) {
        // Counted as occurrences of the exact stored substring: a word that is
        // not in the description, or repeats in it, fails here.
        const occurrences = archetype.description.split(word).length - 1;
        expect(occurrences, `${archetype.id}: «${word}» occurs ${occurrences}×`).toBe(1);
      }
    }
  });

  it("keeps the words non-nested, so no emphasis can swallow another", () => {
    for (const archetype of ARCHETYPES) {
      for (const word of archetype.emphasisWords) {
        for (const other of archetype.emphasisWords) {
          if (word === other) continue;
          expect(other.includes(word), `${archetype.id}: «${word}» inside «${other}»`).toBe(
            false,
          );
        }
      }
    }
  });

  it("rejoins the split segments into the description byte-for-byte", () => {
    for (const archetype of ARCHETYPES) {
      const segments = splitEmphasis(archetype.description, archetype.emphasisWords);

      // Presentation only: emphasis never rewrites the copy.
      expect(segments.map((segment) => segment.text).join("")).toBe(archetype.description);
      expect(
        segments
          .filter((segment) => segment.emphasized)
          .map((segment) => segment.text)
          .sort(),
      ).toEqual([...archetype.emphasisWords].sort());
      // No empty run, so the renderer never emits an empty band or a stray span.
      for (const segment of segments) expect(segment.text.length).toBeGreaterThan(0);
    }
  });

  it("splits by position, leaves unlisted text whole, and survives empty input", () => {
    const description = "الف ب پ";

    expect(splitEmphasis(description, [])).toEqual([
      { text: description, emphasized: false },
    ]);
    expect(splitEmphasis(description, ["نیست"])).toEqual([
      { text: description, emphasized: false },
    ]);
    expect(splitEmphasis("", ["الف"])).toEqual([]);
    // Declared out of order: the earliest occurrence still comes first.
    expect(splitEmphasis(description, ["ب", "الف"]).map((s) => s.text)).toEqual([
      "الف",
      " ",
      "ب",
      " پ",
    ]);
  });

  it("measures distance symmetrically and looks archetypes up by id", () => {
    const first = ARCHETYPES[0].centroid;
    const second = ARCHETYPES[1].centroid;

    expect(squaredDistance(first, second)).toBe(squaredDistance(second, first));
    expect(squaredDistance(first, first)).toBe(0);
    expect(squaredDistance(first, second)).toBeGreaterThan(0);

    expect(getArchetypeById("romantic")?.name).toBe("The Rose");
    expect(getArchetypeById("not-an-archetype")).toBeUndefined();
  });
});
