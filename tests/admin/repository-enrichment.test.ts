import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPerfumeForStore, updatePerfumeForStore } from "@/lib/admin/repository";
import { STORE_CURRENCY } from "@/lib/pricing/currency";
import type { AIProvider, AiPerfumeProfileInput, AiPerfumeProfileResult } from "@/lib/ai/provider";
import type { AdminPerfumeInput } from "@/lib/admin/validation";

/**
 * Entry-point tests for the reference-first enrichment wired into the admin
 * repository (create path) and the provenance-preservation rules on update.
 *
 * The reference catalog is REAL (bundled dataset): "Dior Sauvage" is a known
 * exact entry, so the HIT scenario needs no lookup mock. The AI provider is
 * injected by the repository through `createAIProvider`, which is mocked here
 * so a MISS can exercise the deterministic AI fallback without network.
 */

const providerMocks = vi.hoisted(() => ({
  createAIProvider: vi.fn(),
}));

vi.mock("@/lib/ai/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/provider")>();
  return { ...actual, createAIProvider: providerMocks.createAIProvider };
});

const mocks = vi.hoisted(() => ({
  perfumeCreate: vi.fn(),
  perfumeFindFirst: vi.fn(),
  perfumeUpdate: vi.fn(),
  transaction: vi.fn(),
  fragranceProfileUpsert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    perfume: {
      create: mocks.perfumeCreate,
      findFirst: mocks.perfumeFindFirst,
      update: mocks.perfumeUpdate,
    },
    fragranceProfile: { upsert: mocks.fragranceProfileUpsert },
    $transaction: mocks.transaction,
  }),
}));

/** A compliant AI provider fake returning mappable structured scent data. */
function makeAvailableProvider(): AIProvider {
  return {
    id: "fake",
    isAvailable: () => true,
    unavailableReason: () => null,
    generatePerfumeProfile: vi.fn(async (
      _input: AiPerfumeProfileInput,
    ): Promise<AiPerfumeProfileResult> => ({
      perfumeId: _input.perfumeId,
      // Only legal descriptors — `fresh`/`warm` etc. are read-only matching
      // axes the Phase 4 validator would reject, exactly as for a hostile or
      // forgetful real provider.
      descriptors: { woody: 80, spicy: 65, citrus: 70 },
      family: "woody spicy",
      notes: ["عود", "چوب صندل"],
    })),
    generateRecommendationExplanation: vi.fn(),
  };
}

/** Unavailable provider — mirrors the circuit-open/missing-key fallback. */
function makeUnavailableProvider(): AIProvider {
  return {
    id: "unavailable",
    isAvailable: () => false,
    unavailableReason: () => "not configured",
    generatePerfumeProfile: vi.fn(async () => {
      throw new Error("unavailable");
    }),
    generateRecommendationExplanation: vi.fn(async () => {
      throw new Error("unavailable");
    }),
  };
}

const BASE_INPUT: AdminPerfumeInput = {
  name: "Sauvage",
  brand: "Dior",
  gender: "MEN",
  inStock: true,
  active: true,
  profile: {
    matching: {
      social: 50, adventurous: 50, expressive: 50, mysterious: 50, fresh: 50,
      warm: 50, experimental: 50, elegant: 50, bold: 50,
    },
    descriptors: {},
    notes: [],
  },
};

function inputWith(overrides: Partial<AdminPerfumeInput> = {}): AdminPerfumeInput {
  return {
    ...BASE_INPUT,
    ...overrides,
    profile: { ...BASE_INPUT.profile, ...(overrides.profile ?? {}) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.perfumeCreate.mockResolvedValue({ id: "new-id" });
  mocks.fragranceProfileUpsert.mockResolvedValue({});
  // Handles BOTH Prisma transaction forms: the interactive callback
  // (create path) and the promise array (update path).
  mocks.transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      const tx = { perfume: { create: mocks.perfumeCreate } };
      return (arg as (tx: unknown) => Promise<unknown>)(tx);
    }
    return undefined; // array form: statements already dispatched
  });
  mocks.perfumeUpdate.mockResolvedValue({ id: "p-1" });
});

