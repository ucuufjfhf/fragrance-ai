import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimNextBulkProfileItem,
  completeBulkProfileJob,
  createBulkProfileJob,
  failBulkProfileJob,
  markBulkProfileItemFailed,
  markBulkProfileItemSkipped,
  markBulkProfileItemSucceeded,
  pauseBulkProfileJob,
  reclaimStaleBulkProfileItem,
  retryBulkProfileItem,
  startBulkProfileJob,
  touchBulkProfileItemHeartbeat,
} from "@/lib/admin/bulk/service";

/**
 * Phase 12.3 bulk service tests (mocked Prisma — no live database), matching
 * the established `vi.mock("@/lib/db")` + `vi.hoisted` harness used across the
 * suite. Focus:
 *  - job creation is validated then written atomically (one $transaction);
 *  - every claim/heartbeat/reclaim/terminal/retry/job op issues a CONDITIONAL
 *    `updateMany` whose affected-row count decides success (never read-then-write);
 *  - store isolation: scoped reads/`where` always carry the caller's storeId and a
 *    foreign id degrades to the same NOT_FOUND as a missing one (no leak);
 *  - counters increment atomically and only when the item flip won (exactly-once);
 *  - job completion derives from item state, gated by the Phase 12.1 contract.
 *
 * Real database races (two concurrent claims / terminal transitions) are proven
 * separately in `tests/admin/bulk-service.race.test.ts` against live PostgreSQL.
 */

const mocks = vi.hoisted(() => ({
  storeFindFirst: vi.fn(),
  perfumeFindMany: vi.fn(),
  jobFindFirst: vi.fn(),
  jobCreate: vi.fn(),
  jobUpdateMany: vi.fn(),
  itemFindFirst: vi.fn(),
  itemCreate: vi.fn(),
  itemUpdateMany: vi.fn(),
  itemGroupBy: vi.fn(),
  transaction: vi.fn(),
  prisma: null as unknown,
}));

vi.mock("@/lib/db", () => {
  const p = {
    store: { findFirst: mocks.storeFindFirst },
    perfume: { findMany: mocks.perfumeFindMany },
    bulkProfileJob: {
      findFirst: mocks.jobFindFirst,
      create: mocks.jobCreate,
      updateMany: mocks.jobUpdateMany,
    },
    bulkProfileItem: {
      findFirst: mocks.itemFindFirst,
      create: mocks.itemCreate,
      updateMany: mocks.itemUpdateMany,
      groupBy: mocks.itemGroupBy,
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transaction(fn),
  };
  mocks.prisma = p;
  return { getPrisma: () => p };
});

beforeEach(() => {
  vi.clearAllMocks();
  // Execute the interactive-transaction callback against the same mock client
  // (tx shares the model mocks), and count the transaction boundary.
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(mocks.prisma),
  );
  mocks.storeFindFirst.mockResolvedValue({ id: "store-1" });
  mocks.perfumeFindMany.mockResolvedValue([]);
  mocks.jobFindFirst.mockResolvedValue(null);
  mocks.jobCreate.mockResolvedValue({ id: "job-1" });
  mocks.jobUpdateMany.mockResolvedValue({ count: 1 });
  mocks.itemFindFirst.mockResolvedValue(null);
  mocks.itemCreate.mockResolvedValue({ id: "item-new" });
  mocks.itemUpdateMany.mockResolvedValue({ count: 0 });
  mocks.itemGroupBy.mockResolvedValue([]);
});

