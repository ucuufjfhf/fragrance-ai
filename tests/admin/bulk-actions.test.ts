import { beforeEach, describe, expect, it, vi } from "vitest";

// The admin access gate (added when `proxy.ts` was removed) is mocked here:
// these tests verify the bulk-action ADAPTER behavior, not the gate itself
// (fully covered by tests/admin/access.test.ts and server-access.test.ts).
vi.mock("@/lib/admin/server-access", () => ({
  requireAdminAction: vi.fn(async () => {}),
}));

import {
  createBulkJobAction,
  getBulkJobProgressAction,
  getOpenBulkJobForStoreAction,
  pauseBulkJobAction,
  processBulkChunkAction,
  retryBulkFailedItemsAction,
  startBulkJobAction,
} from "@/app/admin/perfumes/bulk-actions";
import {
  bulkProgressPercent,
  bulkStatusLabel,
  isTerminalBulkJobStatus,
} from "@/lib/admin/bulk/ui";

/**
 * Phase 12.5 integration tests — the thin server-action adapters over the
 * Phase 12.3/12.4 service/processor, plus the pure UI presentation model.
 * The engine itself is fully covered by the dedicated 12.1–12.4 suites; these
 * mock it and verify the adapter behavior: validation, reason→Persian mapping,
 * serializable payloads, and that NO lifecycle logic is duplicated here.
 */

const service = vi.hoisted(() => ({
  createBulkProfileJob: vi.fn(),
  startBulkProfileJob: vi.fn(),
  pauseBulkProfileJob: vi.fn(),
  getBulkProfileJobProgress: vi.fn(),
  listBulkProfileFailedItems: vi.fn(),
  retryBulkProfileFailedItems: vi.fn(),
  getLatestOpenBulkProfileJob: vi.fn(),
}));

const processor = vi.hoisted(() => ({
  processBulkProfileChunk: vi.fn(),
}));

vi.mock("@/lib/admin/bulk/service", () => service);
vi.mock("@/lib/admin/bulk/processor", () => processor);

beforeEach(() => {
  vi.clearAllMocks();
});

const snapshot = (overrides: Partial<Record<string, unknown>> = {}) => ({
  jobId: "job-1",
  status: "RUNNING",
  remaining: 2,
  succeeded: 5,
  failed: 1,
  skipped: 0,
  ...overrides,
});

describe("createBulkJobAction", () => {
  it("creates a job from a valid selection (delegates to the service)", async () => {
    service.createBulkProfileJob.mockResolvedValue({
      ok: true,
      jobId: "job-1",
      totalItems: 3,
    });

    const result = await createBulkJobAction("store-1", ["p1", "p2", "p3"]);

    expect(result).toEqual({ ok: true, jobId: "job-1", totalItems: 3 });
    expect(service.createBulkProfileJob).toHaveBeenCalledWith({
      storeId: "store-1",
      perfumeIds: ["p1", "p2", "p3"],
    });
    // No AI in job creation: the processor is never touched.
    expect(processor.processBulkProfileChunk).not.toHaveBeenCalled();
  });

  it("rejects an empty selection", async () => {
    const result = await createBulkJobAction("store-1", []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("حداقل یک عطر");
    }
    expect(service.createBulkProfileJob).not.toHaveBeenCalled();
  });

  it("rejects a non-array selection", async () => {
    const result = await createBulkJobAction("store-1", "p1");
    expect(result.ok).toBe(false);
    expect(service.createBulkProfileJob).not.toHaveBeenCalled();
  });

  it("enforces the AI_BULK_MAX_ITEMS ceiling server-side", async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `p${i}`);
    const result = await createBulkJobAction("store-1", ids);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("حد مجاز");
    }
    expect(service.createBulkProfileJob).not.toHaveBeenCalled();
  });

  it("rejects non-string / empty ids before the service is called", async () => {
    const result = await createBulkJobAction("store-1", ["p1", "", 42]);
    expect(result.ok).toBe(false);
    expect(service.createBulkProfileJob).not.toHaveBeenCalled();
  });

  it("maps a foreign/missing store identically (no existence leak)", async () => {
    service.createBulkProfileJob.mockResolvedValue({ ok: false, reason: "INVALID_STORE" });
    const result = await createBulkJobAction("store-x", ["p1"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("فروشگاه");
    }
  });

  it("maps a foreign-store perfume to the selection message", async () => {
    service.createBulkProfileJob.mockResolvedValue({
      ok: false,
      reason: "PERFUME_SELECTION_INVALID",
    });
    const result = await createBulkJobAction("store-1", ["p-foreign"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("تعلق ندارند");
    }
  });
});