describe("createPerfumeForStore — reference-first enrichment (entry point)", () => {
  it("reference HIT: persists deterministic REFERENCE axes with ZERO AI calls", async () => {
    const provider = makeAvailableProvider();
    providerMocks.createAIProvider.mockReturnValue(provider);

    const result = await createPerfumeForStore("store-1", inputWith());

    expect(result.ok).toBe(true);
    expect(provider.generatePerfumeProfile).not.toHaveBeenCalled();

    const profile = mocks.perfumeCreate.mock.calls[0][0].data.profile.create;
    expect(profile.profileSource).toBe("REFERENCE");
    // Deterministic axes from the Sauvage accords — not the untouched 50s and
    // not a fabricated fill: fresh comes from the fresh-spicy/citrus accords.
    expect(profile.fresh).not.toBe(50);
    expect(profile.social).toBe(40); // personality-only axis: documented neutral
    expect(profile.family).toBe("fresh spicy"); // strongest accord
  });

  it("reference MISS with available AI: falls back to AI + deterministic axes", async () => {
    const provider = makeAvailableProvider();
    providerMocks.createAIProvider.mockReturnValue(provider);

    const result = await createPerfumeForStore(
      "store-1",
      inputWith({ name: "Totally Unknown Scent", brand: "No Such House" }),
    );

    expect(result.ok).toBe(true);
    expect(provider.generatePerfumeProfile).toHaveBeenCalledTimes(1);

    const profile = mocks.perfumeCreate.mock.calls[0][0].data.profile.create;
    expect(profile.profileSource).toBe("AI");
    // Deterministically derived from the AI's structured data via
    // `deriveAxesFromAiStructuredData` (woody→warm/bold/elegant, spicy→warm/bold,
    // citrus→fresh) — never the model's own axis values.
    expect(profile.fresh).not.toBe(50);
    expect(profile.social).toBe(40); // personality-only axis: documented neutral
    expect(profile.woody).toBe(80); // AI descriptor filled fill-only
  });

  it("reference MISS with UNAVAILABLE AI: keeps the merchant's MANUAL payload", async () => {
    const provider = makeUnavailableProvider();
    providerMocks.createAIProvider.mockReturnValue(provider);

    const input = inputWith({
      name: "Totally Unknown Scent",
      brand: "No Such House",
      profile: {
        ...BASE_INPUT.profile,
        matching: {
          social: 70, adventurous: 60, expressive: 55, mysterious: 45, fresh: 30,
          warm: 80, experimental: 40, elegant: 65, bold: 75,
        },
        descriptors: { woody: 90 },
        family: "woody",
        notes: ["عود"],
      },
    });

    const result = await createPerfumeForStore("store-1", input);

    expect(result.ok).toBe(true);
    expect(provider.generatePerfumeProfile).toHaveBeenCalledTimes(1);

    const profile = mocks.perfumeCreate.mock.calls[0][0].data.profile.create;
    expect(profile.profileSource).toBe("MANUAL");
    // The merchant's own authored values — never a fabricated 0/50 vector.
    expect(profile.social).toBe(70);
    expect(profile.warm).toBe(80);
    expect(profile.woody).toBe(90);
    expect(profile.family).toBe("woody");
  });

  it("merchant-authored axes with available AI: MANUAL wins, no enrichment overwrite", async () => {
    const provider = makeAvailableProvider();
    providerMocks.createAIProvider.mockReturnValue(provider);

    const input = inputWith({
      name: "Sauvage", // reference HIT identity, but merchant authored axes
      profile: {
        ...BASE_INPUT.profile,
        matching: {
          social: 70, adventurous: 60, expressive: 55, mysterious: 45, fresh: 30,
          warm: 80, experimental: 40, elegant: 65, bold: 75,
        },
      },
    });

    const result = await createPerfumeForStore("store-1", input);

    expect(result.ok).toBe(true);
    // Reference HIT costs no AI even when the merchant authored the axes.
    expect(provider.generatePerfumeProfile).not.toHaveBeenCalled();

    const profile = mocks.perfumeCreate.mock.calls[0][0].data.profile.create;
    expect(profile.profileSource).toBe("MANUAL");
    expect(profile.social).toBe(70);
    expect(profile.fresh).toBe(30);
    expect(profile.warm).toBe(80);
  });

  it("merchant descriptors/family/notes are fill-only preserved on a reference HIT", async () => {
    const provider = makeAvailableProvider();
    providerMocks.createAIProvider.mockReturnValue(provider);

    const input = inputWith({
      profile: {
        ...BASE_INPUT.profile,
        descriptors: { woody: 85 },
        family: "my own family",
        notes: ["برگ نعناع"],
      },
    });

    await createPerfumeForStore("store-1", input);

    const profile = mocks.perfumeCreate.mock.calls[0][0].data.profile.create;
    expect(profile.profileSource).toBe("REFERENCE");
    // Merchant's non-zero descriptor / non-empty family / notes win fill-only.
    expect(profile.woody).toBe(85);
    expect(profile.family).toBe("my own family");
    expect(profile.notes).toEqual(["برگ نعناع"]);
  });
});

