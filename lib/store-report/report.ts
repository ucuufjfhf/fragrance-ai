import { randomBytes } from "node:crypto";

import { getPrisma } from "@/lib/db";

/**
 * Read-only store report capability (first-store pilot).
 *
 * The report token is a crypto-random, unguessable bearer secret stored on
 * the Store row. Whoever holds the link `/store-report/[token]` sees that
 * store's aggregate analytics — no admin login. The page itself only ever
 * renders aggregates (see app/store-report/[token]/page.tsx); this module
 * is the only code that reads or rotates the token.
 *
 * Must never be imported from a client component (Prisma + DATABASE_URL).
 */

export interface StoreReportStore {
  id: string;
  name: string;
  logoUrl: string | null;
}

/** 32 random bytes as URL-safe base64 — 43 chars, no padding. */
export function generateReportToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Resolves a report token to its store. Unknown AND inactive tokens both
 * resolve to null so callers cannot distinguish them (no store enumeration).
 * Only safe display fields are selected — never the token itself, never PII.
 */
export async function getStoreByReportToken(token: string): Promise<StoreReportStore | null> {
  if (!token) {
    return null;
  }

  const prisma = getPrisma();

  return prisma.store.findFirst({
    where: { reportToken: token, active: true },
    select: { id: true, name: true, logoUrl: true },
  });
}

/**
 * Rotates a store's report token (admin action + one-shot issue script).
 * The previous link dies the moment the new token is written.
 */
export async function regenerateStoreReportToken(
  storeId: string,
): Promise<{ ok: true; reportToken: string } | { ok: false; reason: "STORE_NOT_FOUND" }> {
  const prisma = getPrisma();

  const store = await prisma.store.findFirst({
    where: { id: storeId },
    select: { id: true },
  });

  if (!store) {
    return { ok: false, reason: "STORE_NOT_FOUND" };
  }

  const reportToken = generateReportToken();

  await prisma.store.update({
    where: { id: storeId },
    data: { reportToken },
  });

  return { ok: true, reportToken };
}
