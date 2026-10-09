/**
 * Route-level loading state for /result.
 *
 * Shown while the server component awaits the deterministic engine (and, when
 * the AI provider is configured, its explanations). The skeleton mirrors the
 * night-sky reveal so the layout does not jump when the real profile arrives.
 */
export default function ResultLoading() {
  return (
    <main className="flex flex-1 flex-col">
      <section
        data-surface="dark"
        className="horizon relative isolate overflow-hidden"
        aria-busy="true"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-5 py-16 text-center sm:px-8 sm:py-20">
          <span
            aria-hidden="true"
            className="h-10 w-10 animate-spin rounded-full border-2 border-border-soft border-t-champagne"
          />
          <p className="text-sm leading-8 text-muted" role="status">
            در حال پیدا کردن عطر مناسب برای تو...
          </p>
        </div>
      </section>

      <section className="bg-background">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-14 sm:px-8">
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-surface p-5"
            >
              <span aria-hidden="true" className="h-16 w-16 rounded-[var(--radius-md)] bg-surface-2" />
              <span aria-hidden="true" className="flex flex-1 flex-col gap-3">
                <span className="h-3 w-1/3 rounded-full bg-surface-2" />
                <span className="h-2 w-2/3 rounded-full bg-surface-2" />
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
