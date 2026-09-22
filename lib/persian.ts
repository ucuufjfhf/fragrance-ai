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
 * Formats an engine presentation score with Persian digits, e.g.
 * `92.4` → `«۹۲٫۴٪»`. Takes the already-rounded `presentationScore` only —
 * the raw score is never displayed and never re-rounded here.
 */
export function formatPersianScore(value: number): string {
  const fixed = value.toFixed(1);
  return `${toPersianDigits(fixed.replace(".", "٫"))}٪`;
}
