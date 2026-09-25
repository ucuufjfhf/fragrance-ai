import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BulkProfilingPanel from "@/components/admin/BulkProfilingPanel";
import type { AdminBulkJobView } from "@/app/admin/perfumes/bulk-actions";

/**
 * Phase 12.5 SSR smoke tests for the bulk profiling panel (project
 * convention: react-dom/server, no jsdom, no browser). The interactive
 * state machine (create → chunk → complete / pause → resume / failed → retry)
 * is covered by the adapter tests in `tests/admin/bulk-actions.test.ts` plus
 * the 12.3/12.4 engine suites; these verify each UI state renders the right
 * DB-derived values with no fake progress.
 */

function render(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/<!--[\s\S]*?-->/g, "");
}

const perfumes = [
  { id: "p1", name: "عطر سپیده", brand: "دمو" },
  { id: "p2", name: "عطر شب", brand: "دمو" },
];

const view = (overrides: Partial<AdminBulkJobView> = {}): AdminBulkJobView => ({
  jobId: "job-1",
  status: "RUNNING",
  progress: {
    jobId: "job-1",
    status: "RUNNING",
    remaining: 3,
    succeeded: 5,
    failed: 1,
    skipped: 1,
    total: 10,
  },
  failedItems: [],
  ...overrides,
});

describe("BulkProfilingPanel rendering", () => {
  it("renders the selection list and max indicator before a job exists", () => {
    const html = render(
      <BulkProfilingPanel
        storeId="store-1"
        perfumes={perfumes}
        initialOpenJob={null}
        maxItems={500}
      />,
    );

    expect(html).toContain("پروفایل‌سازی گروهی");
    expect(html).toContain("عطر سپیده");
    expect(html).toContain("عطر شب");
    expect(html).toContain("حداکثر");
    // The explicit, never-automatic start action is present.
    expect(html).toContain("AI پروفایل‌سازی");
    // No progress UI exists without a job.
    expect(html).not.toContain("progressbar");
  });

  it("renders DB-derived progress with percentage and per-status counts", () => {
    const html = render(
      <BulkProfilingPanel
        storeId="store-1"
        perfumes={perfumes}
        initialOpenJob={view()}
        maxItems={500}
      />,
    );

    expect(html).toContain("progressbar");
    expect(html).toContain('aria-valuenow="70"'); // (5+1+1)/10
    expect(html).toContain("در حال پردازش");
    expect(html).toContain("موفق");
    expect(html).toContain("ادامهٔ پردازش");
    expect(html).toContain("توقف");
  });

  it("renders the rate-limit pause state with a resume action", () => {
    const html = render(
      <BulkProfilingPanel
        storeId="store-1"
        perfumes={perfumes}
        initialOpenJob={view({
          status: "PAUSED_RATE_LIMITED",
          progress: {
            jobId: "job-1",
            status: "PAUSED_RATE_LIMITED",
            remaining: 4,
            succeeded: 6,
            failed: 0,
            skipped: 0,
            total: 10,
          },
        })}
        maxItems={500}
      />,
    );

    expect(html).toContain("متوقف");
    expect(html).toContain("محدودیت نرخ");
    expect(html).toContain("ادامه");
    expect(html).not.toContain("ادامهٔ پردازش");
  });

  it("renders failed items with safe messages and a retry action", () => {
    const html = render(
      <BulkProfilingPanel
        storeId="store-1"
        perfumes={perfumes}
        initialOpenJob={view({
          status: "COMPLETED_WITH_ERRORS",
          progress: {
            jobId: "job-1",
            status: "COMPLETED_WITH_ERRORS",
            remaining: 0,
            succeeded: 9,
            failed: 1,
            skipped: 0,
            total: 10,
          },
          failedItems: [
            {
              itemId: "item-1",
              perfumeName: "عطر شب",
              errorMessage: "هوش مصنوعی محدودیت نرخ را اعمال کرد.",
            },
          ],
        })}
        maxItems={500}
      />,
    );

    expect(html).toContain("با خطا");
    expect(html).toContain("عطر شب");
    expect(html).toContain("محدودیت نرخ");
    expect(html).toContain("تلاش مجدد");
    expect(html).toContain("کامل شد");
  });

  it("shows the terminal completed state without processing controls", () => {
    const html = render(
      <BulkProfilingPanel
        storeId="store-1"
        perfumes={perfumes}
        initialOpenJob={view({
          status: "COMPLETED",
          progress: {
            jobId: "job-1",
            status: "COMPLETED",
            remaining: 0,
            succeeded: 10,
            failed: 0,
            skipped: 0,
            total: 10,
          },
        })}
        maxItems={500}
      />,
    );

    expect(html).toContain("کامل شد");
    expect(html).toContain('aria-valuenow="100"');
    expect(html).not.toContain("ادامهٔ پردازش");
    expect(html).not.toContain("تلاش مجدد");
  });
});
