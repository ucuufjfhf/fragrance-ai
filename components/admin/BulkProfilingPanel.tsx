"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createBulkJobAction,
  getBulkJobProgressAction,
  getOpenBulkJobForStoreAction,
  pauseBulkJobAction,
  processBulkChunkAction,
  retryBulkFailedItemsAction,
  startBulkJobAction,
  type AdminBulkJobView,
  type BulkFailedItemView,
} from "@/app/admin/perfumes/bulk-actions";
import { toPersianDigits } from "@/lib/persian";
import {
  bulkDoneCount,
  bulkProgressPercent,
  bulkStatusLabel,
  isTerminalBulkJobStatus,
} from "@/lib/admin/bulk/ui";

/**
 * Phase 12.5 — bulk AI profiling panel on the admin product list.
 *
 * Minimal functional UI, deliberately not a redesign. It covers:
 *  - per-product selection (checkboxes) + select-all + count/max indicator;
 *  - explicit job creation («AI پروفایل‌سازی» — never automatic);
 *  - browser-driven chunk progression: each call runs ONE bounded chunk
 *    server-side, then the panel triggers the next until the job pauses or
 *    terminates — no server loops, no workers, no WebSockets;
 *  - DB-derived progress (counts + percentage from returned snapshots — no
 *    client-side fake progress);
 *  - pause/resume through the service's state machine;
 *  - failed-item list with safe Persian messages and batch retry.
 *
 * Overlap prevention: a single `chunkInFlight` ref makes concurrent click
 * handlers/continuations coalesce into at most one in-flight chunk request
 * per UI instance. (The service's atomic claiming already makes overlapping
 * requests harmless at the data level; this keeps the UX calm.)
 */

interface BulkProfilingPanelProps {
  storeId: string;
  perfumes: readonly { id: string; name: string; brand: string }[];
  /** The store's newest open job, if any (restored after a page reload). */
  initialOpenJob: AdminBulkJobView | null;
  /** Selection ceiling (`AI_BULK_MAX_ITEMS`, resolved server-side). */
  maxItems: number;
}

type Phase =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "job"; jobId: string; view: AdminBulkJobView };

/** Consecutive "nothing resolved" chunk results before the loop stops. */
const MAX_STALLED_CHUNKS = 2;

