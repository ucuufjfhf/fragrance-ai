import "dotenv/config";

import { getPrisma } from "@/lib/db";
import { regenerateStoreReportToken } from "@/lib/store-report/report";

/**
 * Operator-only first mint of a store's report link (pilot reporting).
 *
 * Usage:
 *
 *   npx tsx scripts/issue-report-token.ts --store <store-id>
 *   npx tsx scripts/issue-report-token.ts --slug <store-slug>
 *
 * One-shot safety: if the store already has a token, nothing is overwritten —
 * rotation lives in the admin panel (تازه‌سازی پیوند). The printed path is
 * the full capability; share it only with the store owner. No AI dependency.
 */

interface ParsedArgs {
  storeId?: string;
  slug?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    switch (key) {
      case "--store":
        args.storeId = value;
        i += 1;
        break;
      case "--slug":
        args.slug = value;
        i += 1;
        break;
      default:
        // Unknown flags are ignored so typo'd flags cannot mint garbage.
        break;
    }
  }
  return args;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.storeId && !args.slug) {
    console.error("خطا: شناسه یا نامک فروشگاه لازم است.");
    console.error("مثال: npx tsx scripts/issue-report-token.ts --slug my-shop");
    return 1;
  }

  const prisma = getPrisma();

  const store = await prisma.store.findFirst({
    where: args.storeId ? { id: args.storeId } : { slug: args.slug },
    select: { id: true, name: true, active: true, reportToken: true },
  });

  if (!store) {
    console.error("خطا: فروشگاهی با این مشخصات پیدا نشد.");
    return 1;
  }

  if (!store.active) {
    console.error("خطا: این فروشگاه غیرفعال است؛ گزارش فقط برای فروشگاه فعال صادر می‌شود.");
    return 1;
  }

  if (store.reportToken) {
    console.log("برای این فروشگاه قبلاً پیوند ساخته شده است؛ چیزی تغییر نکرد.");
    console.log(`  store:  ${store.name}`);
    console.log(`  path:   /store-report/${store.reportToken}`);
    console.log("");
    console.log("برای تازه‌سازی، از پنل مدیریت (پیوند گزارش فروشگاه) اقدام کنید.");
    return 0;
  }

  const result = await regenerateStoreReportToken(store.id);

  if (!result.ok) {
    console.error("خطا در ساخت پیوند؛ اتصال پایگاه داده را بررسی کنید.");
    return 1;
  }

  console.log("پیوند گزارش ساخته شد ✓");
  console.log(`  store:  ${store.name}`);
  console.log(`  path:   /store-report/${result.reportToken}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch(() => process.exit(1));
