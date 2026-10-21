/**
 * The store's identity strip at the top of the embedded widget (first-store
 * pilot). A merchant's customers must be able to tell whose shop the quiz
 * belongs to, so every widget screen carries the store's logo and name.
 *
 * Presentation only: `name` and `logoUrl` come from the public
 * `GET /api/widget/config` payload, which this component never fetches.
 * Deliberately quiet — a hairline rule and one small row, no card, no
 * background — so it reads as a masthead above the quiz rather than a second
 * heading competing with the question.
 *
 * The logo is a merchant-hosted absolute URL (http(s), enforced at
 * provisioning), so a plain <img> is used: `next/image` would require every
 * merchant domain at build time. The fixed 32px height with `object-contain`
 * keeps any logo aspect ratio inside the row without distortion, and the row
 * is allowed to shrink (`min-w-0` + `truncate`) so a long store name can never
 * cause horizontal overflow at 390px.
 */
export default function WidgetStoreHeader({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  return (
    <header className="flex min-w-0 items-center gap-3 border-b border-border-soft pb-4">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={name}
          height={32}
          loading="lazy"
          decoding="async"
          className="h-8 w-auto max-w-28 shrink-0 object-contain"
        />
      ) : null}
      <span className="min-w-0 truncate text-sm font-semibold text-foreground">{name}</span>
    </header>
  );
}
