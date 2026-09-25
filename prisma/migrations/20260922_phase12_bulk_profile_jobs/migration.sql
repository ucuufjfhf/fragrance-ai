-- CreateEnum
CREATE TYPE "BulkProfileJobStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED_RATE_LIMITED', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "BulkProfileItemStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "BulkProfileJob" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" "BulkProfileJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalItems" INTEGER NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BulkProfileJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkProfileItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "perfumeId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "status" "BulkProfileItemStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkProfileItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkProfileJob_storeId_status_createdAt_idx" ON "BulkProfileJob"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BulkProfileItem_jobId_status_idx" ON "BulkProfileItem"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BulkProfileItem_jobId_perfumeId_key" ON "BulkProfileItem"("jobId", "perfumeId");

-- AddForeignKey
ALTER TABLE "BulkProfileJob" ADD CONSTRAINT "BulkProfileJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkProfileItem" ADD CONSTRAINT "BulkProfileItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BulkProfileJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkProfileItem" ADD CONSTRAINT "BulkProfileItem_perfumeId_fkey" FOREIGN KEY ("perfumeId") REFERENCES "Perfume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