describe("startBulkJobAction / pauseBulkJobAction", () => {
  it("starts a valid job", async () => {
    service.startBulkProfileJob.mockResolvedValue({ ok: true, status: "RUNNING" });
    const result = await startBulkJobAction("job-1", "store-1");
    expect(result.ok).toBe(true);
    expect(service.startBulkProfileJob).toHaveBeenCalledWith("job-1", "store-1");
  });

  it("maps an illegal transition (start twice) to Persian feedback", async () => {
    service.startBulkProfileJob.mockResolvedValue({
      ok: false,
      reason: "INVALID_TRANSITION",
      detail: "RUNNING → RUNNING",
    });
    const result = await startBulkJobAction("job-1", "store-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("ممکن نیست");
    }
  });

  it("maps a foreign jobId to not-found (same as a missing job)", async () => {
    service.startBulkProfileJob.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    const result = await startBulkJobAction("job-foreign", "store-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("پیدا نشد");
    }
  });

  it("pauses a running job through the service", async () => {
    service.pauseBulkProfileJob.mockResolvedValue({
      ok: true,
      status: "PAUSED_RATE_LIMITED",
    });
    const result = await pauseBulkJobAction("job-1", "store-1");
    expect(result.ok).toBe(true);
  });
});

describe("processBulkChunkAction", () => {
  it("returns a serializable progress snapshot from the processor", async () => {
    processor.processBulkProfileChunk.mockResolvedValue({
      ok: true,
      chunk: {
        jobId: "job-1",
        storeId: "store-1",
        status: "RUNNING",
        processed: 10,
        succeeded: 8,
        failed: 1,
        skipped: 1,
        remaining: 5,
        pausedForRateLimit: false,
        timeBudgetExhausted: false,
      },
    });

    const result = await processBulkChunkAction("job-1", "store-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.processed).toBe(10);
      expect(result.progress).toEqual({
        jobId: "job-1",
        status: "RUNNING",
        remaining: 5,
        succeeded: 8,
        failed: 1,
        skipped: 1,
        total: 15,
      });
      expect(result.pausedForRateLimit).toBe(false);
    }
    // Thin adapter: no provider argument — the processor builds its own
    // provider internally (credentials never cross this boundary).
    expect(processor.processBulkProfileChunk).toHaveBeenCalledWith({
      jobId: "job-1",
      storeId: "store-1",
    });
  });

  it("maps a foreign job to Persian not-found", async () => {
    processor.processBulkProfileChunk.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    const result = await processBulkChunkAction("job-foreign", "store-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("پیدا نشد");
    }
  });
});

describe("getBulkJobProgressAction", () => {
  it("combines the snapshot with safe failed-item views", async () => {
    service.getBulkProfileJobProgress.mockResolvedValue({
      ok: true,
      progress: snapshot({ status: "COMPLETED_WITH_ERRORS", remaining: 0 }),
    });
    service.listBulkProfileFailedItems.mockResolvedValue({
      ok: true,
      items: [
        {
          itemId: "item-1",
          perfumeId: "p1",
          perfumeName: "عطر شب",
          errorCode: "http_429",
          errorMessage: "هوش مصنوعی محدودیت نرخ را اعمال کرد.",
        },
        {
          itemId: "item-2",
          perfumeId: "p2",
          perfumeName: null,
          errorCode: "invalid_output",
          errorMessage: "",
        },
      ],
    });

    const result = await getBulkJobProgressAction("job-1", "store-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.progress.status).toBe("COMPLETED_WITH_ERRORS");
      expect(result.failedItems).toHaveLength(2);
      // Safe stored message passes through; an empty one gets the Persian fallback.
      expect(result.failedItems[0].errorMessage).toContain("محدودیت نرخ");
      expect(result.failedItems[1].errorMessage).toContain("نامشخص");
      expect(result.failedItems[1].perfumeName).toBeNull();
    }
  });

  it("maps a foreign job to Persian not-found", async () => {
    service.getBulkProfileJobProgress.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    const result = await getBulkJobProgressAction("job-foreign", "store-1");
    expect(result.ok).toBe(false);
  });
});

