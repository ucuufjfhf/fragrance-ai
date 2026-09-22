"use client";

import { useState, useTransition } from "react";

import {
  toggleActiveAction,
  toggleInStockAction,
} from "@/app/admin/perfumes/actions";
import type { AdminActionState } from "@/app/admin/perfumes/actions";

/**
 * Toggle controls for `active` and `inStock` on the admin list.
 *
 * Client component: buttons call the server actions (which re-check store
 * isolation before writing) and surface the returned Persian feedback.
 */
interface PerfumeTogglesProps {
  perfumeId: string;
  storeId: string;
  active: boolean;
  inStock: boolean;
}

export default function PerfumeToggles({
  perfumeId,
  storeId,
  active,
  inStock,
}: PerfumeTogglesProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<AdminActionState | null>(null);

  const run = (action: () => Promise<AdminActionState>) => {
    startTransition(async () => {
      setFeedback(await action());
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => toggleActiveAction(perfumeId, storeId, !active))}
          aria-pressed={active}
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
            active
              ? "border-accent/40 bg-accent-soft text-accent"
              : "border-border-soft text-muted hover:border-accent/50 hover:text-foreground"
          }`}
        >
          {active ? "فعال" : "غیرفعال"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => toggleInStockAction(perfumeId, storeId, !inStock))}
          aria-pressed={inStock}
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
            inStock
              ? "border-border-soft text-foreground"
              : "border-border-soft text-muted hover:border-accent/50 hover:text-foreground"
          }`}
        >
          {inStock ? "موجود" : "ناموجود"}
        </button>
      </div>
      {feedback ? (
        <span
          role="status"
          className={`text-xs ${feedback.ok ? "text-accent" : "text-red-400"}`}
          aria-live="polite"
        >
          {feedback.message}
        </span>
      ) : null}
    </div>
  );
}
