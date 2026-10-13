import type { ArchetypeId } from "@/types/personality";

/**
 * Bundled emblem artwork for the 8 archetypes.
 *
 * The reveal pop-up (`components/quiz/ArchetypeRevealModal.tsx`) and the
 * Fragrance Profile medallion (`components/quiz/QuizResultCard.tsx`) show the
 * archetype's emblem from `public/archetypes/`. The mapping is a pure function
 * of the archetype id — the same id always resolves to the same file, so an
 * emblem can never change between renders, servers or rebuilds.
 *
 * Decoration only. Nothing here is consulted by the scoring engine, the
 * nearest-centroid archetype pick or the recommendation ranking, and the files
 * ship with the app: no external URL and no merchant data. `Record<ArchetypeId,
 * string>` is deliberately exhaustive, so adding an archetype id becomes a
 * compile error here instead of a silently missing image.
 *
 * Files: `public/archetypes/<id>.jpg` — one 1600×1600 JPEG per archetype, a
 * single gold-on-cream art direction, no brand labels.
 */
export const ARCHETYPE_EMBLEM_IMAGES: Record<ArchetypeId, string> = {
  "mysterious-explorer": "/archetypes/mysterious-explorer.jpg",
  "clean-minimalist": "/archetypes/clean-minimalist.jpg",
  charismatic: "/archetypes/charismatic.jpg",
  "elegant-classic": "/archetypes/elegant-classic.jpg",
  "free-spirit": "/archetypes/free-spirit.jpg",
  romantic: "/archetypes/romantic.jpg",
  "bold-one": "/archetypes/bold-one.jpg",
  sophisticated: "/archetypes/sophisticated.jpg",
};

/**
 * The bundled emblem for an archetype id.
 *
 * Takes a real `ArchetypeId` (no loose `string` fallback): showing one
 * archetype's emblem for another would be worse than showing none, so an
 * unknown id stays a compile-time problem instead of a wrong picture.
 */
export function archetypeEmblemImageFor(archetypeId: ArchetypeId): string {
  return ARCHETYPE_EMBLEM_IMAGES[archetypeId];
}
