-- Merchant brand colour for the embedded widget (lib/store/branding.ts).
--
-- Minimal, additive, backwards-compatible: one nullable column. Existing rows
-- keep NULL, which means "use the FIAGE default accent" — the exact behaviour
-- every store has today. No index: the column is only read with the store row.

-- AlterTable
ALTER TABLE "Store" ADD COLUMN "accentColor" TEXT;
