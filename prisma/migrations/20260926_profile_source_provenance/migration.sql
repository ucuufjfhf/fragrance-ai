-- Reference-first enrichment provenance (ProfileSource).
-- Minimal, additive, backwards-compatible: new enum + one nullable column.
-- Existing rows keep NULL and are treated as MANUAL by convention.

CREATE TYPE "ProfileSource" AS ENUM ('REFERENCE', 'AI', 'MANUAL');

-- AlterTable
ALTER TABLE "FragranceProfile" ADD COLUMN "profileSource" "ProfileSource";