describe("createBulkProfileJob — validation and atomic creation", () => {
  it("rejects an empty perfume list before touching the database", async () => {
    const result = await createBulkProfileJob({ storeId: "store-1", perfumeIds: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("INVALID_INPUT");
    }
    expect(mocks.storeFindFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects duplicate perfume ids", async () => {
    const result = await createBulkProfileJob({ storeId: "store-1", perfumeIds: ["p1", "p1"] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("INVALID_INPUT");
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects more than the max-item limit (env-resolved, default AI_BULK_MAX_ITEMS)", async () => {
    const prev = process.env.AI_BULK_MAX_ITEMS;
    process.env.AI_BULK_MAX_ITEMS = "2";

    try {
      const result = await createBulkProfileJob({
        storeId: "store-1",
        perfumeIds: ["p1", "p2", "p3"],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("INVALID_INPUT");
      }
      expect(mocks.transaction).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) {
        delete process.env.AI_BULK_MAX_ITEMS;
      } else {
        process.env.AI_BULK_MAX_ITEMS = prev;
      }
    }
  });

  it("rejects a blank store id", async () => {
    const result = await createBulkProfileJob({ storeId: "   ", perfumeIds: ["p1"] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("INVALID_STORE");
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a nonexistent store", async () => {
    mocks.storeFindFirst.mockResolvedValue(null);

    const result = await createBulkProfileJob({ storeId: "store-x", perfumeIds: ["p1"] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("INVALID_STORE");
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a nonexistent perfume with the generic selection error", async () => {
    mocks.storeFindFirst.mockResolvedValue({ id: "store-1" });
    mocks.perfumeFindMany.mockResolvedValue([]);

    const result = await createBulkProfileJob({ storeId: "store-1", perfumeIds: ["p-ghost"] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("PERFUME_SELECTION_INVALID");
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a cross-store perfume with the SAME generic reason (no existence leak)", async () => {
    mocks.storeFindFirst.mockResolvedValue({ id: "store-1" });
    mocks.perfumeFindMany.mockResolvedValue([]);

    const result = await createBulkProfileJob({ storeId: "store-1", perfumeIds: ["p-foreign"] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("PERFUME_SELECTION_INVALID");
    }

    const where = mocks.perfumeFindMany.mock.calls[0][0].where;
    expect(where.storeId).toBe("store-1");
    expect(where.id).toEqual({ in: ["p-foreign"] });
  });

  it("creates the job with PENDING status, totalItems and zeroed counters", async () => {
    mocks.perfumeFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    const result = await createBulkProfileJob({ storeId: "store-1", perfumeIds: ["p1", "p2"] });

    expect(result).toEqual({ ok: true, jobId: "job-1", totalItems: 2 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);

    const data = mocks.jobCreate.mock.calls[0][0].data;
    expect(data.storeId).toBe("store-1");
    expect(data.status).toBe("PENDING");
    expect(data.totalItems).toBe(2);
    expect(data.successCount).toBe(0);
    expect(data.failedCount).toBe(0);
    expect(data.skippedCount).toBe(0);
  });

  it("creates one PENDING/attempts=0 item per perfume inside the same transaction", async () => {
    mocks.perfumeFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    await createBulkProfileJob({
      storeId: "store-1",
      perfumeIds: ["p1", "p2"],
      rowNumbers: { p1: 2 },
    });

    expect(mocks.itemCreate).toHaveBeenCalledTimes(2);

    const first = mocks.itemCreate.mock.calls[0][0].data;
    expect(first.jobId).toBe("job-1");
    expect(first.perfumeId).toBe("p1");
    expect(first.status).toBe("PENDING");
    expect(first.attempts).toBe(0);
    expect(first.rowNumber).toBe(2);

    const second = mocks.itemCreate.mock.calls[1][0].data;
    expect(second.perfumeId).toBe("p2");
    expect(second.rowNumber).toBeNull();
  });

  it("returns DB_ERROR and no jobId when the transaction rolls back (no partial job)", async () => {
    mocks.perfumeFindMany.mockResolvedValue([{ id: "p1" }]);
    mocks.itemCreate.mockRejectedValueOnce(new Error("FK violation"));

    const result = await createBulkProfileJob({ storeId: "store-1", perfumeIds: ["p1"] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("DB_ERROR");
      expect(result.detail).not.toContain("FK violation");
    }
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.jobCreate).toHaveBeenCalledTimes(1);
  });
});

describe("claimNextBulkProfileItem — atomic conditional claim", () => {
  it("claims a PENDING item: RUNNING, attempts+1, heartbeat set, ids preserved", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "RUNNING" });
    mocks.itemFindFirst
      .mockResolvedValueOnce({ id: "item-1" }) // candidate selection (id only)
      .mockResolvedValueOnce({
        id: "item-1",
        jobId: "job-1",
        perfumeId: "p1",
        attempts: 1,
        rowNumber: null,
      }); // read-back after win
    mocks.itemUpdateMany.mockResolvedValue({ count: 1 });

    const result = await claimNextBulkProfileItem("job-1", "store-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.itemId).toBe("item-1");
      expect(result.item.jobId).toBe("job-1");
      expect(result.item.perfumeId).toBe("p1");
      expect(result.item.attempts).toBe(1);
    }

    // Conditional claim: WHERE status = PENDING (the atomic gate).
    const call = mocks.itemUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "item-1", jobId: "job-1", status: "PENDING" });
    expect(call.data.status).toBe("RUNNING");
    expect(call.data.attempts).toEqual({ increment: 1 });
    expect(call.data.heartbeatAt).toBeInstanceOf(Date);
    // Claim never touches counters, perfume, profile or axes.
    expect(call.data).not.toHaveProperty("successCount");
    expect(call.data).not.toHaveProperty("failedCount");
    expect(call.data).not.toHaveProperty("skippedCount");
    expect(call.data).not.toHaveProperty("perfumeId");
  });

  it("returns NOT_CLAIMABLE when no PENDING item remains (second claim)", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "RUNNING" });
    mocks.itemFindFirst.mockResolvedValue(null);

    const result = await claimNextBulkProfileItem("job-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_CLAIMABLE");
    }
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("a non-PENDING (already RUNNING) item is never a candidate → NOT_CLAIMABLE", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "RUNNING" });
    // Candidate query filters status=PENDING, so a RUNNING item yields no row.
    mocks.itemFindFirst.mockResolvedValue(null);

    const result = await claimNextBulkProfileItem("job-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_CLAIMABLE");
    }
    const where = mocks.itemFindFirst.mock.calls[0][0].where;
    expect(where.status).toBe("PENDING");
    expect(where.jobId).toBe("job-1");
  });

  it("re-selects a new candidate after losing the conditional update (race recovery)", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "RUNNING" });
    mocks.itemFindFirst
      .mockResolvedValueOnce({ id: "item-loser" }) // first candidate
      .mockResolvedValueOnce({ id: "item-winner" }) // re-selected candidate
      .mockResolvedValueOnce({
        id: "item-winner",
        jobId: "job-1",
        perfumeId: "p2",
        attempts: 1,
        rowNumber: null,
      });
    // First conditional update affects 0 rows (another worker won), second wins.
    mocks.itemUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await claimNextBulkProfileItem("job-1", "store-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.itemId).toBe("item-winner");
    }
    expect(mocks.itemUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.itemFindFirst).toHaveBeenCalledTimes(3);
  });

  it("rejects a cross-store job as NOT_FOUND (no existence leak) and never writes", async () => {
    mocks.jobFindFirst.mockResolvedValue(null); // job belongs to another store

    const result = await claimNextBulkProfileItem("job-foreign", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_FOUND");
    }
    const where = mocks.jobFindFirst.mock.calls[0][0].where;
    expect(where.storeId).toBe("store-1");
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses to claim from a non-RUNNING (paused) job", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "PAUSED_RATE_LIMITED" });

    const result = await claimNextBulkProfileItem("job-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("JOB_NOT_ACTIVE");
    }
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });
});

