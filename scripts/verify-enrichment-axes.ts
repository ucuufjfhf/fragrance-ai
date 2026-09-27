/**
 * Live verification for the reference-first enrichment axis fix.
 *
 * Run: npx tsx --env-file=.env scripts/verify-enrichment-axes.ts
 *
 * Creates a THROWAWAY store (unique slug) with three perfumes, runs the
 * genuine bulk pipeline (`processBulkProfileChunk`), prints the persisted
 * nine-axis values + provenance for each case, then deletes the store
 * (cascade removes everything). No secrets are ever printed.
 *
 * Cases:
 *   A) REFERENCE HIT  — "Dior Sauvage" (exists in the bundled catalog):
 *      deterministic axes, provenance REFERENCE, zero AI calls.
 *   B) REFERENCE MISS — an invented brand/name NOT in the catalog:
 *      real Qwen call, deterministic derivation from the AI structured data,
 *      provenance AI, nine non-artificial axes persisted.
 *   C) INSUFFICIENT MISS — same as B but the provider is forced to return
 *      only non-scent descriptors: the item must FAIL and persist NOTHING.
 */

import { getPrisma } from "@/lib/db";
import { processBulkProfileChunk } from "@/lib/admin/bulk/processor";
import { createBulkProfileJob } from "@/lib/admin/bulk/service";
import { createAIProvider, type AIProvider } from "@/lib/ai/provider";
import { MATCHING_DIMENSIONS } from "@/lib/fragrance/profile";

const AXES = [...MATCHING_DIMENSIONS] as const;

function fmtAxes(row: Record<string, unknown>): string {
  return AXES.map((axis) => `${axis}=${row[axis]}`).join(", ");
}

async function verifyCase(
  label: string,
  perfume: { name: string; brand: string; description?: string },
  providerOverride?: AIProvider,
): Promise<void> {
  console.log(`\n=== Case ${label}: "${perfume.brand} ${perfume.name}" ===`);
  const prisma = getPrisma();

  const created = await prisma.perfume.create({
    data: {
      storeId: STORE_ID,
      name: perfume.name,
      brand: perfume.brand,
      description: perfume.description ?? null,
    },
    select: { id: true },
  });

  const job = await createBulkProfileJob({
    storeId: STORE_ID,
    perfumeIds: [created.id],
  });
  if (!job.ok) {
    throw new Error(`job creation failed: ${job.reason}`);
  }

  const chunk = await processBulkProfileChunk({
    jobId: job.jobId,
    storeId: STORE_ID,
    ...(providerOverride ? { provider: providerOverride } : {}),
  });

  const profile = await prisma.fragranceProfile.findUnique({
    where: { perfumeId: created.id },
  });
  const item = await prisma.bulkProfileItem.findFirst({
    where: { jobId: job.jobId },
  });

  if (!chunk.ok) {
    console.log(`  chunk: NOT_OK ${chunk.reason}`);
  } else {
    console.log(
      `  chunk: status=${chunk.chunk.status} succeeded=${chunk.chunk.succeeded} failed=${chunk.chunk.failed}`,
    );
  }
  console.log(`  item: status=${item?.status ?? "?"} errorCode=${item?.errorCode ?? "-"}`);
  if (item?.errorMessage) {
    console.log(`  itemMessage: ${item.errorMessage}`);
  }

  if (profile) {
    console.log(`  provenance: ${profile.profileSource ?? "(null)"}`);
    console.log(`  axes: ${fmtAxes(profile as unknown as Record<string, unknown>)}`);
    console.log(`  family: ${profile.family ?? "-"} | notes: ${profile.notes.join(", ") || "-"}`);
    const zeros = AXES.filter((axis) => profile[axis] === 0).length;
    const neutrals = AXES.filter((axis) => profile[axis] === 50).length;
    console.log(`  sanity: zero-axes=${zeros}/9, neutral-50-axes=${neutrals}/9`);
  } else {
    console.log("  profile: NOT PERSISTED (correct when the case must fail)");
  }

  await prisma.perfume.delete({ where: { id: created.id } }).catch(() => undefined);
}

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const STORE_SLUG = `verify-axes-${suffix}`;
let STORE_ID = "";

async function main(): Promise<void> {
  const prisma = getPrisma();
  const store = await prisma.store.create({
    data: { name: `Axis Verify ${suffix}`, slug: STORE_SLUG },
    select: { id: true },
  });
  STORE_ID = store.id;
  console.log(`throwaway store: ${STORE_SLUG} (${STORE_ID})`);

  const realProvider = createAIProvider();
  console.log(`AI provider available: ${realProvider.isAvailable()}`);

  // A) REFERENCE HIT — Dior Sauvage exists in the bundled catalog.
  await verifyCase("A (HIT)", { name: "Sauvage", brand: "Dior" }, realProvider);

  // B) REFERENCE MISS — unknown brand, real Qwen enrichment. The description
  // is the realistic merchant material a real perfume row carries (and the
  // AI input); the persisted axes must come from the deterministic mapping.
  await verifyCase(
    "B (MISS + AI)",
    {
      name: `Mystic Dawn ${suffix}`,
      brand: `ZzVerifyBrand${suffix}`,
      description:
        "A warm woody amber gourmand fragrance with sweet vanilla, spicy saffron, " +
        "leather, smoky tobacco and a fresh citrus opening.",
    },
    realProvider,
  );

  // C) INSUFFICIENT MISS — the provider returns only non-scent descriptors:
  // derivation must refuse, the item must FAIL, nothing may persist.
  const insufficientProvider: AIProvider = {
    ...realProvider,
    id: "insufficient-fake",
    generatePerfumeProfile: async (input) => ({
      perfumeId: input.perfumeId,
      descriptors: { clean: 60, longevity: 70, projection: 55 },
      notes: ["مشک"],
    }),
  };
  await verifyCase(
    "C (INSUFFICIENT)",
    { name: `Hollow Night ${suffix}`, brand: `ZzVerifyBrand${suffix}` },
    insufficientProvider,
  );

  await prisma.store.delete({ where: { id: STORE_ID } }).catch(() => undefined);
  console.log("\ncleanup: throwaway store deleted (cascade removes all rows).");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("verification failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
