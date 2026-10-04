import { getPrisma } from "@/lib/db";
import type { MatchCandidateInput } from "@/types/recommendation";

/**
 * Server-side inventory retrieval for the matching engine.
 *
 * This is the only place where the matching flow touches Prisma, and it must
 * only ever be imported from server code (API routes, services, scripts) — never
 * from a client component.
 *
 * Store isolation is enforced here in the SQL `where` clause: a request for one
 * store can never load perfumes of another tenant.
 */
export async function getEligiblePerfumesForStore(
  storeId: string,
): Promise<MatchCandidateInput[]> {
  const prisma = getPrisma();

  const perfumes = await prisma.perfume.findMany({
    where: {
      storeId,
      active: true,
    },
    select: {
      id: true,
      storeId: true,
      name: true,
      brand: true,
      slug: true,
      productUrl: true,
      imageUrl: true,
      inStock: true,
      active: true,
      // Grounding fact for the AI explanation layer. Selected ONLY so the
      // explanation prompt can describe the real perfume; it is never read by
      // the scorer, so eligibility and ranking are unaffected.
      description: true,
      // All nine stored axes are still SELECTED: eligibility requires a
      // complete, in-range profile exactly as before. Only the five
      // MATCHING_DIMENSIONS take part in the distance; the other four are
      // validated and then ignored by the scorer. `family`/`notes` ride along
      // in the same relation for the explanation layer and are never scored.
      profile: {
        select: {
          social: true,
          adventurous: true,
          expressive: true,
          mysterious: true,
          fresh: true,
          warm: true,
          experimental: true,
          elegant: true,
          bold: true,
          family: true,
          notes: true,
        },
      },
    },
  });

  return perfumes.map((perfume) => ({
    perfumeId: perfume.id,
    storeId: perfume.storeId,
    name: perfume.name,
    brand: perfume.brand,
    slug: perfume.slug,
    productUrl: perfume.productUrl,
    imageUrl: perfume.imageUrl,
    inStock: perfume.inStock,
    active: perfume.active,
    profile: perfume.profile,
    // Copied through for the explanation layer; never scored.
    description: perfume.description,
    family: perfume.profile?.family ?? null,
    notes: perfume.profile?.notes ?? null,
  }));
}
