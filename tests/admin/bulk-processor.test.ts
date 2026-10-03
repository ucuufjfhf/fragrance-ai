import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AiRequestError,
  AiUnavailableError,
} from "@/lib/ai/errors";
import type { AIProvider } from "@/lib/ai/provider";
import { processBulkProfileChunk } from "@/lib/admin/bulk/processor";
import { PROFILE_AXES } from "@/lib/fragrance/profile";

/**
 * Phase 12.4 bulk processor tests (mocked Prisma — no live database), following
 * the established `vi.mock("@/lib/db")` + `vi.hoisted` harness of the suite.
 *
 * Deterministic under test by construction:
 *  - the AI provider is INJECTED (a fake — no network, no credentials);
 *  - sleep is INJECTED (delays are recorded, never awaited — no real waiting);
 *  - the clock is INJECTED (a scripted timeline for time-budget tests).
 *
 * Every database state change still goes through the genuine service
 * primitives, so these tests also exercise the 12.3 exactly-once / conditional
 * update behaviour the processor must orchestrate. Live-PostgreSQL race
 * coverage stays in `tests/admin/bulk-service.race.test.ts` (untouched).
 */

const TEST_STORE = "store-1";
const TEST_JOB = "job-1";

interface TestItem {
  id: string;
  jobId: string;
  perfumeId: string;
  status: string;
  attempts: number;
  rowNumber: number | null;
  stale: boolean;
}

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  jobUpdateMany: vi.fn(),
  itemFindFirst: vi.fn(),
  itemUpdateMany: vi.fn(),
  itemGroupBy: vi.fn(),
  perfumeFindFirst: vi.fn(),
  profileFindFirst: vi.fn(),
  profileUpsert: vi.fn(),
  transaction: vi.fn(),
  prisma: null as unknown,
}));