describe("retryBulkFailedItemsAction", () => {
  it("retries all failed items through the batch service call", async () => {
    service.retryBulkProfileFailedItems.mockResolvedValue({ ok: true, retried: 3 });
    const result = await retryBulkFailedItemsAction("job-1", "store-1");
    expect(result).toEqual({ ok: true, retried: 3 });
    expect(service.retryBulkProfileFailedItems).toHaveBeenCalledWith("job-1", "store-1");
  });

  it("maps db failure to Persian feedback", async () => {
    service.retryBulkProfileFailedItems.mockResolvedValue({
      ok: false,
      reason: "DB_ERROR",
    });
    const result = await retryBulkFailedItemsAction("job-1", "store-1");
    expect(result.ok).toBe(false);
  });
});

describe("getOpenBulkJobForStoreAction", () => {
  it("returns null when the store has no open job", async () => {
    service.getLatestOpenBulkProfileJob.mockResolvedValue({ ok: true, job: null });
    expect(await getOpenBulkJobForStoreAction("store-1")).toBeNull();
  });

  it("restores an in-flight job with progress and failures", async () => {
    service.getLatestOpenBulkProfileJob.mockResolvedValue({
      ok: true,
      job: { jobId: "job-1", status: "PAUSED_RATE_LIMITED" },
    });
    service.getBulkProfileJobProgress.mockResolvedValue({
      ok: true,
      progress: snapshot({ status: "PAUSED_RATE_LIMITED" }),
    });
    service.listBulkProfileFailedItems.mockResolvedValue({ ok: true, items: [] });

    const view = await getOpenBulkJobForStoreAction("store-1");
    expect(view).not.toBeNull();
    expect(view?.status).toBe("PAUSED_RATE_LIMITED");
    expect(view?.progress?.total).toBe(8);
  });

  it("returns null for an invalid store id without touching the service", async () => {
    expect(await getOpenBulkJobForStoreAction("   ")).toBeNull();
    expect(service.getLatestOpenBulkProfileJob).not.toHaveBeenCalled();
  });
});

describe("bulk UI presentation model", () => {
  it("labels every existing job state and degrades unknown codes", () => {
    expect(bulkStatusLabel("PENDING")).toBe("در صف");
    expect(bulkStatusLabel("RUNNING")).toBe("در حال پردازش");
    expect(bulkStatusLabel("PAUSED_RATE_LIMITED")).toContain("متوقف");
    expect(bulkStatusLabel("COMPLETED")).toBe("کامل شد");
    expect(bulkStatusLabel("COMPLETED_WITH_ERRORS")).toContain("با خطا");
    expect(bulkStatusLabel("FAILED")).toBe("ناموفق");
    expect(bulkStatusLabel("SOMETHING_ELSE")).toBe("SOMETHING_ELSE");
  });

  it("detects terminal states exactly as the 12.1 contract defines them", () => {
    expect(isTerminalBulkJobStatus("COMPLETED")).toBe(true);
    expect(isTerminalBulkJobStatus("COMPLETED_WITH_ERRORS")).toBe(true);
    expect(isTerminalBulkJobStatus("FAILED")).toBe(true);
    expect(isTerminalBulkJobStatus("PENDING")).toBe(false);
    expect(isTerminalBulkJobStatus("RUNNING")).toBe(false);
    expect(isTerminalBulkJobStatus("PAUSED_RATE_LIMITED")).toBe(false);
  });

  it("computes the percentage from DB-derived counts only", () => {
    expect(bulkProgressPercent(0, 10)).toBe(0);
    expect(bulkProgressPercent(5, 10)).toBe(50);
    expect(bulkProgressPercent(10, 10)).toBe(100);
    expect(bulkProgressPercent(3, 0)).toBe(0); // no fake progress
    expect(bulkProgressPercent(15, 10)).toBe(100); // clamped
  });
});
