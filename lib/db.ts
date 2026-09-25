import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Single Prisma Client instance for the application.
 *
 * Prisma ORM 7 requires an explicit driver adapter, so the PostgreSQL adapter
 * is wired up here (the only place in the codebase that knows about `pg`).
 *
 * The client is created lazily so that importing this module never requires a
 * database connection — important for `next build`, which must not need a
 * live PostgreSQL server.
 *
 * The instance is cached on `globalThis` to survive Next.js hot reloads and to
 * avoid opening a new connection pool per module instance in serverless runs.
 */
const globalForPrisma = globalThis as unknown as { prismaClient?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prismaClient) {
    return globalForPrisma.prismaClient;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and provide a PostgreSQL connection string (see README.md).",
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      // Cap the per-instance pool: on serverless hosts (Netlify/Vercel
      // functions) every warm instance opens up to `max` Supabase pooler
      // connections, so the pg default of 10 can exhaust the Session Pooler
      // under concurrency. Override with PG_POOL_MAX when scaling deliberately.
      max: Number(process.env.PG_POOL_MAX ?? 5),
    }),
  });

  globalForPrisma.prismaClient = prisma;

  return prisma;
}
