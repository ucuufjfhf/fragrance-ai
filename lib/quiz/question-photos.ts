/**
 * Atmosphere photos for the quiz question screens — presentation only.
 *
 * Each of the 10 personality questions gets ONE fixed editorial photograph as
 * its visual header; the options stay text rows, unchanged. The photo is
 * atmosphere, never a choice (photo-options would bias answers toward the
 * prettiest picture — the mechanic this project deliberately rejects).
 *
 * Keyed by question id, never by label text or position. Quiz data, option
 * values, scoring and matching are untouched — this map is read only by the
 * `Question` component. The audience step keeps its own photo cards
 * (`AudienceStep`) and is not part of this map.
 *
 * Files are real free-license stock photography (Pexels), downloaded,
 * converted to webp (<= ~150KB each) and self-hosted under `public/quiz/`.
 * All are object/scene still lifes: no text, no logos, no product bottles,
 * no identifiable people.
 *
 * Sources — Pexels photo id per file, so any image can be traced or swapped:
 *   q-choice-style  7172218   citrus still life
 *   q-social-energy 12821516  two cups on a café table
 *   q-scent-role    23826253  white jasmine blossom
 *   q-day-trip      5420396   foggy forest road
 *   q-change        1533720   open water at dusk
 *   q-colors        678414    bowls of warm spices
 *   q-party         7120001   night-street bokeh
 *   q-impression    4938322   folds of gold satin
 *   q-risk          15547003  a dark, sun-struck peak
 *   q-usage         807598    rain-wet green leaves
 * Canonical page: https://www.pexels.com/photo/<id>/
 */
export const QUESTION_PHOTOS: Record<string, string> = {
  "choice-style": "/quiz/q-choice-style.webp",
  "social-energy": "/quiz/q-social-energy.webp",
  "scent-role": "/quiz/q-scent-role.webp",
  "day-trip": "/quiz/q-day-trip.webp",
  "change": "/quiz/q-change.webp",
  "colors": "/quiz/q-colors.webp",
  "party": "/quiz/q-party.webp",
  "impression": "/quiz/q-impression.webp",
  "risk": "/quiz/q-risk.webp",
  "usage": "/quiz/q-usage.webp",
};

/**
 * Editorial framing per photo, as a CSS `object-position` percentage.
 *
 * The band is 16:10 on phones and 21:9 on desktop, so a portrait source is
 * cropped to a wide strip. Most of these still lifes read fine from the centre
 * (their subject sits mid-frame), but a photo whose subject lives low in the
 * frame would be cropped down to empty sky — the peak on `risk` is the one
 * case. Anything absent here is centred.
 */
export const QUESTION_PHOTO_FOCUS: Record<string, string> = {
  risk: "50% 65%",
};

/** The atmosphere photo for a question screen, if it has one. */
export function questionPhotoFor(questionId: string): string | undefined {
  return QUESTION_PHOTOS[questionId];
}

/** The `object-position` for a question's photo; centred when unset. */
export function questionPhotoFocusFor(questionId: string): string {
  return QUESTION_PHOTO_FOCUS[questionId] ?? "50% 50%";
}
