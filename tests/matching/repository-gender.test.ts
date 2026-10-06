import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROFILE_AXES } from "@/lib/fragrance/profile";
import type { PersonalityVector } from "@/types/personality";

/**
 * The audience filter only works if the candidate data actually carries the
 * perfume's gender. The repository is the one place the matching flow touches
 * Prisma, so it is mocked here (no DB) and the QUERY is asserted: `gender` must
 * be selected and mapped through, while every eligibility field the engine
 * already relied on stays exactly as it was.
 */

const mocks = vi.hoisted(() => ({ perfumeFindMany: vi.fn() }));

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({ perfume: { findMany: mocks.perfumeFindMany } }),
}));

import { getEligiblePerfumesForStore } from "@/lib/matching/repository";

const flat = (value = 50): PersonalityVector =>
  Object.fromEntries(PROFILE_AXES.map((axis) => [axis, value])) as PersonalityVector;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("matching repository — audience data exposure", () => {
  it("selects the perfume gender for the engine's eligibility check", async () => {
    mocks.perfumeFindMany.mockResolvedValue([]);

    await getEligiblePerfumesForStore("store-a");

    expect(mocks.perfumeFindMany).toHaveBeenCalledTimes(1);

    const [args] = mocks.perfumeFindMany.mock.calls[0] as [
      {
        where: Record<string, unknown>;
        select: {
          gender: boolean;
          inStock: boolean;
          active: boolean;
          profile: { select: Record<string, boolean> };
        };
      },
    ];

    expect(args.where).toEqual({ storeId: "store-a", active: true });
    expect(args.select.gender).toBe(true);

    // Unchanged eligibility data the engine already depended on.
    expect(args.select.inStock).toBe(true);
    expect(args.select.active).toBe(true);
    for (const axis of PROFILE_AXES) {
      expect(args.select.profile.select[axis]).toBe(true);
    }
  });

  it("maps the row gender through to the candidate, never inventing one", async () => {
    mocks.perfumeFindMany.mockResolvedValue([
      {
        id: "p-women",
        storeId: "store-a",
        name: "عطر نمونه",
        brand: "برند نمونه",
        slug: null,
        productUrl: null,
        imageUrl: null,
        inStock: true,
        active: true,
        gender: "WOMEN",
        description: null,
        profile: { ...flat(50), family: null, notes: [] },
      },
    ]);

    const candidates = await getEligiblePerfumesForStore("store-a");

    expect(candidates).toHaveLength(1);
    expect(candidates[0].gender).toBe("WOMEN");
    expect(candidates[0].active).toBe(true);
    expect(candidates[0].inStock).toBe(true);
  });
});
