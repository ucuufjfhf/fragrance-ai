import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration.
 *
 * Phase 1 tests cover pure logic (quiz data, scoring, archetypes, flow state, the
 * API route) plus a dependency-free SSR render check of the quiz components, so
 * the fast `node` environment is enough: no jsdom, no React Testing Library and
 * no extra plugins. The `@/*` alias mirrors tsconfig.json so tests import modules
 * exactly like the app does.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
