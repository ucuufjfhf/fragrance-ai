import "dotenv/config";

import {
  generateExplanations,
  selectUserTraits,
} from "@/lib/ai/explanation";
import type { AiExplanationInput } from "@/lib/ai/provider";
import { createAIProvider, readAiConfig } from "@/lib/ai/provider";
import { getPrisma } from "@/lib/db";
import { getRecommendations } from "@/lib/matching/service";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { PersonalityVector } from "@/types/personality";

/**
 * Phase 4 verification that requires **no** AI credentials.
 *
 * Run with: npx tsx scripts/verify-ai-fallback.ts
 *
 * Requires `npm run db:seed` to have run. Verifies the Phase 4 promise:
 *  1. the deterministic recommendations are produced and are byte-identical
 *     before and after an AI attempt (AI cannot influence them);
 *  2. when credentials are missing the provider reports itself unavailable and
 *     the explanation layer returns nothing instead of throwing;
 *  3. when credentials exist it reports how many explanations were produced.
 *
 * It never prints secrets and exits non-zero when a check fails.
 */

const STORE_ID = "store-demo-perfume-shop";

const vector = Object.fromEntries(
  PERSONALITY_DIMENSIONS.map((dimension) => [dimension, 50]),
) as PersonalityVector;

async function main() {
  const prisma = getPrisma();

  const before = await getRecommendations({
    storeId: STORE_ID,
    personalityVector: vector,
  });

  const config = readAiConfig();
  const provider = createAIProvider(config);
  const aiAvailable = provider.isAvailable();

  const missing = [
    config.apiKey === "" ? "QWEN_API_KEY" : null,
    config.baseUrl === "" ? "QWEN_BASE_URL" : null,
  ].filter((name): name is string => name !== null);

  const inputs: AiExplanationInput[] = before.recommendations.map(
    (recommendation) => ({
      recommendation,
      archetypeLabel: "کاشف مزاج آزمون",
      perfume: {
        perfumeId: recommendation.perfumeId,
        name: recommendation.name,
        brand: recommendation.brand,
      },
      traits: selectUserTraits(vector),
    }),
  );

  const explanations = await generateExplanations(provider, inputs);

  const after = await getRecommendations({
    storeId: STORE_ID,
    personalityVector: vector,
  });

  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  const explanationsOk = aiAvailable
    ? explanations.size === inputs.length
    : explanations.size === 0;

  console.log("AI provider:", provider.id);
  console.log(
    "AI available:",
    aiAvailable,
    aiAvailable ? "" : `(${provider.unavailableReason() ?? ""})`,
  );
  console.log(
    "Missing configuration:",
    missing.length > 0 ? missing.join(", ") : "none",
  );
  console.log("Ranked recommendations:", before.recommendations.length);
  console.log(
    "Ranked results:",
    before.recommendations.map((recommendation) => ({
      id: recommendation.perfumeId,
      rank: recommendation.rank,
      score: recommendation.presentationScore,
    })),
  );
  console.log("AI explanations generated:", explanations.size);
  console.log("Recommendations unchanged after the AI attempt:", unchanged);

  if (!aiAvailable) {
    console.log(
      "To enable the Phase 4 AI layer: set QWEN_BASE_URL and QWEN_API_KEY in .env (never commit them).",
    );
  }

  const ok =
    unchanged &&
    explanationsOk &&
    (aiAvailable || before.recommendations.length > 0);

  if (!ok) {
    console.error("AI fallback verification FAILED.");
    process.exitCode = 1;
  } else {
    console.log("AI fallback verification passed.");
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
