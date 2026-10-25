"use client";

import { useState, useTransition } from "react";

import { regenerateReportTokenAction } from "@/app/admin/analytics/actions";
import type { AdminActionState } from "@/app/admin/perfumes/actions";

/**
 * Report-link panel on the admin analytics view (pilot reporting).
 *
 * Client component: shows the tokenized report link with a copy button, and
 * a rotate button that calls the server action (which re-checks the admin
 * gate before writing). The old link dies on rotation.
 */
export default function ReportLinkPanel({
  storeId,
  storeName,
  reportToken,
}: {
  storeId: string;
  storeName: string;
  reportToken: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<AdminActionState | null>(null);
  const [copied, setCopied] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  // The just-rotated token renders immediately; otherwise the stored one.
  const visibleToken = freshToken ?? reportToken;
  const reportPath = visibleToken ? `/store-report/${visibleToken}` : null;

  const copyLink = async () => {
    if (!reportPath) {
      return;
    }

    const url = `${window.location.origin}${reportPath}`;

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API can be unavailable (permissions, non-secure context):
      // fall back to a selectable input the merchant can copy by hand.
      const input = document.getElementById("store-report-link") as HTMLInputElement | null;
      input?.focus();
      input?.select();
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const rotate = () => {
    startTransition(async () => {
      const result = await regenerateReportTokenAction(storeId);

      setFeedback({ ok: result.ok, message: result.message });

      if (result.ok && result.reportToken) {
        setFreshToken(result.reportToken);
        setCopied(false);
      }
    });
  };

  return (
    <section
      aria-label={`پیوند گزارش فروشگاه ${storeName}`}
      className="mt-6 rounded-2xl border border-border-soft bg-surface p-4"
    >
      <h2 className="text-sm font-bold">پیوند گزارش فروشگاه</h2>
      <p className="mt-1 text-xs leading-6 text-muted">
        هر کس این پیوند را داشته باشد، گزارش همین فروشگاه را می‌بیند؛ آن را فقط
        با صاحب فروشگاه در میان بگذارید. با تازه‌سازی، پیوند قبلی باطل می‌شود.
      </p>

      {reportPath ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="store-report-link"
            readOnly
            value={reportPath}
            dir="ltr"
            aria-label="پیوند گزارش فروشگاه"
            className="min-w-0 flex-1 rounded-lg border border-border-soft bg-surface-2 px-3 py-1.5 text-left text-xs tnum"
          />
          <button
            type="button"
            onClick={copyLink}
            className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs text-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {copied ? "کپی شد." : "کپی پیوند"}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">
          برای این فروشگاه هنوز پیوندی ساخته نشده است.
        </p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={rotate}
        className="mt-3 rounded-lg border border-border-soft px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {pending
          ? "در حال ساخت…"
          : reportPath
            ? "تازه‌سازی پیوند (ابطال پیوند قبلی)"
            : "ساخت پیوند گزارش"}
      </button>

      {feedback ? (
        <p role="status" className="mt-2 text-xs text-muted">
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