vi.mock("@/lib/db", () => {
  const p = {
    bulkProfileJob: {
      findFirst: mocks.jobFindFirst,
      updateMany: mocks.jobUpdateMany,
    },
    bulkProfileItem: {
      findFirst: mocks.itemFindFirst,
      updateMany: mocks.itemUpdateMany,
      groupBy: mocks.itemGroupBy,
    },
    perfume: { findFirst: mocks.perfumeFindFirst },
    fragranceProfile: {
      findFirst: mocks.profileFindFirst,
      upsert: mocks.profileUpsert,
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transaction(fn),
  };
  mocks.prisma = p;
  return { getPrisma: () => p };
});

/* ---------------------------------------------------------------- harness -- */

let items: Record<string, TestItem> = {};
let jobStatus = "PENDING";
let perfumeVisible = true;
let storedProfile: Record<string, unknown> | null = null;
let persistFails = false;
let perfumeName = "Test Perfume";
let perfumeBrand = "Test Brand";

/** Fake provider: records profile calls; each test scripts the replies. */
const profileReplies: Array<Promise<unknown>> = [];
const profileCalls: unknown[] = [];

function fakeProvider(): AIProvider {
  return {
    id: "fake",
    isAvailable: () => true,
    unavailableReason: () => null,
    generatePerfumeProfile: vi.fn(async (input: unknown) => {
      profileCalls.push(input);
      const next = profileReplies.shift();
      if (next === undefined) {
        throw new Error("no scripted profile reply");
      }
      return next;
    }),
    generateRecommendationExplanation: vi.fn(async () => {
      throw new Error("not scripted");
    }),
  } as unknown as AIProvider;
}

const recordedDelays: number[] = [];
const fakeSleep = vi.fn(async (ms: number) => {
  recordedDelays.push(ms);
});

const clockCalls: number[] = [];

/**
 * Structural view of one recorded single-argument mock call (lint-safe
 * alternative to inspecting untyped vitest calls with `any`): the fields the
 * harness predicates actually look at, nothing more.
 */
type CallView = {
  where?: { id?: string; status?: string; jobId?: string; storeId?: string };
  data?: {
    status?: string;
    errorCode?: string | null;
    attempts?: { increment?: number };
    heartbeatAt?: unknown;
  };
};

function scriptedClock(times: number[]): () => number {
  // State is closed over LOCALLY: creation must not mutate shared module state
  // (the default timeline is evaluated after the override argument inside
  // `chunk`, so shared creation-time state would wipe the override).
  let index = 0;
  clockCalls.length = 0;
  return () => {
    const value = times[Math.min(index, times.length - 1)];
    index += 1;
    clockCalls.push(value);
    return value;
  };
}

/** Valid structured profile reply the Phase 4 validator accepts. */
const validReply = (descriptors: Record<string, number>, extra: Record<string, unknown> = {}) =>
  Promise.resolve({ perfumeId: "p-1", descriptors, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  items = {};
  jobStatus = "PENDING";
  perfumeVisible = true;
  storedProfile = null;
  persistFails = false;
  perfumeName = "Test Perfume";
  perfumeBrand = "Test Brand";
  profileReplies.length = 0;
  profileCalls.length = 0;
  recordedDelays.length = 0;
  fakeSleep.mockClear();
  clockCalls.length = 0;

  // --- job: a status holder auto-advanced by genuine flips.
  mocks.jobFindFirst.mockImplementation(async (args: { where?: { id?: string; storeId?: string } }) => {
    if (args?.where?.storeId && args.where.storeId !== TEST_STORE) {
      return null;
    }
    return { id: TEST_JOB, status: jobStatus };
  });

  mocks.jobUpdateMany.mockImplementation(async (args: { where?: Record<string, unknown>; data?: Record<string, unknown> }) => {
    const data = args?.data ?? {};
    if (typeof data.status === "string") {
      jobStatus = data.status;
    }
    return { count: 1 };
  });

  // --- items: FIFO candidates, status holders, attempt counting, reclaim.
  mocks.itemFindFirst.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {};
    if (where.id === undefined) {
      // Claim candidate selection: first PENDING item of the job.
      if (where.status === "PENDING" && where.jobId === TEST_JOB) {
        const candidate = Object.values(items).find((item) => item.status === "PENDING");
        return candidate ? { id: candidate.id } : null;
      }
      return null;
    }
    const item = items[where.id as string];
    if (!item) {
      return null;
    }
    if (typeof where.status === "string" && item.status !== where.status) {
      return null;
    }
    return {
      id: item.id,
      jobId: item.jobId,
      perfumeId: item.perfumeId,
      attempts: item.attempts,
      status: item.status,
      rowNumber: item.rowNumber,
    };
  });

  mocks.itemUpdateMany.mockImplementation(async (args: { where?: Record<string, unknown>; data?: Record<string, unknown> }) => {
    const where = args?.where ?? {};
    const data = args?.data ?? {};

    // Batch stale reclaim (no id in the predicate): reclaim stale RUNNING items.
    if (where.id === undefined) {
      const stale = Object.values(items).filter(
        (item) => item.jobId === where.jobId && item.status === "RUNNING" && item.stale,
      );
      for (const item of stale) {
        item.status = "PENDING";
      }
      return { count: stale.length };
    }

    const item = items[where.id as string];
    if (!item) {
      return { count: 0 };
    }
    if (typeof where.status === "string" && item.status !== where.status) {
      return { count: 0 };
    }
    // Winner: apply the genuine predicate's data.
    if (typeof data.status === "string") {
      item.status = data.status;
    }
    const attempts = data.attempts as { increment?: number } | undefined;
    if (typeof attempts?.increment === "number") {
      item.attempts += attempts.increment;
    }
    if (data.heartbeatAt === null && data.status === "PENDING") {
      item.stale = false;
    }
    return { count: 1 };
  });

  mocks.itemGroupBy.mockImplementation(async () => {
    const counts: Record<string, number> = {};
    for (const item of Object.values(items)) {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
    }
    return Object.entries(counts).map(([status, c]) => ({ status, _count: { _all: c } }));
  });

  // --- probes.
  mocks.perfumeFindFirst.mockImplementation(async (args: { where?: { id?: string; storeId?: string } } | undefined) => {
    const where = args?.where ?? {};
    if (!perfumeVisible || (where.storeId && where.storeId !== TEST_STORE)) {
      return null;
    }
    const item = Object.values(items).find((candidate) => candidate.perfumeId === where.id);
    if (!item) {
      return null;
    }
    return { id: item.perfumeId, name: perfumeName, brand: perfumeBrand, description: null };
  });

  mocks.profileFindFirst.mockImplementation(async () => storedProfile);

  // --- transactions execute against the same mock client (interactive shape).
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    if (persistFails) {
      throw new Error("simulated persist failure");
    }
    return fn(mocks.prisma);
  });

  mocks.profileUpsert.mockResolvedValue({});
});

