import "dotenv/config";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BULK_AI_STALE_HEARTBEAT_MS } from "@/lib/admin/bulk/contract";
import {
  claimNextBulkProfileItem,
  createBulkProfileJob,
  markBulkProfileItemSucceeded,
  reclaimStaleBulkProfileItem,
  startBulkProfileJob,
} from "@/lib/admin/bulk/service";
import { getPrisma } from "@/lib/db";

/**
 * Phase 12.3 REAL-database race tests (§18).
 *
 * The rest of the suite mocks Prisma, but atomicity claims must be proven
 * against live PostgreSQL — two concurrent conditional updates on one row, not
 * a mocked counter. This file does NOT mock `@/lib/db`; it creates a throwaway
 * store (unique slug) with one perfume and a running job, fires genuinely
 * concurrent operations via `Promise.all`, and asserts exactly one wins. All
 * rows are deleted in `afterAll` (store → cascades jobs/items/perfumes).
 *
 * The whole suite is skipped when `DATABASE_URL` is absent (e.g. CI without a
 * database), so it can never break a database-less run.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("bulk service — real database races", () => {
  let storeId = "";
  let seedPerfumeId = "";

  beforeAll(async () => {
    const prisma = getPrisma();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const store = await prisma.store.create({
      data: { name: `Race Store ${suffix}`, slug: `race-store-${suffix}` },
      select: { id: true },
    });
    storeId = store.id;

    const perfume = await prisma.perfume.create({
      data: { storeId, name: "Race Perfume", brand: "RaceBrand" },
      select: { id: true },
    });
    seedPerfumeId = perfume.id;
  }, 30_000);

  /** Creates a fresh single-item job and starts it (→ RUNNING) for a race. */
  async function seedRunningJob(): Promise<string> {
    const created = await createBulkProfileJob({ storeId, perfumeIds: [seedPerfumeId] });
    if (!created.ok) {
      throw new Error(`seed job failed: ${created.reason}`);
    }
    const started = await startBulkProfileJob(created.jobId, storeId);
    if (!started.ok) {
      throw new Error(`start job failed: ${started.reason}`);
    }
    return created.jobId;
  }

  afterAll(async () => {
    if (!storeId) {
      return;
    }
    // Deleting the store cascades → jobs → items and → perfumes (full cleanup).
    await getPrisma()
      .store.delete({ where: { id: storeId } })
      .catch(() => undefined);
  }, 30_000);

  it("two concurrent claims: exactly one wins, attempts === 1, status RUNNING", async () => {
    const jobId = await seedRunningJob();

    const [a, b] = await Promise.all([
      claimNextBulkProfileItem(jobId, storeId),
      claimNextBulkProfileItem(jobId, storeId),
    ]);

    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    if (!losers[0].ok) {
      expect(losers[0].reason).toBe("NOT_CLAIMABLE");
    }

    const item = await getPrisma().bulkProfileItem.findFirst({ where: { jobId } });
    expect(item?.status).toBe("RUNNING");
    expect(item?.attempts).toBe(1);
    expect(item?.heartbeatAt).toBeInstanceOf(Date);
  }, 30_000);

  it("two concurrent terminal transitions increment successCount exactly once", async () => {
    const jobId = await seedRunningJob();
    const claimed = await claimNextBulkProfileItem(jobId, storeId);
    if (!claimed.ok) {
      throw new Error(`claim failed: ${claimed.reason}`);
    }
    const itemId = claimed.item.itemId;

    const [a, b] = await Promise.all([
      markBulkProfileItemSucceeded(itemId, storeId),
      markBulkProfileItemSucceeded(itemId, storeId),
    ]);

    const winners = [a, b].filter((r) => r.ok);
    expect(winners).toHaveLength(1);

    const job = await getPrisma().bulkProfileJob.findUnique({ where: { id: jobId } });
    expect(job?.successCount).toBe(1);
    expect(job?.failedCount).toBe(0);

    const item = await getPrisma().bulkProfileItem.findUnique({ where: { id: itemId } });
    expect(item?.status).toBe("SUCCEEDED");
    expect(item?.heartbeatAt).toBeNull();
  }, 30_000);

  it("two concurrent stale reclaims: exactly one wins, attempts preserved", async () => {
    const jobId = await seedRunningJob();
    const claimed = await claimNextBulkProfileItem(jobId, storeId);
    if (!claimed.ok) {
      throw new Error(`claim failed: ${claimed.reason}`);
    }
    const itemId = claimed.item.itemId;

    // Force a stale heartbeat (10× the threshold) while leaving attempts at 1.
    await getPrisma().bulkProfileItem.updateMany({
      where: { id: itemId },
      data: { heartbeatAt: new Date(Date.now() - 10 * BULK_AI_STALE_HEARTBEAT_MS) },
    });

    const [a, b] = await Promise.all([
      reclaimStaleBulkProfileItem(itemId, storeId),
      reclaimStaleBulkProfileItem(itemId, storeId),
    ]);

    const winners = [a, b].filter((r) => r.ok);
    expect(winners).toHaveLength(1);

    const item = await getPrisma().bulkProfileItem.findUnique({ where: { id: itemId } });
    expect(item?.status).toBe("PENDING");
    expect(item?.attempts).toBe(1); // reclaim never increments attempts
    expect(item?.heartbeatAt).toBeNull();
  }, 30_000);
});
