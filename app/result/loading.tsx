/**
 * Route-level loading state for /result.
 *
 * Shown while the server component awaits the deterministic engine (and, when
 * the AI provider is configured, its explanations). Persian copy, accessible
 * to screen readers via aria-busy.
 */
export default function ResultLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <section className="flex flex-col items-center gap-4 rounded-3xl border border-border-soft bg-surface p-8 text-center sm:p-12">
        <span
          aria-hidden="true"
          className="h-10 w-10 animate-spin rounded-full border-2 border-border-soft border-t-accent"
        />
        <p className="text-sm leading-8 text-muted" role="status">
          در حال پیدا کردن عطر مناسب برای تو...
        </p>
      </section>
    </main>
  );
}
