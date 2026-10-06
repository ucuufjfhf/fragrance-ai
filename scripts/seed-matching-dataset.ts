import "dotenv/config";

import { getPrisma } from "@/lib/db";
import { STORE_CURRENCY } from "@/lib/pricing/currency";

/**
 * Phase 9.5 — matching-engine validation dataset.
 *
 * Creates a clearly-identified TEST store ("Matching Test Store") with ~100
 * fictional perfumes organised in 10 distinct fragrance clusters, with
 * deliberate in-stock / out-of-stock / inactive distribution so eligibility
 * filtering can be verified at scale. Idempotent: keyed on deterministic ids
 * (`mt-###`), a re-run updates nothing but creates nothing twice.
 *
 * Run: npx tsx scripts/seed-matching-dataset.ts
 *
 * TEST DATA ONLY — none of it belongs to a real merchant and nothing here is
 * a factual claim about real perfumes. The existing demo stores are untouched.
 */

const STORE_ID = "store-matching-test";
const SLUG = "matching-test";
const ID_PREFIX = "mt-";

/** The 10 test clusters: axis profiles across the 9 matching dimensions. */
const CLUSTERS = [
  { key: "fresh-clean-citrus", social: 60, adventurous: 40, expressive: 55, mysterious: 15, fresh: 95, warm: 10, experimental: 40, elegant: 60, bold: 20 },
  { key: "aquatic-fresh", social: 65, adventurous: 55, expressive: 50, mysterious: 20, fresh: 90, warm: 15, experimental: 50, elegant: 45, bold: 30 },
  { key: "woody-warm-elegant", social: 45, adventurous: 35, expressive: 40, mysterious: 55, fresh: 15, warm: 85, experimental: 40, elegant: 90, bold: 45 },
  { key: "woody-smoky-mysterious", social: 30, adventurous: 60, expressive: 35, mysterious: 90, fresh: 5, warm: 70, experimental: 65, elegant: 60, bold: 75 },
  { key: "sweet-floral", social: 70, adventurous: 40, expressive: 80, mysterious: 25, fresh: 35, warm: 60, experimental: 35, elegant: 65, bold: 30 },
  { key: "sweet-warm-bold", social: 60, adventurous: 65, expressive: 70, mysterious: 45, fresh: 15, warm: 90, experimental: 55, elegant: 45, bold: 85 },
  { key: "spicy-woody-bold", social: 45, adventurous: 75, expressive: 55, mysterious: 65, fresh: 10, warm: 75, experimental: 70, elegant: 50, bold: 95 },
  { key: "clean-elegant-minimal", social: 50, adventurous: 30, expressive: 35, mysterious: 30, fresh: 75, warm: 30, experimental: 25, elegant: 95, bold: 15 },
  { key: "dark-warm-smoky", social: 25, adventurous: 70, expressive: 40, mysterious: 95, fresh: 5, warm: 80, experimental: 75, elegant: 55, bold: 90 },
  { key: "balanced-versatile-unisex", social: 50, adventurous: 50, expressive: 50, mysterious: 50, fresh: 50, warm: 50, experimental: 50, elegant: 50, bold: 50 },
] as const;