/** Seeds PENDING items in FIFO order, one per perfume id. */
function seedPendingItems(count: number): void {
  for (let index = 0; index < count; index += 1) {
    const id = `item-${index + 1}`;
    items[id] = {
      id,
      jobId: TEST_JOB,
      perfumeId: `p-${index + 1}`,
      status: "PENDING",
      attempts: 0,
      rowNumber: null,
      stale: false,
    };
  }
}

const chunk = (overrides: Partial<Parameters<typeof processBulkProfileChunk>[0]> = {}) =>
  processBulkProfileChunk({
    jobId: TEST_JOB,
    storeId: TEST_STORE,
    provider: fakeProvider(),
    sleep: fakeSleep,
    now: scriptedClock([0]),
    ...overrides,
  });

/* ------------------------------------------------------------------ tests -- */

describe("processBulkProfileChunk — basics", () => {
  it("processes one item successfully and completes the job honestly", async () => {
    seedPendingItems(1);
    profileReplies.push(validReply({ woody: 80 }));

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.processed).toBe(1);
      expect(result.chunk.succeeded).toBe(1);
      expect(result.chunk.failed).toBe(0);
      expect(result.chunk.remaining).toBe(0);
      expect(result.chunk.status).toBe("COMPLETED");
      expect(result.chunk.pausedForRateLimit).toBe(false);
      expect(result.chunk.timeBudgetExhausted).toBe(false);
    }
    expect(mocks.profileUpsert).toHaveBeenCalledTimes(1);
    expect(recordedDelays).toEqual([]);
  });

  it("processes multiple items sequentially (one claimed item at a time)", async () => {
    seedPendingItems(2);
    profileReplies.push(validReply({ sweet: 10 }), validReply({ woody: 20 }));

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.succeeded).toBe(2);
      expect(result.chunk.remaining).toBe(0);
      expect(result.chunk.status).toBe("COMPLETED");
    }
    // Sequential: each persist completes before the next AI call starts.
    expect(profileCalls).toHaveLength(2);
    expect(mocks.profileUpsert).toHaveBeenCalledTimes(2);
  });

  it("respects the chunk size cap of 10 and leaves the rest claimable", async () => {
    seedPendingItems(12);
    for (let index = 0; index < 10; index += 1) {
      profileReplies.push(validReply({ woody: 50 }));
    }

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.processed).toBe(10);
      expect(result.chunk.succeeded).toBe(10);
      expect(result.chunk.remaining).toBe(2);
      expect(result.chunk.status).toBe("RUNNING");
    }
    expect(profileCalls).toHaveLength(10);
  });

  it("stops when nothing is pending and reports an already-terminal job", async () => {
    seedPendingItems(0);
    jobStatus = "COMPLETED";

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.processed).toBe(0);
      expect(result.chunk.status).toBe("COMPLETED");
    }
    expect(profileCalls).toHaveLength(0);
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for a foreign job without touching anything", async () => {
    const result = await processBulkProfileChunk({
      jobId: TEST_JOB,
      storeId: "other-store",
      provider: fakeProvider(),
      sleep: fakeSleep,
      now: scriptedClock([0]),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_FOUND");
    }
    expect(profileCalls).toHaveLength(0);
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("starts a PENDING job and resumes a rate-limited job through the contract", async () => {
    seedPendingItems(1);
    jobStatus = "PAUSED_RATE_LIMITED";
    profileReplies.push(validReply({ woody: 70 }));

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.status).toBe("COMPLETED");
    }
    // The resume flip ran through startBulkProfileJob (PAUSED → RUNNING).
    const resumeFlip = mocks.jobUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "RUNNING",
    );
    expect(resumeFlip).toBeDefined();
  });
});

