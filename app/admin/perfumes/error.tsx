"use client";

import { WarningMark } from "@/components/ui-icons";

import { useEffect } from "react";

export default function AdminPerfumesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("admin perfumes page failed:", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <section className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-surface p-8 text-center">
        <WarningMark className="mx-auto h-8 w-8 text-accent" />
        <h1 className="text-lg font-semibold">خطا در بارگذاری مدیریت عطرها</h1>
        <p className="text-sm leading-8 text-muted">
          مشکلی پیش اومد؛ می‌تونی دوباره تلاش کنی.
        </p>
        <button
          type="button"
          onClick={reset}
          className="flex min-h-12 items-center justify-center rounded-[var(--radius-md)] btn-primary flex min-h-12 items-center justify-center rounded-full px-7 text-sm font-medium "
        >
          تلاش دوباره
        </button>
      </section>
    </main>
  );
}
