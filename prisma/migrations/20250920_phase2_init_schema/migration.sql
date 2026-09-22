-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MEN', 'WOMEN', 'UNISEX');

-- CreateEnum
CREATE TYPE "Occasion" AS ENUM ('DAILY', 'DATE', 'PARTY', 'OFFICE', 'FORMAL');

-- CreateEnum
CREATE TYPE "Season" AS ENUM ('SPRING', 'SUMMER', 'AUTUMN', 'WINTER', 'ALL');

-- CreateEnum
CREATE TYPE "QuizSessionStatus" AS ENUM ('STARTED', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "logoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Perfume" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "productUrl" TEXT,
    "imageUrl" TEXT,
    "gender" "Gender" NOT NULL DEFAULT 'UNISEX',
    "price" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Perfume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FragranceProfile" (
    "id" TEXT NOT NULL,
    "perfumeId" TEXT NOT NULL,
    "social" INTEGER NOT NULL,
    "adventurous" INTEGER NOT NULL,
    "expressive" INTEGER NOT NULL,
    "mysterious" INTEGER NOT NULL,
    "fresh" INTEGER NOT NULL,
    "warm" INTEGER NOT NULL,
    "experimental" INTEGER NOT NULL,
    "elegant" INTEGER NOT NULL,
    "bold" INTEGER NOT NULL,
    "sweet" INTEGER,
    "woody" INTEGER,
    "spicy" INTEGER,
    "floral" INTEGER,
    "citrus" INTEGER,
    "aquatic" INTEGER,
    "smoky" INTEGER,
    "clean" INTEGER,
    "longevity" INTEGER,
    "projection" INTEGER,
    "family" TEXT,
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "season" "Season",
    "occasion" "Occasion",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FragranceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "answers" JSONB NOT NULL,
    "social" INTEGER,
    "adventurous" INTEGER,
    "expressive" INTEGER,
    "mysterious" INTEGER,
    "fresh" INTEGER,
    "warm" INTEGER,
    "experimental" INTEGER,
    "elegant" INTEGER,
    "bold" INTEGER,
    "archetypeId" TEXT,
    "status" "QuizSessionStatus" NOT NULL DEFAULT 'STARTED',
    "season" "Season",
    "occasion" "Occasion",
    "budget" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "quizSessionId" TEXT NOT NULL,
    "perfumeId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE INDEX "Perfume_storeId_active_inStock_idx" ON "Perfume"("storeId", "active", "inStock");

-- CreateIndex
CREATE UNIQUE INDEX "Perfume_storeId_slug_key" ON "Perfume"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "FragranceProfile_perfumeId_key" ON "FragranceProfile"("perfumeId");

-- CreateIndex
CREATE INDEX "QuizSession_storeId_status_createdAt_idx" ON "QuizSession"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Recommendation_perfumeId_idx" ON "Recommendation"("perfumeId");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_quizSessionId_rank_key" ON "Recommendation"("quizSessionId", "rank");

-- AddForeignKey
ALTER TABLE "Perfume" ADD CONSTRAINT "Perfume_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FragranceProfile" ADD CONSTRAINT "FragranceProfile_perfumeId_fkey" FOREIGN KEY ("perfumeId") REFERENCES "Perfume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSession" ADD CONSTRAINT "QuizSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_quizSessionId_fkey" FOREIGN KEY ("quizSessionId") REFERENCES "QuizSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_perfumeId_fkey" FOREIGN KEY ("perfumeId") REFERENCES "Perfume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