/** Fragrance descriptors per cluster (0–100) — realistic, cluster-coherent. */
const DESCRIPTORS: Record<string, Partial<Record<string, number>>> = {
  "fresh-clean-citrus": { sweet: 15, woody: 5, spicy: 5, floral: 25, citrus: 95, aquatic: 55, smoky: 0, clean: 90, longevity: 40, projection: 55 },
  "aquatic-fresh": { sweet: 10, woody: 5, spicy: 5, floral: 15, citrus: 60, aquatic: 95, smoky: 0, clean: 80, longevity: 35, projection: 60 },
  "woody-warm-elegant": { sweet: 30, woody: 95, spicy: 30, floral: 15, citrus: 5, aquatic: 0, smoky: 35, clean: 20, longevity: 90, projection: 65 },
  "woody-smoky-mysterious": { sweet: 15, woody: 85, spicy: 40, floral: 5, citrus: 0, aquatic: 0, smoky: 95, clean: 5, longevity: 95, projection: 75 },
  "sweet-floral": { sweet: 90, woody: 10, spicy: 15, floral: 95, citrus: 25, aquatic: 5, smoky: 0, clean: 30, longevity: 55, projection: 70 },
  "sweet-warm-bold": { sweet: 95, woody: 45, spicy: 45, floral: 40, citrus: 5, aquatic: 0, smoky: 25, clean: 10, longevity: 85, projection: 90 },
  "spicy-woody-bold": { sweet: 20, woody: 75, spicy: 95, floral: 5, citrus: 10, aquatic: 0, smoky: 55, clean: 10, longevity: 90, projection: 85 },
  "clean-elegant-minimal": { sweet: 10, woody: 15, spicy: 5, floral: 20, citrus: 35, aquatic: 20, smoky: 0, clean: 95, longevity: 45, projection: 35 },
  "dark-warm-smoky": { sweet: 35, woody: 70, spicy: 60, floral: 10, citrus: 0, aquatic: 0, smoky: 90, clean: 5, longevity: 100, projection: 95 },
  "balanced-versatile-unisex": { sweet: 50, woody: 50, spicy: 50, floral: 50, citrus: 50, aquatic: 50, smoky: 50, clean: 50, longevity: 50, projection: 50 },
};

const NOTES: Record<string, string[]> = {
  "fresh-clean-citrus": ["Bergamot", "Lemon", "Neroli", "Musk"],
  "aquatic-fresh": ["Sea Salt", "Marine Accord", "Grapefruit", "Ambergris"],
  "woody-warm-elegant": ["Sandalwood", "Cedar", "Vanilla", "Tonka"],
  "woody-smoky-mysterious": ["Oud", "Birch Tar", "Guaiac Wood", "Incense"],
  "sweet-floral": ["Jasmine", "Rose", "Peach", "Caramel"],
  "sweet-warm-bold": ["Vanilla", "Amber", "Tobacco", "Praline"],
  "spicy-woody-bold": ["Black Pepper", "Cardamom", "Leather", "Patchouli"],
  "clean-elegant-minimal": ["White Musk", "Iris", "Cotton Accord"],
  "dark-warm-smoky": ["Myrrh", "Labdanum", "Vetiver", "Frankincense"],
  "balanced-versatile-unisex": ["Bergamot", "Lavender", "Cedar", "Musk"],
};

const FAMILIES: Record<string, string> = {
  "fresh-clean-citrus": "citrus",
  "aquatic-fresh": "aquatic",
  "woody-warm-elegant": "woody",
  "woody-smoky-mysterious": "woody smoky",
  "sweet-floral": "floral",
  "sweet-warm-bold": "amber",
  "spicy-woody-bold": "spicy",
  "clean-elegant-minimal": "musk",
  "dark-warm-smoky": "dark amber",
  "balanced-versatile-unisex": "universal",
};

const GENDERS = ["MEN", "WOMEN", "UNISEX"] as const;
const SEASONS = ["SPRING", "SUMMER", "AUTUMN", "WINTER"] as const;
const OCCASIONS = ["DAILY", "OFFICE", "DATE", "PARTY"] as const;

/** 10 perfumes per cluster × 10 clusters = 100. Deterministic composition. */
function buildPerfumes() {
  const rows: {
    id: string; name: string; brand: string; slug: string; gender: (typeof GENDERS)[number];
    price: number; inStock: boolean; active: boolean; cluster: string; variant: number;
  }[] = [];

  for (const cluster of CLUSTERS) {
    for (let variant = 1; variant <= 10; variant++) {
      const index = rows.length; // 0..99, stable across runs
      const id = `${ID_PREFIX}${String(index + 1).padStart(3, "0")}-${cluster.key}`;

      // Deliberate eligibility distribution across the whole 100:
      //  - every 7th is out-of-stock  (≈14)
      //  - every 11th is inactive     (≈9, overlaps with OOS by design)
      //  - the rest are in-stock + active
      const outOfStock = index % 7 === 6;
      const inactive = index % 11 === 10;

      rows.push({
        id,
        name: `MT ${cluster.key.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")} ${variant}`,
        brand: "MT Synthetic Lab",
        slug: `${id}`.replace(/_/g, "-"),
        gender: GENDERS[index % 3],
        // Fictional demo prices, deterministic, spread across a plausible band.
        price: 600000 + ((index * 137) % 42) * 100000,
        inStock: !outOfStock,
        active: !inactive,
        cluster: cluster.key,
        variant,
      });
    }
  }
  return rows;
}

