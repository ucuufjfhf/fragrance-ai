import { BULK_JOB_TERMINAL_STATUSES, type BulkJobStatus } from "@/lib/admin/bulk/contract";

/**
 * Pure presentation model for the Phase 12.5 admin bulk UI.
 *
 * Dependency-free leaf module: no React, no DB, no AI — the state→label/percent
 * decisions live here so they are unit-testable in the plain `node` Vitest
 * environment and the client component stays declarative. It introduces NO new
 * job states: labels map 1:1 onto the existing `BulkJobStatus` values, and
 * terminal detection reuses the Phase 12.1 contract list.
 */

/** Persian label for every existing job state (never an invented state). */
export const BULK_STATUS_LABELS: Record<BulkJobStatus, string> = {
  PENDING: "در صف",
  RUNNING: "در حال پردازش",
  PAUSED_RATE_LIMITED: "متوقف (محدودیت نرخ هوش مصنوعی)",
  COMPLETED: "کامل شد",
  COMPLETED_WITH_ERRORS: "کامل شد (با خطا)",
  FAILED: "ناموفق",
};

/** Label for a status string; unknown values degrade to the raw code. */
export function bulkStatusLabel(status: string): string {
  return (BULK_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

/** True only for the contract's terminal states (reuses the 12.1 list). */
export function isTerminalBulkJobStatus(status: string): boolean {
  return (BULK_JOB_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Resume is offered only for the rate-limit pause (the service's resumable state). */
export function canResumeBulkJob(status: string): boolean {
  return status === "PAUSED_RATE_LIMITED";
}

/** Live item-derived terminal count for one progress snapshot. */
export function bulkDoneCount(progress: {
  succeeded: number;
  failed: number;
  skipped: number;
}): number {
  return progress.succeeded + progress.failed + progress.skipped;
}

/**
 * Integer 0–100 completion percentage from the DB-derived counts.
 * A zero/absent total stays at 0 (no fake progress).
 */
export function bulkProgressPercent(done: number, total: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(done) || total <= 0) {
    return 0;
  }
  const percent = Math.floor((Math.max(0, done) / total) * 100);
  return Math.min(100, Math.max(0, percent));
}