describe("processBulkProfileChunk — fill-only AI success semantics", () => {
  it("creates a brand-new profile with AI fields and DERIVED axes (never stamped 0)", async () => {
    seedPendingItems(1);
    storedProfile = null;
    profileReplies.push(
      validReply({ woody: 80, longevity: 70 }, { family: "woody amber", notes: ["عود", "چرم"] }),
    );

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.succeeded).toBe(1);
    }

    const upsertArgs = mocks.profileUpsert.mock.calls[0][0] as {
      where: { perfumeId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(upsertArgs.where.perfumeId).toBe("p-1");
    // create: eligible AI fields + deterministically DERIVED axes + notes [].
    expect(upsertArgs.create.woody).toBe(80);
    expect(upsertArgs.create.longevity).toBe(70);
    expect(upsertArgs.create.family).toBe("woody amber");
    expect(upsertArgs.create.notes).toEqual(["عود", "چرم"]);
    for (const axis of PROFILE_AXES) {
      const value = upsertArgs.create[axis] as number;
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    // Derived from woody=80 + family "woody amber":
    // warm = (65 desc + 65 family-woody + 80 family-amber)/3 = 70,
    // bold = (55 + 55 + 50)/3 = 53, elegant = (55 + 55)/2 = 55.
    expect(upsertArgs.create.warm).toBe(70);
    expect(upsertArgs.create.bold).toBe(53);
    expect(upsertArgs.create.elegant).toBe(55);
    expect(upsertArgs.create.social).toBe(40);
    // update: eligible AI fields + derived axes, never AI-written raw values.
    expect(upsertArgs.update.woody).toBe(80);
    expect(upsertArgs.update.longevity).toBe(70);
    expect(upsertArgs.update.warm).toBe(70);
    expect(upsertArgs.update.profileSource).toBe("AI");
  });

  it("preserves existing non-zero descriptors and fills only zeros", async () => {
    seedPendingItems(1);
    storedProfile = { sweet: 70, woody: 0, spicy: 40, family: null, notes: [] };
    profileReplies.push(validReply({ sweet: 90, woody: 80, spicy: 60 }));

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.succeeded).toBe(1);
    }

    const update = (mocks.profileUpsert.mock.calls[0][0] as { update: Record<string, unknown> }).update;
    // sweet = 70 preserved (structurally absent), spicy = 40 preserved.
    expect(update.sweet).toBeUndefined();
    expect(update.spicy).toBeUndefined();
    expect(update.woody).toBe(80);
  });

  it("preserves an existing family and notes (never overwrites merchant data)", async () => {
    seedPendingItems(1);
    storedProfile = { sweet: 0, woody: 0, spicy: 0, floral: 0, citrus: 0, aquatic: 0, smoky: 0, clean: 0, longevity: 0, projection: 0, family: "merchant family", notes: ["چرم"] };
    profileReplies.push(
      validReply({ woody: 80 }, { family: "ai family", notes: ["عود"] }),
    );

    const update = (await chunk().then((result) => {
      expect(result.ok).toBe(true);
      return (mocks.profileUpsert.mock.calls[0][0] as { update: Record<string, unknown> }).update;
    }));
    expect(update.family).toBeUndefined();
    expect(update.notes).toBeUndefined();
    expect(update.woody).toBe(80);
  });

  it("fills a missing family and empty notes", async () => {
    seedPendingItems(1);
    storedProfile = { sweet: 0, woody: 0, spicy: 0, floral: 0, citrus: 0, aquatic: 0, smoky: 0, clean: 0, longevity: 0, projection: 0, family: null, notes: [] };
    profileReplies.push(
      validReply({ woody: 60 }, { family: "ai family", notes: ["عود"] }),
    );

    const result = await chunk();

    expect(result.ok).toBe(true);
    const update = (mocks.profileUpsert.mock.calls[0][0] as { update: Record<string, unknown> }).update;
    expect(update.family).toBe("ai family");
    expect(update.notes).toEqual(["عود"]);
  });

  it("stores deterministically derived axes with AI provenance for a brand-new profile", async () => {
    seedPendingItems(1);
    // A brand-new profile: derivation writes its axes; provenance = AI.
    storedProfile = null;
    profileReplies.push(validReply({ woody: 50 }));

    const result = await chunk();

    expect(result.ok).toBe(true);
    const upsertArgs = mocks.profileUpsert.mock.calls[0][0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    for (const axis of PROFILE_AXES) {
      const value = upsertArgs.create[axis] as number;
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(upsertArgs.create.warm).toBe(65); // woody 50 → woody mapping
    expect(upsertArgs.create.profileSource).toBe("AI");
    expect(upsertArgs.update.profileSource).toBe("AI");
  });

  it("preserves valid stored matching axes over derivation (merchant data wins)", async () => {
    seedPendingItems(1);
    storedProfile = {
      sweet: 0,
      woody: 0,
      spicy: 0,
      floral: 0,
      citrus: 0,
      aquatic: 0,
      smoky: 0,
      clean: 0,
      longevity: 0,
      projection: 0,
      family: null,
      notes: [],
      social: 70,
      adventurous: 65,
      expressive: 60,
      mysterious: 55,
      fresh: 50,
      warm: 45,
      experimental: 40,
      elegant: 35,
      bold: 30,
    };
    profileReplies.push(validReply({ woody: 80 }));

    const result = await chunk();

    expect(result.ok).toBe(true);
    const update = (mocks.profileUpsert.mock.calls[0][0] as { update: Record<string, unknown> }).update;
    // Every stored axis stays untouched — structurally absent from the write.
    for (const axis of PROFILE_AXES) {
      expect(update[axis]).toBeUndefined();
    }
    expect(update.woody).toBe(80);
  });

  it("repairs a legacy all-nine-zero profile from AI-derived axes", async () => {
    seedPendingItems(1);
    storedProfile = {
      sweet: 0,
      woody: 0,
      spicy: 0,
      floral: 0,
      citrus: 0,
      aquatic: 0,
      smoky: 0,
      clean: 0,
      longevity: 0,
      projection: 0,
      family: null,
      notes: [],
      social: 0,
      adventurous: 0,
      expressive: 0,
      mysterious: 0,
      fresh: 0,
      warm: 0,
      experimental: 0,
      elegant: 0,
      bold: 0,
    };
    profileReplies.push(validReply({ woody: 80 }));

    const result = await chunk();

    expect(result.ok).toBe(true);
    const update = (mocks.profileUpsert.mock.calls[0][0] as { update: Record<string, unknown> }).update;
    // woody 80 → warm = 65 (the derivation is written, not the legacy 0s).
    expect(update.warm).toBe(65);
    expect(update.bold).toBe(55);
  });

  it("keeps an existing MANUAL provenance during automatic AI fill-only enrichment", async () => {
    seedPendingItems(1);
    storedProfile = {
      sweet: 0,
      woody: 0,
      spicy: 0,
      floral: 0,
      citrus: 0,
      aquatic: 0,
      smoky: 0,
      clean: 0,
      longevity: 0,
      projection: 0,
      family: null,
      notes: [],
      profileSource: "MANUAL",
    };
    profileReplies.push(validReply({ woody: 80 }));

    const result = await chunk();

    expect(result.ok).toBe(true);
    const update = (mocks.profileUpsert.mock.calls[0][0] as { update: Record<string, unknown> }).update;
    expect(update.profileSource).toBe("MANUAL");
  });

  it("resolves a reference-catalog HIT without invoking the AI fallback", async () => {
    seedPendingItems(1);
    perfumeName = "Sauvage";
    perfumeBrand = "Dior";
    storedProfile = null;

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.succeeded).toBe(1);
      expect(result.chunk.failed).toBe(0);
    }
    // THE core guarantee: the injected AI provider was never called.
    expect(profileCalls).toHaveLength(0);

    const upsertArgs = mocks.profileUpsert.mock.calls[0][0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(upsertArgs.create.profileSource).toBe("REFERENCE");
    for (const axis of PROFILE_AXES) {
      const value = upsertArgs.create[axis] as number;
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it("fails the item WITHOUT persisting when the AI data cannot yield a valid 9-axis profile", async () => {
    seedPendingItems(1);
    storedProfile = null;
    // clean/longevity are not scent-identity signals: no derivation possible.
    profileReplies.push(validReply({ clean: 60, longevity: 50 }));

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.failed).toBe(1);
      expect(result.chunk.succeeded).toBe(0);
      expect(result.chunk.status).toBe("COMPLETED_WITH_ERRORS");
    }
    expect(mocks.profileUpsert).not.toHaveBeenCalled(); // no fake profile persisted
    const failFlip = mocks.itemUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "FAILED",
    );
    expect(failFlip).toBeDefined();
    expect(failFlip?.[0].data.errorCode).toBe("invalid_output");
  });
});

