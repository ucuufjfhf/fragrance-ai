"use client";

import { useState } from "react";

/**
 * Share-this-result: copies the current page URL.
 *
 * The whole quiz outcome already lives in the URL (see
 * `lib/results/params.ts`), so the copied link reproduces this exact result
 * when opened. `navigator.clipboard` first with a textarea + `execCommand`
 * fallback for older browsers; a brief inline «لینک کپی شد» confirms success
 * (also announced via `aria-live`). No animation, no new motion language —
 * the same bordered action styling as the restart link beside it.
 */
export default function ShareResultButton() {
  const [copied, setCopied] = useState(false);

  async function copyUrl(): Promise<void> {
    const url = window.location.href;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(url);
      } else {
        const area = document.createElement("textarea");
        area.value = url;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copyUrl()}
      aria-live="polite"
      className="btn-secondary flex min-h-12 flex-1 items-center justify-center px-5 text-sm text-muted hover:text-foreground"
    >
      {copied ? "لینک کپی شد" : "اشتراک‌گذاری نتیجه"}
    </button>
  );
}