describe("touchBulkProfileItemHeartbeat — conditional RUNNING-only keep-alive", () => {
  it("updates the heartbeat of a RUNNING item (only heartbeatAt)", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", status: "RUNNING" });
    mocks.itemUpdateMany.mockResolvedValue({ count: 1 });

    const result = await touchBulkProfileItemHeartbeat("item-1", "store-1");

    expect(result).toEqual({ ok: true });

    const call = mocks.itemUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "item-1", status: "RUNNING", job: { storeId: "store-1" } });
    expect(call.data.heartbeatAt).toBeInstanceOf(Date);
    // Only the heartbeat moves — status, attempts and counters are untouched.
    expect(Object.keys(call.data)).toEqual(["heartbeatAt"]);
    expect(call.data).not.toHaveProperty("attempts");
    expect(call.data).not.toHaveProperty("status");
  });

  it("refuses a non-RUNNING item and performs no write", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", status: "PENDING" });

    const result = await touchBulkProfileItemHeartbeat("item-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_RUNNING");
    }
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("returns NOT_RUNNING when the conditional update affects 0 rows (lost the race)", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", status: "RUNNING" });
    mocks.itemUpdateMany.mockResolvedValue({ count: 0 });

    const result = await touchBulkProfileItemHeartbeat("item-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_RUNNING");
    }
  });

  it("rejects a cross-store item as NOT_FOUND (no existence leak)", async () => {
    mocks.itemFindFirst.mockResolvedValue(null);

    const result = await touchBulkProfileItemHeartbeat("item-foreign", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_FOUND");
    }
    const where = mocks.itemFindFirst.mock.calls[0][0].where;
    expect(where.job).toEqual({ storeId: "store-1" });
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });
});

