/**
 * Phase 1 — Gilded Editorial: the single highlighted phrase per quiz screen.
 *
 * Each value is a BYTE-EXACT substring of its approved prompt (copy is never
 * altered — `splitHighlighted` only wraps the match in a highlight span, so
 * the rendered text stays identical). The emotional core only: at most one
 * phrase per screen.
 *
 * Keys are question ids (`lib/personality/questions.ts`), plus the audience
 * step, the context heading (its alone — the two context legends stay plain
 * so the screen keeps exactly one highlight) and the quiz intro headline.
 */
/**
 * The rarity allowlist: the wipe is a signature, so it fires on exactly four
 * screens — the intro headline plus the 1st, 5th and 10th questions in
 * `lib/personality/questions.ts` order. Every other screen (the remaining
 * questions, the audience step, the context step) renders its title plain.
 *
 * The map below keeps ALL phrases byte-exact regardless: dropping a screen
 * from this set removes its gold, never its copy.
 */
export const HIGHLIGHTED_QUESTION_IDS: ReadonlySet<string> = new Set([
  "choice-style",
  "change",
  "usage",
]);

export const QUESTION_HIGHLIGHTS: Record<string, string> = {
  "choice-style": "شبیه شماست",
  "social-energy": "چه حالی دارید",
  "scent-role": "چه کاری براتون",
  "day-trip": "روز تعطیل",
  change: "تغییر و تنوع",
  colors: "به سلیقه‌تون",
  party: "توی مهمونی",
  impression: "چه حسی بمونه",
  risk: "ریسک می‌کنید",
  usage: "کِی به کارتون بیاد",
  audience: "برای چه کسی",
  context: "دقیق‌ترش",
  intro: "خودتون",
};

/**
 * Splits `text` around the first occurrence of `phrase`.
 *
 * Returns null when the phrase is absent (the caller renders plain text), so
 * a copy/highlight drift can never break a screen — it only drops the gold.
 */
export function splitHighlighted(
  text: string,
  phrase: string | undefined,
): readonly [before: string, match: string, after: string] | null {
  if (!phrase) {
    return null;
  }
  const index = text.indexOf(phrase);
  if (index < 0) {
    return null;
  }
  return [
    text.slice(0, index),
    phrase,
    text.slice(index + phrase.length),
  ] as const;
}
