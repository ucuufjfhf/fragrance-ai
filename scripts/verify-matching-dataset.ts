import "dotenv/config";

import { getPrisma } from "@/lib/db";
import { getRecommendations } from "@/lib/matching/service";
import { PERSONALITY_DIMENSIONS } from "@/types/personality";
import type { PersonalityVector } from "@/types/personality";

/**
 * Live matching validation over the 100-perfume test dataset
 * (scripts/seed-matching-dataset.ts, store `store-matching-test`).
 *
 * Reports (spec §10): totals, eligible pool, per-exclusion counts, top-5 per
 * test profile with scores, deterministic repeat and store-isolation results.
 * Read-only. Exit non-zero on any failed check.
 */

const STORE = "store-matching-test";
const OTHER = "store-demo-perfume-shop";

const base = (): PersonalityVector =>
  Object.fromEntries(PERSONALITY_DIMENSIONS.map((d) => [d, 50])) as PersonalityVector;

const PROFILES: { name: string; description: string; vector: PersonalityVector; cluster: string }[] = [
  { name: "B fresh/clean/citrus", description: "fresh 95, warm 10, mysterious 15 (rest 50) — fresh family (citrus or aquatic cluster)", vector: { ...base(), fresh: 95, warm: 10, mysterious: 15 }, cluster: "aquatic-fresh" },
  { name: "C warm/woody/elegant", description: "warm 85, elegant 90, fresh 15, mysterious 55", vector: { ...base(), warm: 85, elegant: 90, fresh: 15, mysterious: 55 }, cluster: "woody-warm-elegant" },
  { name: "D sweet/floral", description: "warm 60, expressive 80, fresh 35, bold 30", vector: { ...base(), warm: 60, expressive: 80, fresh: 35, bold: 30 }, cluster: "sweet-floral" },
  { name: "E bold/spicy", description: "bold 95, warm 75, mysterious 65, fresh 10", vector: { ...base(), bold: 95, warm: 75, mysterious: 65, fresh: 10 }, cluster: "spicy-woody-bold" },
  { name: "F mixed/balanced", description: "all nine axes 50 (unisex cluster)", vector: base(), cluster: "balanced-versatile-unisex" },
];

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  const prisma = getPrisma();

  console.log("=== dataset ===");
  const [total, profiles, inactive, oos, both] = await Promise.all([
    prisma.perfume.count({ where: { storeId: STORE } }),
    prisma.fragranceProfile.count({ where: { perfume: { storeId: STORE } } }),
    prisma.perfume.count({ where: { storeId: STORE, active: false } }),
    prisma.perfume.count({ where: { storeId: STORE, inStock: false } }),
    prisma.perfume.count({ where: { storeId: STORE, active: false, inStock: false } }),
  ]);
  const invalidProfile = await prisma.perfume.count({
    where: { storeId: STORE, profile: { is: null } },
  });
  const eligible = await prisma.perfume.count({
    where: { storeId: STORE, active: true, inStock: true, profile: { isNot: null } },
  });

  console.log(`total test products:      ${total}`);
  console.log(`profiles:                 ${profiles}`);
  console.log(`eligible (active+stock+): ${eligible}`);
  console.log(`excluded inactive:        ${inactive}`);
  console.log(`excluded out-of-stock:    ${oos}`);
  console.log(`excluded both:            ${both}`);
  console.log(`excluded invalid-profile: ${invalidProfile}`);

  console.log("\n=== top 5 per test profile ===");
  for (const p of PROFILES) {
    const result = await getRecommendations({ storeId: STORE, personalityVector: p.vector, topN: 5 });
    console.log(`\n${p.name} — ${p.description}`);
    for (const rec of result.recommendations) {
      console.log(`  ${rec.rank}. ${rec.perfumeId}  score=${rec.score.toFixed(2)}  presentation=${rec.presentationScore}`);
    }
    const expectedCluster = p.cluster === "aquatic-fresh" ? ["aquatic-fresh", "fresh-clean-citrus"] : [p.cluster];
    const topInCluster = expectedCluster.some((c) => result.recommendations[0].perfumeId.includes(c));
    const clusterInTop5 = result.recommendations.filter((r) => expectedCluster.some((c) => r.perfumeId.includes(c))).length;
    check(
      `${p.name}: top result from intended cluster (${expectedCluster.join(" / ")})`,
      topInCluster,
      `cluster members in top5: ${clusterInTop5}`,
    );
  }

  console.log("\n=== eligibility & determinism ===");
  const oosIds = new Set(
    (await prisma.perfume.findMany({ where: { storeId: STORE, inStock: false }, select: { id: true } })).map((r) => r.id),
  );
  const inactiveIds = new Set(
    (await prisma.perfume.findMany({ where: { storeId: STORE, active: false }, select: { id: true } })).map((r) => r.id),
  );

  let oosLeak = 0;
  let inactiveLeak = 0;
  let foreignLeak = 0;
  for (const p of PROFILES) {
    const result = await getRecommendations({ storeId: STORE, personalityVector: p.vector, topN: 10 });
    for (const rec of result.recommendations) {
      if (oosIds.has(rec.perfumeId)) oosLeak += 1;
      if (inactiveIds.has(rec.perfumeId)) inactiveLeak += 1;
      if (rec.storeId !== STORE) foreignLeak += 1;
    }
  }
  check("out-of-stock exclusion (top-10 across all profiles)", oosLeak === 0, `leaks: ${oosLeak}`);
  check("inactive exclusion (top-10 across all profiles)", inactiveLeak === 0, `leaks: ${inactiveLeak}`);
  check("store isolation (all results store-scoped)", foreignLeak === 0, `leaks: ${foreignLeak}`);

  const repeatA = await getRecommendations({ storeId: STORE, personalityVector: PROFILES[4].vector, topN: 10 });
  const repeatB = await getRecommendations({ storeId: STORE, personalityVector: PROFILES[4].vector, topN: 10 });
  check(
    "deterministic repeat (byte-identical JSON)",
    JSON.stringify(repeatA) === JSON.stringify(repeatB),
  );

  const top3 = await getRecommendations({ storeId: STORE, personalityVector: PROFILES[4].vector, topN: 3 });
  const top5 = await getRecommendations({ storeId: STORE, personalityVector: PROFILES[4].vector, topN: 5 });
  check("topN=3 returns 3", top3.recommendations.length === 3);
  check("topN=5 returns 5", top5.recommendations.length === 5);

  console.log("\n=== store isolation (foreign store) ===");
  const demoResult = await getRecommendations({ storeId: OTHER, personalityVector: PROFILES[4].vector, topN: 10 });
  const testLeak = demoResult.recommendations.filter((r) => r.perfumeId.startsWith("mt-")).length;
  check("demo store never receives matching-test products", testLeak === 0, `leaks: ${testLeak}`);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  if (failures > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error("verification failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => getPrisma().$disconnect());