describe("processBulkProfileChunk — AI failure classification and retry", () => {
  it("marks an unavailable provider FAILED terminally without retrying", async () => {
    seedPendingItems(1);
    profileReplies.push(Promise.reject(new AiUnavailableError("AI is disabled.")));

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.failed).toBe(1);
      expect(result.chunk.succeeded).toBe(0);
      expect(result.chunk.status).toBe("COMPLETED_WITH_ERRORS");
    }
    expect(profileCalls).toHaveLength(1);
    expect(recordedDelays).toEqual([]);
    const failCall = mocks.itemUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "FAILED",
    );
    expect(failCall?.[0].data.errorCode).toBe("unavailable");
  });

  it("retries a timeout once, then fails terminally at the attempt boundary", async () => {
    seedPendingItems(1);
    profileReplies.push(
      Promise.reject(new AiRequestError("AI request timed out after 15000ms.", { timeout: true })),
      Promise.reject(new AiRequestError("AI request timed out after 15000ms.", { timeout: true })),
    );

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.failed).toBe(1);
      expect(result.chunk.succeeded).toBe(0);
      expect(result.chunk.status).toBe("COMPLETED_WITH_ERRORS");
    }
    // Two real starts; one backoff wait between them (fake sleep).
    expect(profileCalls).toHaveLength(2);
    expect(recordedDelays).toEqual([2_000]);
    const failCall = mocks.itemUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "FAILED",
    );
    expect(failCall?.[0].data.errorCode).toBe("timeout");
    // The automatic retry released to PENDING (not manual-retry abuse).
    const release = mocks.itemUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "PENDING" && call[0]?.where?.id === "item-1",
    );
    expect(release).toBeDefined();
    expect(items["item-1"].attempts).toBe(2);
  });

  it("retries a 5xx once honoring the existing backoff helper", async () => {
    seedPendingItems(1);
    profileReplies.push(
      Promise.reject(new AiRequestError("AI request failed with HTTP 503", { status: 503 })),
      Promise.reject(new AiRequestError("AI request failed with HTTP 503", { status: 503 })),
    );

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.failed).toBe(1);
    }
    expect(profileCalls).toHaveLength(2);
    expect(recordedDelays).toEqual([2_000]);
    const failCall = mocks.itemUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "FAILED",
    );
    expect(failCall?.[0].data.errorCode).toBe("http_5xx");
  });

  it("honors a structured Retry-After hint instead of the default backoff", async () => {
    seedPendingItems(1);
    profileReplies.push(
      Promise.reject(new AiRequestError("AI request failed with HTTP 429", { status: 429, retryAfterMs: 9_000 })),
      validReply({ woody: 40 }),
    );

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.succeeded).toBe(1);
      expect(result.chunk.failed).toBe(0);
      expect(result.chunk.pausedForRateLimit).toBe(false);
      expect(result.chunk.status).toBe("COMPLETED");
    }
    expect(profileCalls).toHaveLength(2);
    // The structured hint replaced the default backoff — honored, not parsed.
    expect(recordedDelays).toEqual([9_000]);
    expect(items["item-1"].attempts).toBe(2);
  });

  it("does not retry a non-retryable HTTP error", async () => {
    seedPendingItems(1);
    profileReplies.push(Promise.reject(new AiRequestError("AI request failed with HTTP 400", { status: 400 })));

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.failed).toBe(1);
      expect(result.chunk.status).toBe("COMPLETED_WITH_ERRORS");
    }
    expect(profileCalls).toHaveLength(1);
    expect(recordedDelays).toEqual([]);
    const failCall = mocks.itemUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "FAILED",
    );
    expect(failCall?.[0].data.errorCode).toBe("http_other");
  });

  it("marks malformed AI output as invalid_output without retrying", async () => {
    seedPendingItems(1);
    // A forbidden matching axis INSIDE descriptors is rejected outright by the
    // authoritative validator (top-level unknown keys are the provider's own
    // contract; the axis case is the hallucination case this test covers).
    profileReplies.push(validReply({ woody: 50, fresh: 80 }));

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.failed).toBe(1);
      expect(result.chunk.succeeded).toBe(0);
      expect(result.chunk.status).toBe("COMPLETED_WITH_ERRORS");
    }
    expect(profileCalls).toHaveLength(1);
    expect(mocks.profileUpsert).not.toHaveBeenCalled();
    const failCall = mocks.itemUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "FAILED",
    );
    expect(failCall?.[0].data.errorCode).toBe("invalid_output");
  });

  it("recovers when the transient error succeeds on the second start", async () => {
    seedPendingItems(1);
    profileReplies.push(
      Promise.reject(new AiRequestError("AI request failed with HTTP 503", { status: 503 })),
      validReply({ woody: 40 }),
    );

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.succeeded).toBe(1);
      expect(result.chunk.failed).toBe(0);
      expect(result.chunk.status).toBe("COMPLETED");
    }
    expect(profileCalls).toHaveLength(2);
    expect(recordedDelays).toEqual([2_000]);
    expect(items["item-1"].attempts).toBe(2);
    expect(mocks.profileUpsert).toHaveBeenCalledTimes(1);
  });
});

