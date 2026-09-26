/**
 * Deterministic perfume-identity normalization for reference lookup.
 *
 * PURE and dependency-free: same input always produces the same output, no
 * clock, no network. This is IDENTITY normalization, not semantic guessing —
 * it makes formatting differences irrelevant while PRESERVING every variant
 * token that distinguishes one fragrance from another.
 *
 * Preserved (never stripped): EDT / EDP / Parfum / Extrait / Elixir / Intense /
 * Absolu / flanker names / gender words / year markers. Two different variants
 * of the same perfume ("Sauvage Eau de Toilette" vs "Sauvage Elixir") must
 * normalize DIFFERENTLY so a variant mismatch can never silently match.
 *
 * Normalized away: casing, repeated whitespace, punctuation/separator noise,
 * harmless Unicode (NFKD + diacritics), ampersand spacing, Roman-numeral case
 * (lowered like everything else — "EDT" and "edt" are the same token).
 */

/** Variant/concentration phrases with their canonical short forms. */
const CONCENTRATION_CANONICAL: Record<string, string> = {
  "eau de toilette": "edt",
  edt: "edt",
  "eau de parfum": "edp",
  edp: "edp",
  "eau de cologne": "edc",
  edc: "edc",
  "extrait de parfum": "extrait",
  extrait: "extrait",
  elixir: "elixir",
  intense: "intense",
  absolu: "absolu",
  "le parfum": "le-parfum",
};

/**
 * Longer phrases first so "eau de parfum" wins over its inner "parfum" token.
 */
const CONCENTRATION_PHRASES = Object.keys(CONCENTRATION_CANONICAL).sort(
  (a, b) => b.length - a.length,
);

/**
 * Replaces known concentration phrases with their canonical short form.
 * Phrase-wise (not token-wise) so multi-word phrases survive intact.
 */
function canonicalizeConcentrations(identity: string): string {
  let result = identity;
  for (const phrase of CONCENTRATION_PHRASES) {
    // Word-boundary replacement keeps unrelated substrings intact.
    const pattern = new RegExp(`(^| )${phrase}( |$)`, "g");
    result = result.replace(pattern, (_match: string, lead: string) =>
      `${lead}${CONCENTRATION_CANONICAL[phrase]} `,
    );
  }
  return result.replace(/\s+/g, " ").trim();
}

/** The core identity normalizer: one string in, one canonical string out. */
export function normalizePerfumeIdentity(value: string): string {
  const base = value
    // Harmless Unicode: NFKD then strip combining diacritics (é → e).
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    // Lowercase ONCE — everything downstream compares lowercase.
    .toLowerCase()
    // Ampersand spacing ("D&G" → "d and g" matches "D G").
    .replace(/&/g, " and ")
    // Any run of non-alphanumerics (dots, commas, dashes, slashes) → space.
    .replace(/[^a-z0-9]+/g, " ")
    // Collapse whitespace and trim.
    .replace(/\s+/g, " ")
    .trim();

  return canonicalizeConcentrations(base);
}

/**
 * Extracts the canonical concentration token set from an identity string.
 *
 * Returned tokens are the canonical short forms ("edt", "edp", "parfum",
 * "elixir", "intense", ...). A variant with a concentration a matching
 * candidate lacks is a MISMATCH — this is what stops "Sauvage EDT" from
 * matching "Sauvage Elixir".
 */
export function extractConcentrationTokens(identity: string): string[] {
  const canonicalForms = new Set(Object.values(CONCENTRATION_CANONICAL));
  return identity
    .split(" ")
    .filter((token) => canonicalForms.has(token))
    .map((token) => token);
}

/**
 * True when two identities are concentration-compatible.
 *
 * Rule: if EITHER side declares a concentration the other lacks (after
 * canonicalization), they are different variants → incompatible. When both
 * sides are concentration-free, they are compatible.
 */
export function concentrationsCompatible(left: string, right: string): boolean {
  const leftTokens = new Set(extractConcentrationTokens(left));
  const rightTokens = new Set(extractConcentrationTokens(right));

  if (leftTokens.size === 0 && rightTokens.size === 0) {
    return true;
  }
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    // One side silent, the other explicit: conservative default is NOT a match
    // (an explicit "elixir" must not match a bare name), except when the bare
    // side is the canonical base name and the explicit side is the most common
    // default ("edt") — treat THAT pairing as compatible, since merchants
    // routinely list "Sauvage" for the EDT.
    const explicit = leftTokens.size > 0 ? leftTokens : rightTokens;
    return explicit.size === 1 && explicit.has("edt");
  }
  for (const token of leftTokens) {
    if (!rightTokens.has(token)) {
      return false;
    }
  }
  for (const token of rightTokens) {
    if (!leftTokens.has(token)) {
      return false;
    }
  }
  return true;
}
