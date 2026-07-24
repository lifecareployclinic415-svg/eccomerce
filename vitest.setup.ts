// vitest.setup.ts

import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// next/navigation has no implementation outside a Next runtime.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// Cache helpers are no-ops in tests; we assert they were CALLED, not that
// they invalidated anything.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

// `server-only` throws if imported outside a server context.
vi.mock("server-only", () => ({}));

process.env.NEXT_PUBLIC_SITE_URL = "https://test.local";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
process.env.SUPABASE_SECRET_KEY = "test-secret";

// =====================================================================
// package.json — scripts to add
// =====================================================================
// {
//   "scripts": {
//     "test":          "vitest run",
//     "test:watch":    "vitest",
//     "test:coverage": "vitest run --coverage",
//     "test:db":       "supabase test db",
//     "test:e2e":      "playwright test",
//     "test:e2e:ui":   "playwright test --ui",
//     "test:all":      "npm run test && npm run test:db && npm run test:e2e"
//   }
// }
//
// npm install -D vitest @vitejs/plugin-react jsdom vite-tsconfig-paths \
//   @testing-library/react @testing-library/dom @testing-library/jest-dom \
//   @vitest/coverage-v8 @playwright/test