describe("processBulkProfileChunk — rate-limit pause policy", () => {
  it("does not pause after a single 429 (recovering on the retry)", async () => {
    seedPendingItems(1);
    profileReplies.push(
      Promise.reject(new AiRequestError("AI request failed with HTTP 429", { status: 429 })),
      validReply({ woody: 30 }),
    );

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.succeeded).toBe(1);
      expect(result.chunk.pausedForRateLimit).toBe(false);
      expect(result.chunk.status).toBe("COMPLETED");
    }
    const pauseFlip = mocks.jobUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "PAUSED_RATE_LIMITED",
    );
    expect(pauseFlip).toBeUndefined();
  });

  it("pauses the job after two consecutive 429s and keeps items recoverable", async () => {
    seedPendingItems(2);
    // item-1 hits the hold on its second start (exhausted → terminal), so the
    // chunk counts it as FAILED while the untouched FIFO tail stays claimable.
    profileReplies.push(
      Promise.reject(new AiRequestError("AI request failed with HTTP 429", { status: 429 })),
      Promise.reject(new AiRequestError("AI request failed with HTTP 429", { status: 429 })),
    );

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.pausedForRateLimit).toBe(true);
      expect(result.chunk.status).toBe("PAUSED_RATE_LIMITED");
      expect(result.chunk.failed).toBe(1);
      // The untouched FIFO tail remains claimable — recovered, not failed.
      expect(result.chunk.remaining).toBe(1);
    }
    const pauseFlip = mocks.jobUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "PAUSED_RATE_LIMITED",
    );
    expect(pauseFlip).toBeDefined();
    expect(items["item-1"].status).toBe("FAILED");
    expect(items["item-2"].status).toBe("PENDING");
  });

  it("marks an exhausted item terminal before holding the job", async () => {
    seedPendingItems(1);
    profileReplies.push(
      Promise.reject(new AiRequestError("AI request failed with HTTP 429", { status: 429 })),
      Promise.reject(new AiRequestError("AI request failed with HTTP 429", { status: 429 })),
    );

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.pausedForRateLimit).toBe(true);
      expect(result.chunk.failed).toBe(1);
    }
    // Start 1: release; start 2: exhausted by the hold → terminal FAILED.
    const failFlip = mocks.itemUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "FAILED",
    );
    expect(failFlip?.[0].data.errorCode).toBe("http_429");
    expect(items["item-1"].attempts).toBe(2);
  });

  it("resets the consecutive counter after a success (no premature hold)", async () => {
    seedPendingItems(2);
    profileReplies.push(
      Promise.reject(new AiRequestError("AI request failed with HTTP 429", { status: 429 })),
      validReply({ woody: 20 }),
      Promise.reject(new AiRequestError("AI request failed with HTTP 429", { status: 429 })),
      validReply({ woody: 25 }),
    );

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.succeeded).toBe(2);
      expect(result.chunk.pausedForRateLimit).toBe(false);
      expect(result.chunk.status).toBe("COMPLETED");
    }
  });
});

