/**
 * Illustrations for the quiz question screens — presentation only.
 *
 * Each of the 10 personality questions gets ONE fixed illustration as its
 * visual header; the options stay text rows, unchanged. The drawing is
 * atmosphere, never a choice (picture-options would bias answers toward the
 * prettiest image — the mechanic this project deliberately rejects).
 *
 * Keyed by question id, never by label text or position. Quiz data, option
 * values, scoring and matching are untouched — this map is read only by the
 * `Question` component. The audience step keeps its own photo cards
 * (`AudienceStep`) and is not part of this map.
 *
 * Artwork is a custom-drawn FULL-SCENE editorial illustration, delivered as
 * opaque webp with its own background and self-hosted under `public/quiz/`.
 * The stage is a fixed-height, full-width scene band carrying the site's small
 * media radius and clipped overflow, and each scene is cover-fitted into it
 * (`object-cover`), so the band reads edge to edge — never letterboxed, and
 * with no frame, border or shadow.
 *
 * A cover fit crops the 3:2 scene on the vertical axis inside a much wider
 * band, so the subject is not always at the vertical centre. The focus map
 * below carries the focal position for the scenes where a plain centred crop
 * would cut the subject; anything not listed keeps the `object-center`
 * default. These are framing values only — no scene is altered.
 */
export const QUESTION_ILLUSTRATIONS: Record<string, string> = {
  "choice-style": "/quiz/illus-choice-style.webp",
  "social-energy": "/quiz/illus-social-energy.webp",
  "scent-role": "/quiz/illus-scent-role.webp",
  "day-trip": "/quiz/illus-day-trip.webp",
  change: "/quiz/illus-change.webp",
  colors: "/quiz/illus-colors.webp",
  party: "/quiz/illus-party.webp",
  impression: "/quiz/illus-impression.webp",
  risk: "/quiz/illus-risk.webp",
  usage: "/quiz/illus-usage.webp",
};

/**
 * Per-scene `object-position` overrides, as CSS percentages, for scenes whose
 * subject sits away from the vertical centre of the artwork — most of these
 * compositions stand the bottle on the lower edge. Presentation only; a scene
 * absent here uses `object-center`.
 */
export const QUESTION_ILLUSTRATION_FOCUS: Record<string, string> = {
  "choice-style": "50% 62%",
  "scent-role": "50% 56%",
  "day-trip": "50% 72%",
  change: "50% 100%",
  colors: "50% 64%",
  party: "50% 90%",
  impression: "50% 94%",
  risk: "50% 15%",
  usage: "50% 96%",
};

/** The illustration for a question screen, if it has one. */
export function questionIllustrationFor(
  questionId: string,
): string | undefined {
  return QUESTION_ILLUSTRATIONS[questionId];
}

/** The focal crop position for a scene, if it needs one. */
export function questionIllustrationFocusFor(
  questionId: string,
): string | undefined {
  return QUESTION_ILLUSTRATION_FOCUS[questionId];
}
