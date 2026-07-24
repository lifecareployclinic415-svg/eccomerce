// vitest.config.mts

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * TEST STRATEGY — forced by tooling, not chosen.
 *
 * Vitest cannot render async Server Components (React's async component
 * support is not stable in test runners), and Next.js officially
 * recommends E2E for them. Most of this app IS async Server Components,
 * so the split is:
 *
 *   Vitest      → pure logic, Zod schemas, server actions with mocked
 *                 boundaries, client components, route handlers.
 *   pgTAP       → RLS policies, SQL functions, triggers. These cannot be
 *                 tested from TypeScript at all.
 *   Playwright  → async Server Components and real user journeys.
 *
 * Chasing a coverage percentage would be the wrong goal here. The goal is
 * that everything which can silently lose money or leak data has a test.
 */
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // E2E lives in Playwright; keep the runners from fighting over files.
    exclude: ["**/node_modules/**", "**/e2e/**", "**/.next/**"],
    coverage: {
      provider: "v8",
      // Report on the code where a bug is expensive, not on every file.
      include: [
        "src/features/**/services/**",
        "src/features/**/schemas/**",
        "src/lib/**",
      ],
      exclude: ["**/*.test.ts", "**/types.ts"],
      thresholds: {
        // The pricing engine is the one place a 100% bar is justified:
        // it is pure, small, and every branch moves money.
        "src/features/cart/services/pricing.service.ts": {
          statements: 100, branches: 100, functions: 100, lines: 100,
        },
      },
    },
  },
});
