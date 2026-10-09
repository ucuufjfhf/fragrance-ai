"use client";

import { useState } from "react";

/**
 * «کد نصب ویجت» — the merchant-facing installation snippet (Phase 8, §28).
 *
 * Shows the exact copy/paste <script> tag for this store. The URL comes from
 * `NEXT_PUBLIC_APP_URL` (documented deployment configuration; the production
 * hostname is never invented here) with a window.location fallback for local
 * development. Copy-to-clipboard is a real user action with visible feedback.
 */
export default function WidgetEmbedCode({
  storeId,
  appUrl,
}: {
  storeId: string;
  appUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  const snippet = `<script src="${appUrl}/widget.js" data-store-id="${storeId}"></script>`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied — the snippet stays selectable on screen.
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border-soft bg-surface p-4">
      <h2 className="text-sm font-semibold">کد نصب ویجت</h2>
      <p className="text-xs leading-6 text-muted">
        این کد را در صفحهٔ فروشگاه خود قرار دهید تا مشتریان بدون ترک سایت، آزمون سلیقهٔ
        عطری را ببینند.
      </p>
      <pre
        dir="ltr"
        className="tnum overflow-x-auto rounded-[var(--radius-md)] bg-surface-2 p-3 text-left text-xs leading-6"
        aria-label="کد نصب ویجت"
      >
        {snippet}
      </pre>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="w-fit rounded-[var(--radius-md)] border border-border-soft px-4 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-accent"
      >
        {copied ? "کپی شد ✓" : "کپی کد"}
      </button>
    </section>
  );
}
