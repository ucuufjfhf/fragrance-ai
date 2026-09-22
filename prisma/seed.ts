import { getPrisma } from "@/lib/db";

/**
 * Development seed: one demo store and a handful of fictional perfumes with
 * complete fragrance profiles. This data is only for local development and
 * testing — never required for production.
 *
 * Run with: npm run db:seed
 */

const STORE_ID = "store-demo-perfume-shop";

async function main() {
  const prisma = getPrisma();

  // --- demo store ---
  const store = await prisma.store.upsert({
    where: { id: STORE_ID },
    update: {},
    create: {
      id: STORE_ID,
      name: "عطرسرای نمونه",
      slug: "demo-perfume-shop",
      websiteUrl: "https://demo.example.com",
      active: true,
    },
  });

  // --- second demo store: exists to demonstrate store isolation ---
  const secondStore = await prisma.store.upsert({
    where: { id: "store-demo-second-shop" },
    update: {},
    create: {
      id: "store-demo-second-shop",
      name: "بوتیک نمونه دوم",
      slug: "demo-second-shop",
      active: true,
    },
  });

  // --- demo perfumes ---
  const perfumes = [
    {
      id: "perfume-demo-noir",
      storeId: store.id,
      name: "نویر نمونه",
      brand: "Demo Maison",
      slug: "demo-noir",
      description: "یک عطر دمو با رایحه چوبی و شرقی",
      productUrl: "https://demo.example.com/p/noir",
      gender: "UNISEX" as const,
      price: 2400000,
      inStock: true,
      profile: {
        social: 35,
        adventurous: 70,
        expressive: 50,
        mysterious: 90,
        fresh: 25,
        warm: 75,
        experimental: 65,
        elegant: 60,
        bold: 70,
        smoky: 80,
        woody: 85,
        spicy: 60,
        longevity: 85,
        projection: 70,
      },
    },
    {
      id: "perfume-demo-fresh",
      storeId: store.id,
      name: "فرش نمونه",
      brand: "Demo Maison",
      slug: "demo-fresh",
      description: "یک عطر دمو با رایحه تازه و مرطوب",
      productUrl: "https://demo.example.com/p/fresh",
      gender: "MEN" as const,
      price: 1600000,
      inStock: true,
      profile: {
        social: 70,
        adventurous: 40,
        expressive: 55,
        mysterious: 20,
        fresh: 95,
        warm: 25,
        experimental: 35,
        elegant: 45,
        bold: 25,
        aquatic: 85,
        citrus: 90,
        longevity: 40,
        projection: 50,
      },
    },
    {
      id: "perfume-demo-rose",
      storeId: store.id,
      name: "رز نمونه",
      brand: "Demo Maison",
      slug: "demo-rose",
      description: "یک عطر دمو با رایحه گلی و شیرین",
      productUrl: "https://demo.example.com/p/rose",
      gender: "WOMEN" as const,
      price: 1900000,
      inStock: true,
      profile: {
        social: 60,
        adventurous: 30,
        expressive: 70,
        mysterious: 40,
        fresh: 40,
        warm: 70,
        experimental: 30,
        elegant: 75,
        bold: 30,
        floral: 90,
        sweet: 80,
        longevity: 60,
        projection: 55,
      },
    },
    {
      id: "perfume-demo-amber",
      storeId: store.id,
      name: "امبر نمونه",
      brand: "Demo Maison",
      slug: "demo-amber",
      description: "یک عطر دمو با رایحه آمبری و گرم",
      productUrl: "https://demo.example.com/p/amber",
      gender: "UNISEX" as const,
      price: 2100000,
      inStock: false,
      profile: {
        social: 50,
        adventurous: 55,
        expressive: 45,
        mysterious: 70,
        fresh: 20,
        warm: 90,
        experimental: 45,
        elegant: 70,
        bold: 65,
        woody: 50,
        spicy: 65,
        longevity: 80,
        projection: 65,
      },
    },
    {
      id: "perfume-demo-citrus",
      storeId: secondStore.id,
      name: "سیترون نمونه",
      brand: "Demo Atelier",
      slug: "demo-citrus",
      description: "عطر دموی فروشگاه دوم با رایحه مرکباتی",
      productUrl: "https://demo-second.example.com/p/citrus",
      gender: "WOMEN" as const,
      price: 1750000,
      inStock: true,
      profile: {
        social: 80,
        adventurous: 50,
        expressive: 75,
        mysterious: 15,
        fresh: 90,
        warm: 20,
        experimental: 60,
        elegant: 50,
        bold: 40,
        citrus: 95,
        aquatic: 70,
        longevity: 35,
        projection: 55,
      },
    },
  ];

  for (const p of perfumes) {
    await prisma.perfume.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        storeId: p.storeId,
        name: p.name,
        brand: p.brand,
        slug: p.slug,
        description: p.description,
        productUrl: p.productUrl,
        gender: p.gender,
        price: p.price,
        inStock: p.inStock,
        profile: {
          create: p.profile,
        },
      },
    });
  }

  const counts = await prisma.$transaction([
    prisma.store.count(),
    prisma.perfume.count(),
    prisma.fragranceProfile.count(),
    prisma.quizSession.count(),
    prisma.recommendation.count(),
  ]);

  console.log("Seed complete.");
  console.log("Counts:", {
    stores: counts[0],
    perfumes: counts[1],
    profiles: counts[2],
    sessions: counts[3],
    recommendations: counts[4],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
