import "dotenv/config";

import { getPrisma } from "@/lib/db";
import { getRecommendations } from "@/lib/matching/service";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { PersonalityVector } from "@/types/personality";

/**
 * Live verification of the deterministic matching engine against the seeded
 * development database.
 *
 * Run with: npx tsx scripts/verify-matching.ts
 *
 * Expects `npm run db:seed` to have run (two demo stores). Verifies:
 *  1. recommendations are produced for a store without any AI,
 *  2. the engine is deterministic for identical inputs,
 *  3. store isolation holds in both directions.
 *
 * Exits non-zero when any check fails.
 */

const STORE_A = "store-demo-perfume-shop";
const STORE_B = "store-demo-second-shop";

const vector = Object.fromEntries(
  PERSONALITY_DIMENSIONS.map((dimension) => [dimension, 50]),
) as PersonalityVector;

async function main() {
  const prisma = getPrisma();

  const first = await getRecommendations({
    storeId: STORE_A,
    personalityVector: vector,
  });
  const second = await getRecommendations({
    storeId: STORE_A,
    personalityVector: vector,
  });
  const other = await getRecommendations({
    storeId: STORE_B,
    personalityVector: vector,
  });

  const listA = first.recommendations.map((recommendation) => ({
    id: recommendation.perfumeId,
    store: recommendation.storeId,
    score: recommendation.presentationScore,
    rank: recommendation.rank,
  }));
  const listB = other.recommendations.map((recommendation) => ({
    id: recommendation.perfumeId,
    store: recommendation.storeId,
    score: recommendation.presentationScore,
    rank: recommendation.rank,
  }));

  const deterministic = JSON.stringify(first) === JSON.stringify(second);
  const idsA = first.recommendations.map((recommendation) => recommendation.perfumeId);
  const idsB = other.recommendations.map((recommendation) => recommendation.perfumeId);
  const isolated =
    !idsA.includes("perfume-demo-citrus") &&
    idsB.every((id) => id === "perfume-demo-citrus") &&
    first.recommendations.every(
      (recommendation) => recommendation.storeId === STORE_A,
    );

  console.log("Store A ranked results:", listA);
  console.log("Store A excluded candidates:", first.excluded);
  console.log("Store B ranked results:", listB);
  console.log("Deterministic across repeated runs:", deterministic);
  console.log("Store isolation holds:", isolated);

  const ok =
    deterministic &&
    isolated &&
    first.recommendations.length > 0 &&
    first.recommendations.every(
      (recommendation) =>
        recommendation.score >= 0 &&
        recommendation.score <= 100 &&
        recommendation.presentationScore >= 0 &&
        recommendation.presentationScore <= 100,
    );

  if (!ok) {
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
