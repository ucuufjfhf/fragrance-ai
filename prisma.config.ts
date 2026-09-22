import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma ORM 7 configuration.
 *
 * `.env` is NOT auto-loaded by Prisma 7, so `dotenv/config` is imported above.
 * Secrets are never committed: `.env` is git-ignored, `.env.example` holds placeholders.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