describe("updatePerfumeForStore — provenance preservation (no silent relabel)", () => {
  function makeExisting(profileSource: "MANUAL" | "REFERENCE" | "AI" | null) {
    mocks.perfumeFindFirst.mockResolvedValue({
      id: "p-1",
      profile: profileSource === null ? null : { profileSource },
    });
  }

  it("existing MANUAL profile stays MANUAL after an edit", async () => {
    makeExisting("MANUAL");
    const provider = makeAvailableProvider();
    providerMocks.createAIProvider.mockReturnValue(provider);

    const result = await updatePerfumeForStore("p-1", "store-1", inputWith());

    expect(result.ok).toBe(true);
    expect(mocks.fragranceProfileUpsert).toHaveBeenCalledTimes(1);

    const arg = mocks.fragranceProfileUpsert.mock.calls[0][0];
    expect(arg.update.profileSource).toBe("MANUAL");
    expect(arg.create.profileSource).toBe("MANUAL");
  });

  it("existing REFERENCE profile keeps REFERENCE provenance after an edit", async () => {
    makeExisting("REFERENCE");
    const provider = makeAvailableProvider();
    providerMocks.createAIProvider.mockReturnValue(provider);

    await updatePerfumeForStore("p-1", "store-1", inputWith());

    const arg = mocks.fragranceProfileUpsert.mock.calls[0][0];
    expect(arg.update.profileSource).toBe("REFERENCE");
    expect(arg.create.profileSource).toBe("REFERENCE");
  });

  it("existing AI profile keeps AI provenance after an edit", async () => {
    makeExisting("AI");
    const provider = makeAvailableProvider();
    providerMocks.createAIProvider.mockReturnValue(provider);

    await updatePerfumeForStore("p-1", "store-1", inputWith());

    const arg = mocks.fragranceProfileUpsert.mock.calls[0][0];
    expect(arg.update.profileSource).toBe("AI");
  });

  it("profile-less perfume edit creates a MANUAL profile (no silent enrichment)", async () => {
    makeExisting(null);
    const provider = makeAvailableProvider();
    providerMocks.createAIProvider.mockReturnValue(provider);

    await updatePerfumeForStore("p-1", "store-1", inputWith());

    const arg = mocks.fragranceProfileUpsert.mock.calls[0][0];
    expect(arg.create.profileSource).toBe("MANUAL");
  });
});

/**
 * The currency unit is an invariant of every price-bearing write.
 *
 * The regression this guards: a write that omits `currency` silently inherits
 * the database column default. Testing the ACTUAL write payloads (not a grep)
 * is what makes a future refactor that drops the field fail here.
 */
describe("canonical currency on price-bearing writes", () => {
  const PRICE = 38700000;

  it("create asserts the canonical unit explicitly and never converts the amount", async () => {
    providerMocks.createAIProvider.mockReturnValue(makeAvailableProvider());

    await createPerfumeForStore("store-1", inputWith({ price: PRICE }));

    const data = mocks.perfumeCreate.mock.calls[0][0].data;

    expect(data.currency).toBe(STORE_CURRENCY);
    expect(data.currency).not.toBe("IRR");
    // Stored verbatim — no ×10 Toman/Rial transformation.
    expect(data.price).toBe(PRICE);
  });

  it("a price-bearing update re-asserts the canonical unit", async () => {
    mocks.perfumeFindFirst.mockResolvedValue({ id: "p-1", profile: { profileSource: "MANUAL" } });
    providerMocks.createAIProvider.mockReturnValue(makeAvailableProvider());

    await updatePerfumeForStore("p-1", "store-1", inputWith({ price: PRICE }));

    const data = mocks.perfumeUpdate.mock.calls[0][0].data;

    expect(data.currency).toBe(STORE_CURRENCY);
    expect(data.currency).not.toBe("IRR");
    expect(data.price).toBe(PRICE);
  });

  it("never leaves currency undefined on a create (no reliance on the DB default)", async () => {
    providerMocks.createAIProvider.mockReturnValue(makeAvailableProvider());

    await createPerfumeForStore("store-1", inputWith());

    expect(mocks.perfumeCreate.mock.calls[0][0].data.currency).toBeDefined();
    expect(mocks.perfumeCreate.mock.calls[0][0].data.currency).toBe(STORE_CURRENCY);
  });
});