describe("reclaimStaleBulkProfileItem — atomic RUNNING→PENDING when stale", () => {
  it("reclaims a stale RUNNING item (status→PENDING, heartbeat cleared, attempts preserved)", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", status: "RUNNING" });
    mocks.itemUpdateMany.mockResolvedValue({ count: 1 });

    const result = await reclaimStaleBulkProfileItem("item-1", "store-1");

    expect(result).toEqual({ ok: true });

    const call = mocks.itemUpdateMany.mock.calls[0][0];
    expect(call.where.status).toBe("RUNNING");
    expect(call.where.job).toEqual({ storeId: "store-1" });
    // Stale = heartbeat IS NULL OR heartbeat older than the cutoff.
    expect(call.where.OR).toHaveLength(2);
    expect(call.where.OR[0]).toEqual({ heartbeatAt: null });
    expect(call.where.OR[1].heartbeatAt.lt).toBeInstanceOf(Date);

    expect(call.data.status).toBe("PENDING");
    expect(call.data.heartbeatAt).toBeNull();
    // Crucially: no attempts mutation during stale reclaim.
    expect(call.data).not.toHaveProperty("attempts");
  });

  it("does not reclaim a fresh RUNNING item (conditional update affects 0 rows)", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", status: "RUNNING" });
    mocks.itemUpdateMany.mockResolvedValue({ count: 0 }); // stale filter excludes it

    const result = await reclaimStaleBulkProfileItem("item-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_STALE");
    }
  });

  it("returns NOT_STALE when another worker reclaimed it first (race-safe)", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", status: "RUNNING" });
    mocks.itemUpdateMany.mockResolvedValue({ count: 0 });

    const result = await reclaimStaleBulkProfileItem("item-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_STALE");
    }
    expect(mocks.itemUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("refuses a non-RUNNING item", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", status: "SUCCEEDED" });

    const result = await reclaimStaleBulkProfileItem("item-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_RUNNING");
    }
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a cross-store item as NOT_FOUND", async () => {
    mocks.itemFindFirst.mockResolvedValue(null);

    const result = await reclaimStaleBulkProfileItem("item-foreign", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_FOUND");
    }
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });
});

describe("terminal item transitions — atomic flip + exactly-once counter", () => {
  it("RUNNING → SUCCEEDED in one transaction, clearing heartbeat and +1 successCount", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", jobId: "job-1", status: "RUNNING" });
    mocks.itemUpdateMany.mockResolvedValue({ count: 1 });
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });

    const result = await markBulkProfileItemSucceeded("item-1", "store-1");

    expect(result).toEqual({ ok: true, status: "SUCCEEDED" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);

    const itemCall = mocks.itemUpdateMany.mock.calls[0][0];
    expect(itemCall.where).toEqual({ id: "item-1", status: "RUNNING", job: { storeId: "store-1" } });
    expect(itemCall.data.status).toBe("SUCCEEDED");
    expect(itemCall.data.heartbeatAt).toBeNull();

    const jobCall = mocks.jobUpdateMany.mock.calls[0][0];
    expect(jobCall.where).toEqual({ id: "job-1", storeId: "store-1" });
    expect(jobCall.data).toEqual({ successCount: { increment: 1 } });
  });

  it("RUNNING → FAILED records the typed error and +1 failedCount", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", jobId: "job-1", status: "RUNNING" });
    mocks.itemUpdateMany.mockResolvedValue({ count: 1 });
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });

    const result = await markBulkProfileItemFailed("item-1", "store-1", {
      code: "http_429",
      message: "rate limited",
    });

    expect(result).toEqual({ ok: true, status: "FAILED" });

    const itemCall = mocks.itemUpdateMany.mock.calls[0][0];
    expect(itemCall.data.status).toBe("FAILED");
    expect(itemCall.data.errorCode).toBe("http_429");
    expect(itemCall.data.errorMessage).toBe("rate limited");
    expect(itemCall.data.heartbeatAt).toBeNull();

    expect(mocks.jobUpdateMany.mock.calls[0][0].data).toEqual({ failedCount: { increment: 1 } });
  });

  it("RUNNING → SKIPPED clears any error and +1 skippedCount", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", jobId: "job-1", status: "RUNNING" });
    mocks.itemUpdateMany.mockResolvedValue({ count: 1 });
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });

    const result = await markBulkProfileItemSkipped("item-1", "store-1");

    expect(result).toEqual({ ok: true, status: "SKIPPED" });

    const itemCall = mocks.itemUpdateMany.mock.calls[0][0];
    expect(itemCall.data.status).toBe("SKIPPED");
    expect(itemCall.data.errorCode).toBeNull();
    expect(itemCall.data.errorMessage).toBeNull();
    expect(mocks.jobUpdateMany.mock.calls[0][0].data).toEqual({ skippedCount: { increment: 1 } });
  });

  it("never increments the counter when the item flip loses the race (exactly-once)", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", jobId: "job-1", status: "RUNNING" });
    mocks.itemUpdateMany.mockResolvedValue({ count: 0 });

    const result = await markBulkProfileItemSucceeded("item-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_RUNNING");
    }
    expect(mocks.itemUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a duplicate terminal transition (item already SUCCEEDED)", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", jobId: "job-1", status: "SUCCEEDED" });

    const result = await markBulkProfileItemSucceeded("item-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_RUNNING");
    }
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid (untyped) failure code before any write", async () => {
    const result = await markBulkProfileItemFailed("item-1", "store-1", { code: "not-a-code" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("INVALID_INPUT");
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a cross-store item as NOT_FOUND and never writes", async () => {
    mocks.itemFindFirst.mockResolvedValue(null);

    const result = await markBulkProfileItemSucceeded("item-foreign", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_FOUND");
    }
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
  });
});

