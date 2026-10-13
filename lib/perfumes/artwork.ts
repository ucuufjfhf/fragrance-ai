/**
 * Curated card artwork for the recommendation list (Phase D).
 *
 * The demo/reference catalog stores no image URL at all (`imageUrl: null` for
 * every curated perfume), so demo cards used to fall back to the bare bottle
 * glyph. These six bundled images give those cards real artwork WITHOUT
 * inventing merchant data: nothing here claims a store sells a perfume, and no
 * external URL is ever referenced — the files ship in `public/perfumes/`.
 *
 * The mapping is a pure function of the perfume id: the same id always resolves
 * to the same image, so a card never changes its artwork between renders,
 * servers or rebuilds. Merchant inventory keeps precedence — this module is only
 * consulted when the engine returned no `imageUrl`
 * (see `components/results/RecommendationCard.tsx`).
 *
 * Files: `public/perfumes/perfume-0{1..6}.jpg` — 1000x625 (16:10, the card's
 * image panel ratio), one shared dark/amber art direction, no brand labels.
 */

/** The bundled artwork, in a fixed order (the index is hash-derived). */
export const PERFUME_ARTWORK: readonly string[] = [
  "/perfumes/perfume-01.jpg",
  "/perfumes/perfume-02.jpg",
  "/perfumes/perfume-03.jpg",
  "/perfumes/perfume-04.jpg",
  "/perfumes/perfume-05.jpg",
  "/perfumes/perfume-06.jpg",
];

/**
 * FNV-1a (32-bit) over the perfume id's UTF-16 code units.
 *
 * Picked because it is tiny, dependency-free and fully specified — no
 * `Math.random`, no insertion order, no runtime state. Deliberately NOT a
 * scoring input: it only chooses decoration, so it can never influence which
 * perfumes appear, in which order, or at which score.
 */
function hashPerfumeId(perfumeId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < perfumeId.length; index += 1) {
    hash ^= perfumeId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The curated image for a perfume id — stable for the lifetime of the id. */
export function artworkForPerfume(perfumeId: string): string {
  return PERFUME_ARTWORK[hashPerfumeId(perfumeId) % PERFUME_ARTWORK.length];
}