describe("processBulkProfileChunk — time budget", () => {
  it("starts no work when the budget is already exhausted", async () => {
    seedPendingItems(1);
    // Clock: deadline = 120 000; the first loop probe reads 150 000.
    const result = await chunk({ now: scriptedClock([0, 150_000]) });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.processed).toBe(0);
      expect(result.chunk.timeBudgetExhausted).toBe(true);
      expect(result.chunk.remaining).toBe(1);
      expect(result.chunk.status).toBe("RUNNING");
    }
    expect(profileCalls).toHaveLength(0);
    const failFlip = mocks.itemUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "FAILED",
    );
    expect(failFlip).toBeUndefined();
  });

  it("stops between items when the budget is reached mid-chunk", async () => {
    seedPendingItems(2);
    // Clock: deadline = 120 000; probe reads 0, the next inter-item probe 125 000.
    profileReplies.push(validReply({ woody: 10 }));
    const result = await chunk({ now: scriptedClock([0, 0, 125_000]) });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.processed).toBe(1);
      expect(result.chunk.succeeded).toBe(1);
      expect(result.chunk.remaining).toBe(1);
      expect(result.chunk.timeBudgetExhausted).toBe(true);
      expect(result.chunk.status).toBe("RUNNING");
    }
    expect(profileCalls).toHaveLength(1);
  });

  it("never sleeps past the chunk budget for an honored Retry-After", async () => {
    seedPendingItems(1);
    // Remaining budget at the 429 decision = 20 000 < hint 30 000.
    profileReplies.push(
      Promise.reject(new AiRequestError("AI request failed with HTTP 429", { status: 429, retryAfterMs: 30_000 })),
    );
    const result = await chunk({ now: scriptedClock([0, 0, 100_000, 100_000]) });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.timeBudgetExhausted).toBe(true);
      expect(result.chunk.pausedForRateLimit).toBe(false);
      expect(result.chunk.failed).toBe(0);
      expect(result.chunk.remaining).toBe(1);
      expect(result.chunk.status).toBe("RUNNING");
    }
    // No 30-second sleep — the hint cannot exceed the budget.
    expect(recordedDelays).toEqual([]);
    expect(profileCalls).toHaveLength(1);
    expect(items["item-1"].status).toBe("PENDING");
  });
});