describe("retryBulkProfileItem — FAILED → PENDING preparation only", () => {
  it("reverts FAILED → PENDING, clearing error fields and heartbeat", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", status: "FAILED" });
    mocks.itemUpdateMany.mockResolvedValue({ count: 1 });

    const result = await retryBulkProfileItem("item-1", "store-1");

    expect(result).toEqual({ ok: true });

    const call = mocks.itemUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "item-1", status: "FAILED", job: { storeId: "store-1" } });
    expect(call.data.status).toBe("PENDING");
    expect(call.data.errorCode).toBeNull();
    expect(call.data.errorMessage).toBeNull();
    expect(call.data.heartbeatAt).toBeNull();
    // Retry must NOT increment attempts (the next claim will) nor touch totals.
    expect(call.data).not.toHaveProperty("attempts");
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects retrying a SUCCEEDED item", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", status: "SUCCEEDED" });

    const result = await retryBulkProfileItem("item-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_FAILED");
    }
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects retrying a RUNNING or PENDING item", async () => {
    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", status: "RUNNING" });
    expect((await retryBulkProfileItem("item-1", "store-1")).ok).toBe(false);

    mocks.itemFindFirst.mockResolvedValue({ id: "item-1", status: "PENDING" });
    const second = await retryBulkProfileItem("item-1", "store-1");

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("NOT_FAILED");
    }
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a cross-store / nonexistent item as NOT_FOUND", async () => {
    mocks.itemFindFirst.mockResolvedValue(null);

    const result = await retryBulkProfileItem("item-foreign", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_FOUND");
    }
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });
});

describe("job state transitions — Phase 12.1 contract enforced", () => {
  it("starts a PENDING job → RUNNING and stamps startedAt", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "PENDING" });
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });

    const result = await startBulkProfileJob("job-1", "store-1");

    expect(result).toEqual({ ok: true, status: "RUNNING" });
    const call = mocks.jobUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "job-1", storeId: "store-1", status: "PENDING" });
    expect(call.data.status).toBe("RUNNING");
    expect(call.data.startedAt).toBeInstanceOf(Date);
  });

  it("resumes a PAUSED job → RUNNING WITHOUT resetting startedAt", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "PAUSED_RATE_LIMITED" });
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });

    const result = await startBulkProfileJob("job-1", "store-1");

    expect(result).toEqual({ ok: true, status: "RUNNING" });
    const call = mocks.jobUpdateMany.mock.calls[0][0];
    expect(call.data.status).toBe("RUNNING");
    expect(call.data.startedAt).toBeUndefined();
  });

  it("pauses a RUNNING job → PAUSED_RATE_LIMITED (no timestamp written)", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "RUNNING" });
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });

    const result = await pauseBulkProfileJob("job-1", "store-1");

    expect(result).toEqual({ ok: true, status: "PAUSED_RATE_LIMITED" });
    const call = mocks.jobUpdateMany.mock.calls[0][0];
    expect(call.data).toEqual({ status: "PAUSED_RATE_LIMITED" });
  });

  it("fails a RUNNING job → FAILED and stamps completedAt", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "RUNNING" });
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });

    const result = await failBulkProfileJob("job-1", "store-1");

    expect(result).toEqual({ ok: true, status: "FAILED" });
    const call = mocks.jobUpdateMany.mock.calls[0][0];
    expect(call.data.status).toBe("FAILED");
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });

  it("rejects starting a terminal (COMPLETED) job — terminal states cannot restart", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "COMPLETED" });

    const result = await startBulkProfileJob("job-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("INVALID_TRANSITION");
    }
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects illegal jumps the contract forbids (fail/pause straight from PENDING)", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "PENDING" });

    expect((await failBulkProfileJob("job-1", "store-1")).ok).toBe(false);
    expect((await pauseBulkProfileJob("job-1", "store-1")).ok).toBe(false);

    // Both were refused by the contract guard — no write attempted.
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
  });

  it("returns INVALID_TRANSITION when a concurrent change wins the conditional update", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "RUNNING" });
    mocks.jobUpdateMany.mockResolvedValue({ count: 0 });

    const result = await pauseBulkProfileJob("job-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("INVALID_TRANSITION");
    }
  });

  it("rejects a cross-store job as NOT_FOUND and never writes", async () => {
    mocks.jobFindFirst.mockResolvedValue(null);

    const result = await startBulkProfileJob("job-foreign", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_FOUND");
    }
    const where = mocks.jobFindFirst.mock.calls[0][0].where;
    expect(where.storeId).toBe("store-1");
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
  });
});

