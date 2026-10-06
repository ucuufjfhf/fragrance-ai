-- Make TOMAN the canonical perfume price unit (see lib/pricing/currency.ts).
--
-- The application stores the amount a merchant enters in Toman and the admin UI
-- already displays «تومان»; only the column default still said IRR. A column
-- default is what any write path that omits `currency` would silently inherit,
-- so the default is corrected to match the invariant.
--
-- Additive and non-destructive: the column is NOT recreated, its type is
-- unchanged, and no numeric price value is touched. Existing rows are
-- backfilled by a separate, explicit statement (not a migration concern).

-- AlterTable
ALTER TABLE "Perfume" ALTER COLUMN "currency" SET DEFAULT 'TOMAN';