export default function BulkProfilingPanel({
  storeId,
  perfumes,
  initialOpenJob,
  maxItems,
}: BulkProfilingPanelProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [phase, setPhase] = useState<Phase>(
    initialOpenJob
      ? { kind: "job", jobId: initialOpenJob.jobId, view: initialOpenJob }
      : { kind: "idle" },
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  // Overlap guard for chunk requests from THIS instance (a ref so concurrent
  // handlers observe the in-flight flag synchronously).
  const chunkInFlight = useRef(false);
  const autoAbort = useRef(false);

  const busy = phase.kind === "busy" || autoRunning;
  const view = phase.kind === "job" ? phase.view : null;
  const jobId = phase.kind === "job" ? phase.jobId : null;

  const toggle = (perfumeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(perfumeId)) {
        next.delete(perfumeId);
      } else if (next.size < maxItems) {
        next.add(perfumeId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === perfumes.length) {
        return new Set<string>();
      }
      // When over the cap (shouldn't happen: the list is bounded), still
      // select at most `maxItems` to respect the server contract.
      return new Set(perfumes.slice(0, maxItems).map((perfume) => perfume.id));
    });
  };

  const allSelected = perfumes.length > 0 && selected.size === perfumes.length;

  /** Reads the DB truth for a job (null when the job is gone/unreadable). */
  const refreshView = useCallback(
    async (id: string): Promise<AdminBulkJobView | null> => {
      const progress = await getBulkJobProgressAction(id, storeId);
      if (!progress.ok) {
        return null;
      }
      return {
        jobId: id,
        status: progress.progress.status,
        progress: progress.progress,
        failedItems: progress.failedItems,
      };
    },
    [storeId],
  );

  /** Creates the job from the current selection and enters the job view. */
  const handleCreate = async () => {
    if (selected.size === 0 || busy) {
      return;
    }
    setError(null);
    setNotice(null);
    setPhase({ kind: "busy" });
    const result = await createBulkJobAction(storeId, [...selected]);
    if (!result.ok) {
      setError(result.message);
      setPhase({ kind: "idle" });
      return;
    }
    const fresh = await refreshView(result.jobId);
    setPhase(
      fresh
        ? { kind: "job", jobId: result.jobId, view: fresh }
        : { kind: "idle" },
    );
  };

  /** Starts (PENDING) or resumes (PAUSED_RATE_LIMITED) the job. */
  const handleStart = async () => {
    if (!jobId || busy) {
      return;
    }
    setError(null);
    setNotice(null);
    const started = await startBulkJobAction(jobId, storeId);
    if (!started.ok) {
      setError(started.message);
      return;
    }
    const fresh = await refreshView(jobId);
    if (fresh) {
      setPhase({ kind: "job", jobId, view: fresh });
    }
  };

  /**
   * Runs chunks one after another until the job pauses, terminates, stalls,
   * or the admin aborts. Each chunk is ONE bounded server call; the browser
   * merely sequences them. The `chunkInFlight` guard guarantees a single
   * in-flight request from this instance.
   */
  const runChunkLoop = useCallback(async () => {
    if (chunkInFlight.current || autoRunning) {
      return;
    }
    chunkInFlight.current = true;
    autoAbort.current = false;
    setAutoRunning(true);
    setError(null);
    setNotice(null);

    try {
      let stalled = 0;

      for (;;) {
        if (autoAbort.current) {
          setNotice("پردازش بعدی را خودتان آغاز کنید.");
          break;
        }

        const currentJobId = jobIdRef.current;
        if (!currentJobId) {
          break;
        }

        const result = await processBulkChunkAction(currentJobId, storeId);
        if (!result.ok) {
          setError(result.message);
          break;
        }

        const progress = await getBulkJobProgressAction(currentJobId, storeId);
        const fresh: AdminBulkJobView = {
          jobId: currentJobId,
          status: result.progress.status,
          progress: progress.ok ? progress.progress : result.progress,
          failedItems: progress.ok ? progress.failedItems : [],
        };
        setPhase({ kind: "job", jobId: currentJobId, view: fresh });

        const terminal = isTerminalBulkJobStatus(fresh.status);
        const paused = fresh.status === "PAUSED_RATE_LIMITED";

        if (terminal) {
          break;
        }
        if (paused) {
          setNotice(
            "پردازش به دلیل محدودیت نرخ هوش مصنوعی متوقف شد؛ بعداً ادامه دهید.",
          );
          break;
        }

        // Stall guard: a chunk that resolves nothing (e.g. persistent item
        // release races) must not spin forever.
        if (result.processed === 0) {
          stalled += 1;
          if (stalled >= MAX_STALLED_CHUNKS) {
            setNotice("پیشرفتی ثبت نشد؛ پردازش متوقف شد. دوباره تلاش کنید.");
            break;
          }
        } else {
          stalled = 0;
        }
      }
    } finally {
      chunkInFlight.current = false;
      setAutoRunning(false);
    }
  }, [autoRunning, storeId]);

  // The loop needs the CURRENT jobId without re-creating itself on every
  // phase change; a ref mirrors the latest value (synced in an effect —
  // refs must not be written during render).
  const jobIdRef = useRef<string | null>(initialOpenJob?.jobId ?? null);
  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  const handleAbort = () => {
    autoAbort.current = true;
  };

  const handlePause = async () => {
    if (!jobId || busy) {
      return;
    }
    autoAbort.current = true;
    setError(null);
    setNotice(null);
    const paused = await pauseBulkJobAction(jobId, storeId);
    if (!paused.ok) {
      setError(paused.message);
      return;
    }
    const fresh = await refreshView(jobId);
    if (fresh) {
      setPhase({ kind: "job", jobId, view: fresh });
    }
  };

  const handleRetryFailed = async () => {
    if (!jobId || busy) {
      return;
    }
    setError(null);
    setNotice(null);
    const retried = await retryBulkFailedItemsAction(jobId, storeId);
    if (!retried.ok) {
      setError(retried.message);
      return;
    }
    const fresh = await refreshView(jobId);
    if (fresh) {
      setPhase({ kind: "job", jobId, view: fresh });
    }
  };

  const handleRefresh = async () => {
    if (jobId && !busy) {
      const fresh = await refreshView(jobId);
      if (fresh) {
        setPhase({ kind: "job", jobId, view: fresh });
      }
      return;
    }
    if (busy) {
      return;
    }
    setError(null);
    setNotice(null);
    setPhase({ kind: "busy" });
    const open = await getOpenBulkJobForStoreAction(storeId);
    setPhase(open ? { kind: "job", jobId: open.jobId, view: open } : { kind: "idle" });
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-surface p-4"
      aria-label="پروفایل‌سازی گروهی با هوش مصنوعی"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">پروفایل‌سازی گروهی با هوش مصنوعی</h2>
        <p className="text-xs leading-6 text-muted">
          عطرهای انتخاب‌شده به سرویس هوش مصنوعی ارسال می‌شوند تا توصیف‌های خالی
          پروفایل آن‌ها پیشنهاد شود. این کار هرگز خودکار شروع نمی‌شود؛ فقط
          مقادیر خالی پر می‌شوند و محورهای تطبیق دست‌نخورده می‌مانند.
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-xs text-red-400" aria-live="polite">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-xs text-accent" aria-live="polite">
          {notice}
        </p>
      ) : null}

      {view && jobId ? (
        <BulkJobProgressView
          view={view}
          busy={busy}
          autoRunning={autoRunning}
          onChunk={runChunkLoop}
          onAbort={handleAbort}
          onPause={handlePause}
          onResume={handleStart}
          onRetryFailed={handleRetryFailed}
          onRefresh={handleRefresh}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleAll}
              disabled={perfumes.length === 0}
              className="rounded-full border border-border-soft px-4 py-2 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground disabled:opacity-50"
            >
              {allSelected ? "لغو انتخاب همه" : "انتخاب همه"}
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || busy}
              onClick={() => void handleCreate()}
              className="rounded-xl bg-accent px-5 py-2 text-xs font-medium text-background transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              AI پروفایل‌سازی ({toPersianDigits(selected.size)})
            </button>
            <span className="text-xs text-muted">
              حداکثر {toPersianDigits(maxItems)} مورد
            </span>
          </div>

          <ul className="flex flex-col gap-1">
            {perfumes.map((perfume) => (
              <li key={perfume.id}>
                <label className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={selected.has(perfume.id)}
                    onChange={() => toggle(perfume.id)}
                    disabled={busy}
                  />
                  <span className="font-medium">{perfume.name}</span>
                  <span className="text-xs text-muted">— {perfume.brand}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Progress + controls for an existing job (DB-derived values only). */
function BulkJobProgressView({
  view,
  busy,
  autoRunning,
  onChunk,
  onAbort,
  onPause,
  onResume,
  onRetryFailed,
  onRefresh,
}: {
  view: AdminBulkJobView;
  busy: boolean;
  autoRunning: boolean;
  onChunk: () => void;
  onAbort: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetryFailed: () => void;
  onRefresh: () => void;
}) {
  const progress = view.progress;
  const done = progress ? bulkDoneCount(progress) : 0;
  const percent = progress ? bulkProgressPercent(done, progress.total) : 0;
  const terminal = isTerminalBulkJobStatus(view.status);
  const paused = view.status === "PAUSED_RATE_LIMITED";
  const running = view.status === "RUNNING";
  const pending = view.status === "PENDING";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-border-soft px-3 py-1 font-medium">
          {bulkStatusLabel(view.status)}
        </span>
        {progress ? (
          <span className="text-muted">
            {toPersianDigits(done)} از {toPersianDigits(progress.total)} —{" "}
            {toPersianDigits(percent)}٪
          </span>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="ms-auto rounded-full border border-border-soft px-3 py-1 text-muted transition-colors hover:border-accent/50 hover:text-foreground disabled:opacity-50"
        >
          بررسی وضعیت
        </button>
      </div>

      {progress ? (
        <>
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <div className="flex gap-1">
              <dt>موفق:</dt>
              <dd>{toPersianDigits(progress.succeeded)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>ناموفق:</dt>
              <dd>{toPersianDigits(progress.failed)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>ردشده:</dt>
              <dd>{toPersianDigits(progress.skipped)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>در انتظار:</dt>
              <dd>{toPersianDigits(progress.remaining)}</dd>
            </div>
          </dl>
        </>
      ) : null}

      {paused ? (
        <p
          role="status"
          className="rounded-xl border border-border-soft bg-surface-2 p-3 text-xs leading-6"
        >
          پردازش متوقف است (محدودیت نرخ هوش مصنوعی). با «ادامه» از همان‌جا
          پیش می‌رود.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!terminal && !paused ? (
          <>
            {autoRunning ? (
              <button
                type="button"
                onClick={onAbort}
                className="rounded-xl border border-border-soft px-4 py-2 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground"
              >
                توقف پس از این دسته
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={onChunk}
                className="rounded-xl bg-accent px-5 py-2 text-xs font-medium text-background transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {pending ? "شروع پردازش" : "ادامهٔ پردازش"}
              </button>
            )}
            <button
              type="button"
              disabled={busy || autoRunning || !running}
              onClick={onPause}
              className="rounded-xl border border-border-soft px-4 py-2 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground disabled:opacity-50"
            >
              توقف
            </button>
          </>
        ) : null}
        {paused ? (
          <button
            type="button"
            disabled={busy}
            onClick={onResume}
            className="rounded-xl bg-accent px-5 py-2 text-xs font-medium text-background transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            ادامه
          </button>
        ) : null}
        {progress && progress.failed > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRetryFailed}
            className="rounded-xl border border-border-soft px-4 py-2 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground disabled:opacity-50"
          >
            تلاش مجدد برای موارد ناموفق
          </button>
        ) : null}
      </div>

      {view.failedItems.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="موارد ناموفق">
          {view.failedItems.map((item) => (
            <FailedItemRow key={item.itemId} item={item} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FailedItemRow({ item }: { item: BulkFailedItemView }) {
  return (
    <li className="flex flex-col gap-0.5 rounded-xl border border-border-soft bg-surface-2 p-3 text-xs">
      <span className="font-medium">{item.perfumeName ?? "—"}</span>
      <span className="text-muted">{item.errorMessage}</span>
    </li>
  );
}
