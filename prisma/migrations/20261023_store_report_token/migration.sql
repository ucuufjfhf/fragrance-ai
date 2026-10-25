-- Read-only store report capability token (see /store-report/[token]).
-- Minimal, additive, backwards-compatible: one nullable column with a unique
-- index. Existing rows keep NULL (no report link) until a token is issued.

-- AlterTable
ALTER TABLE "Store" ADD COLUMN "reportToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Store_reportToken_key" ON "Store"("reportToken");
