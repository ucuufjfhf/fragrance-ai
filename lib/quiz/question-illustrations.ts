/**
 * Illustrations for the quiz question screens — presentation only.
 *
 * Each of the 10 personality questions gets ONE fixed flat illustration as its
 * visual header; the options stay text rows, unchanged. The drawing is
 * atmosphere, never a choice (picture-options would bias answers toward the
 * prettiest image — the mechanic this project deliberately rejects).
 *
 * Keyed by question id, never by label text or position. Quiz data, option
 * values, scoring and matching are untouched — this map is read only by the
 * `Question` component. The audience step keeps its own photo cards
 * (`AudienceStep`) and is not part of this map.
 *
 * Artwork is custom-drawn flat illustration, delivered as alpha webp with a
 * transparent background and self-hosted under `public/quiz/`. Nothing is
 * cropped: the stage is a fixed-height box and every drawing is contain-fitted
 * inside it, so the shape is whatever the artist drew — no frame, no card, no
 * shadow. The illustration floats directly on the quiz ambience.
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