async function main() {
  const prisma = getPrisma();

  await prisma.store.upsert({
    where: { id: STORE_ID },
    update: {},
    create: {
      id: STORE_ID,
      name: "Matching Test Store",
      slug: SLUG,
      websiteUrl: "https://matching-test.invalid",
      active: true,
    },
  });

  const rows = buildPerfumes();
  const perfumes = rows.map((row) => {
    const cluster = CLUSTERS.find((c) => c.key === row.cluster)!;
    const descriptors = DESCRIPTORS[row.cluster];
    return {
      id: row.id,
      storeId: STORE_ID,
      name: row.name,
      brand: row.brand,
      slug: row.slug,
      description: `تست موتور تطبیق — خوشهٔ ${row.cluster}، واریانت ${row.variant} (دادهٔ آزمایشی، نه محصول واقعی).`,
      productUrl: `https://matching-test.invalid/p/${row.variant}`,
      gender: row.gender,
      price: row.price,
      currency: STORE_CURRENCY,
      inStock: row.inStock,
      active: row.active,
      profile: {
        create: {
          social: cluster.social,
          adventurous: cluster.adventurous,
          expressive: cluster.expressive,
          mysterious: cluster.mysterious,
          fresh: cluster.fresh,
          warm: cluster.warm,
          experimental: cluster.experimental,
          elegant: cluster.elegant,
          bold: cluster.bold,
          family: FAMILIES[row.cluster],
          notes: NOTES[row.cluster],
          season: SEASONS[row.variant % SEASONS.length],
          occasion: OCCASIONS[row.variant % OCCASIONS.length],
          sweet: descriptors.sweet ?? 0,
          woody: descriptors.woody ?? 0,
          spicy: descriptors.spicy ?? 0,
          floral: descriptors.floral ?? 0,
          citrus: descriptors.citrus ?? 0,
          aquatic: descriptors.aquatic ?? 0,
          smoky: descriptors.smoky ?? 0,
          clean: descriptors.clean ?? 0,
          longevity: descriptors.longevity ?? 0,
          projection: descriptors.projection ?? 0,
        },
      },
    };
  });

  // Upsert keyed on the deterministic id → repeatable, no duplicates.
  for (const p of perfumes) {
    await prisma.perfume.upsert({
      where: { id: p.id },
      update: {},
      create: p,
    });
  }

  const [storeCount, perfumeCount, profileCount] = await prisma.$transaction([
    prisma.store.count({ where: { id: STORE_ID } }),
    prisma.perfume.count({ where: { storeId: STORE_ID } }),
    prisma.fragranceProfile.count({ where: { perfume: { storeId: STORE_ID } } }),
  ]);

  const inStockCount = await prisma.perfume.count({ where: { storeId: STORE_ID, inStock: true } });
  const activeCount = await prisma.perfume.count({ where: { storeId: STORE_ID, active: true } });

  console.log("Matching-test dataset complete (idempotent upserts).");
  console.log(JSON.stringify({
    store: STORE_ID,
    perfumes: perfumeCount,
    profiles: profileCount,
    active: activeCount,
    inactive: perfumeCount - activeCount,
    inStock: inStockCount,
    outOfStock: perfumeCount - inStockCount,
  }));
}

main()
  .catch((err) => {
    console.error("seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => getPrisma().$disconnect());
