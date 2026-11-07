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
 * Each scene is 1200×800 (3:2) and was approved whole, so the stage takes the
 * artwork's own 3:2 aspect at full column width (capped and centred on wide
 * screens) and shows the scene entire: the full frame, cap to base, is always
 * visible. Nothing is cropped, nothing is focus-framed, and no scene is
 * letterboxed.
 *
 * One stage ratio for all ten scenes also means the rendered height is
 * identical on every question, so the layout never jumps while navigating.
 * There is deliberately no per-scene framing map: the crop it existed to
 * correct no longer happens.
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

/** The illustration for a question screen, if it has one. */
export function questionIllustrationFor(
  questionId: string,
): string | undefined {
  return QUESTION_ILLUSTRATIONS[questionId];
}
