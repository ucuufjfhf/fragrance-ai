import { describe, expect, it } from "vitest";

import {
  ARCHETYPES,
  getArchetypeById,
  nearestArchetype,
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

  it("measures distance symmetrically and looks archetypes up by id", () => {
    const first = ARCHETYPES[0].centroid;
    const second = ARCHETYPES[1].centroid;

    expect(squaredDistance(first, second)).toBe(squaredDistance(second, first));
    expect(squaredDistance(first, first)).toBe(0);
    expect(squaredDistance(first, second)).toBeGreaterThan(0);

    expect(getArchetypeById("romantic")?.name).toBe("The Romantic");
    expect(getArchetypeById("not-an-archetype")).toBeUndefined();
  });
});