describe("completeBulkProfileJob — completion derived from item state", () => {
  it("all items SUCCEEDED → COMPLETED (one transaction, stamps completedAt)", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "RUNNING" });
    mocks.itemGroupBy.mockResolvedValue([{ status: "SUCCEEDED", _count: { _all: 3 } }]);
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });

    const result = await completeBulkProfileJob("job-1", "store-1");

    expect(result).toEqual({ ok: true, status: "COMPLETED" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);

    const call = mocks.jobUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "job-1", storeId: "store-1", status: "RUNNING" });
    expect(call.data.status).toBe("COMPLETED");
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });

  it("terminal items with at least one FAILED → COMPLETED_WITH_ERRORS", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "RUNNING" });
    mocks.itemGroupBy.mockResolvedValue([
      { status: "SUCCEEDED", _count: { _all: 2 } },
      { status: "FAILED", _count: { _all: 1 } },
    ]);
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });

    const result = await completeBulkProfileJob("job-1", "store-1");

    expect(result).toEqual({ ok: true, status: "COMPLETED_WITH_ERRORS" });
    expect(mocks.jobUpdateMany.mock.calls[0][0].data.status).toBe("COMPLETED_WITH_ERRORS");
  });

  it("SKIPPED without FAILED still completes as COMPLETED (documented semantics)", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "RUNNING" });
    mocks.itemGroupBy.mockResolvedValue([
      { status: "SUCCEEDED", _count: { _all: 1 } },
      { status: "SKIPPED", _count: { _all: 1 } },
    ]);
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });

    const result = await completeBulkProfileJob("job-1", "store-1");

    expect(result).toEqual({ ok: true, status: "COMPLETED" });
  });

  it("refuses completion while any item is still PENDING (unresolved)", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "RUNNING" });
    mocks.itemGroupBy.mockResolvedValue([
      { status: "SUCCEEDED", _count: { _all: 2 } },
      { status: "PENDING", _count: { _all: 1 } },
    ]);

    const result = await completeBulkProfileJob("job-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("UNRESOLVED_ITEMS");
    }
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses completion while any item is still RUNNING (unresolved)", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "RUNNING" });
    mocks.itemGroupBy.mockResolvedValue([{ status: "RUNNING", _count: { _all: 1 } }]);

    const result = await completeBulkProfileJob("job-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("UNRESOLVED_ITEMS");
    }
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
  });

  it("cannot complete a PENDING job (contract gate, even if items look done)", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "PENDING" });
    mocks.itemGroupBy.mockResolvedValue([{ status: "SUCCEEDED", _count: { _all: 1 } }]);

    const result = await completeBulkProfileJob("job-1", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("INVALID_TRANSITION");
    }
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a cross-store job as NOT_FOUND before any item aggregation", async () => {
    mocks.jobFindFirst.mockResolvedValue(null);

    const result = await completeBulkProfileJob("job-foreign", "store-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_FOUND");
    }
    expect(mocks.itemGroupBy).not.toHaveBeenCalled();
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
  });
});







