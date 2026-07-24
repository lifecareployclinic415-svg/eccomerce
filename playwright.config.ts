// playwright.config.ts

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Serial on CI so tests sharing inventory fixtures cannot race each
  // other into INSUFFICIENT_STOCK failures that look like real bugs.
  fullyParallel: !process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  // One retry only. More retries hide flakiness rather than fixing it.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html"], ["github"]] : [["list"]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Most Indian eCommerce traffic is mobile; a checkout that only works
    // on desktop is broken for the majority of customers.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  webServer: {
    // Test the production build: dev mode has different caching, no
    // minification and looser error handling.
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