describe("processBulkProfileChunk — store isolation", () => {
  it("skips a perfume the store scope cannot see (foreign or missing)", async () => {
    seedPendingItems(1);
    perfumeVisible = false;

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.skipped).toBe(1);
      expect(result.chunk.succeeded).toBe(0);
      expect(result.chunk.status).toBe("COMPLETED");
    }
    const skipFlip = mocks.itemUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "SKIPPED",
    );
    expect(skipFlip).toBeDefined();
    expect(mocks.profileUpsert).not.toHaveBeenCalled();
  });

  it("always probes with the caller's store id (isolation predicates)", async () => {
    seedPendingItems(1);
    storedProfile = { sweet: 0, woody: 0, spicy: 0, floral: 0, citrus: 0, aquatic: 0, smoky: 0, clean: 0, longevity: 0, projection: 0, family: null, notes: [] };
    profileReplies.push(validReply({ woody: 10 }));

    await chunk();

    const perfumeProbe = mocks.perfumeFindFirst.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(perfumeProbe.where.storeId).toBe(TEST_STORE);
    const profileProbe = mocks.profileFindFirst.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(profileProbe.where.perfume).toEqual({ storeId: TEST_STORE });
  });
});

describe("processBulkProfileChunk — atomicity", () => {
  it("does not claim success when the persist transaction fails", async () => {
    seedPendingItems(1);
    profileReplies.push(validReply({ woody: 80 }));
    persistFails = true;

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunk.succeeded).toBe(0);
      expect(result.chunk.failed).toBe(0);
      expect(result.chunk.remaining).toBe(1);
      expect(result.chunk.status).toBe("RUNNING");
    }
    // The item was released to FIFO, never marked FAILED, never counted.
    expect(items["item-1"].status).toBe("PENDING");
    const failFlip = mocks.itemUpdateMany.mock.calls.find(
      (call: CallView[]) => call[0]?.data?.status === "FAILED",
    );
    expect(failFlip).toBeUndefined();
  });

  it("recovers without a false success when the terminal flip loses a race", async () => {
    seedPendingItems(1);
    profileReplies.push(validReply({ woody: 80 }), validReply({ woody: 80 }));
    // The first terminal flip matches no row (a peer already moved it), so the
    // outcome is not-ok — no success is claimed, the item is released, and the
    // FIFO retry legitimately finishes the work afterwards.
    const base = mocks.itemUpdateMany.getMockImplementation();
    let appliedSucceededFlips = 0;
    mocks.itemUpdateMany.mockImplementation(async (args: { where?: Record<string, unknown>; data?: Record<string, unknown> } | undefined) => {
      const result = await base?.(args as never);
      if (result?.count === 1 && (args?.data as Record<string, unknown> | undefined)?.status === "SUCCEEDED") {
        appliedSucceededFlips += 1;
      }
      return result;
    });
    mocks.itemUpdateMany.mockImplementationOnce(async (args: { where?: Record<string, unknown>; data?: Record<string, unknown> } | undefined) => {
      const where = args?.where ?? {};
      if (where.id === "item-1" && where.status === "RUNNING") {
        return { count: 0 };
      }
      return base?.(args as never);
    });

    const result = await chunk();

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The reported success came from exactly ONE counted flip — the lost
      // race claimed nothing and the retry was counted exactly once.
      expect(result.chunk.succeeded).toBe(1);
      expect(result.chunk.remaining).toBe(0);
      expect(result.chunk.status).toBe("COMPLETED");
    }
    expect(appliedSucceededFlips).toBe(1);
    expect(items["item-1"].status).toBe("SUCCEEDED");
    mocks.itemUpdateMany.mockImplementation(base as never);
  });
});
