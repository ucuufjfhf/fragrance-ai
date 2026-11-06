/**
 * Canonical store branding rules — pure, no Prisma, no React.
 *
 * The only value a merchant can customise today is the widget accent colour, so
 * this module is deliberately small: ONE pattern (`#rrggbb`, six hex digits,
 * normalised to lowercase) used by every write path, plus a defensive reader for
 * values that did not come through it. Keeping it here means the provisioner
 * script, the widget config route and the widget shell can never drift apart.
 *
 * NULL means "FIAGE default": a store without a colour is exactly the store we
 * shipped before this field existed, not a store with a broken one.
 */

/** Six hex digits, `#rrggbb`. Accepts upper case; storage is lower case. */
export const ACCENT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export type AccentColorValidation =
  | { ok: true; value: string | null }
  | { ok: false; reason: string };

/**
 * Validates an operator-supplied accent colour.
 *
 * - absent / empty / whitespace → `{ ok: true, value: null }` (keep the default);
 * - `#RRGGBB` in any case → `{ ok: true, value: "#rrggbb" }` (lowercased);
 * - anything else → `{ ok: false }`, so a caller can reject it loudly instead
 *   of silently storing a colour the widget cannot use.
 */
export function validateAccentColor(value: unknown): AccentColorValidation {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return { ok: false, reason: "رنگ برند باید متنی در قالب #RRGGBB باشد." };
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    return { ok: true, value: null };
  }

  if (!ACCENT_COLOR_PATTERN.test(trimmed)) {
    return { ok: false, reason: "رنگ برند باید دقیقاً در قالب #RRGGBB باشد (مثلاً #1F6F5C)." };
  }

  return { ok: true, value: trimmed.toLowerCase() };
}

/**
 * Defensive read for a stored value: returns the normalised colour, or null when
 * the column is empty OR holds something the pattern does not accept (a
 * hand-edited row). The widget then falls back to the default accent, exactly as
 * it does for a store with no colour at all.
 */
export function normalizeAccentColor(value: unknown): string | null {
  const result = validateAccentColor(value);

  return result.ok ? result.value : null;
}
