const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"] as const;

/** Converts Latin digits to Persian-Indic digits, e.g. `"3"` → `"۳"`. */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

/** Formats a 0–100 number as a Persian percentage, e.g. `92` → `«۹۲٪»`. */
export function formatPersianPercent(value: number): string {
  return `${toPersianDigits(Math.round(value))}٪`;
}

/**
 * Display form of an engine presentation score: a closeness index
 * («شاخص نزدیکی») on a 0–100 scale with Persian digits, e.g.
 * `92.4` → `«۹۲»`.
 *
 * Deliberately NOT a percentage. The score is a normalised inverse-distance
 * index derived from the accord table, not a share of anything, so the display
 * carries no «٪» and no decimal separator: the tenth of a point the engine
 * keeps cannot be supported by the source profiles. Rounding to a whole number
 * happens here, at display time only — the stored `presentationScore` and every
 * ranking that reads it are untouched.
 */
export function formatPersianScore(value: number): string {
  return toPersianDigits(Math.round(value));
}
