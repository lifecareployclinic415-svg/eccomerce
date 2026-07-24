// e2e/checkout.spec.ts

import { test, expect, type Page } from "@playwright/test";

const TEST_USER = { email: "e2e@test.local", password: "TestPass123" };

test.describe("guest shopping journey", () => {
  test("browse, add to bag, and see the bag persist across a reload", async ({ page }) => {
    await page.goto("/shop");

    // Locate by role and accessible name rather than CSS classes: the
    // test then also asserts the page is navigable by assistive tech, and
    // does not break every time a Tailwind class changes.
    const firstProduct = page.getByRole("article").first();
    await expect(firstProduct).toBeVisible();
    await firstProduct.getByRole("link").first().click();

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /add to bag/i }).click();
    await expect(page.getByText(/added to bag/i)).toBeVisible();

    // The guest cart lives in an httpOnly cookie, so a reload must not
    // lose it — this is the regression that breaks silently.
    await page.reload();
    await page.goto("/cart");
    await expect(page.getByRole("listitem")).toHaveCount(1);
  });

  test("quantity changes are clamped to available stock", async ({ page }) => {
    await addFirstProductToCart(page);
    await page.goto("/cart");

    const increase = page.getByRole("button", { name: /increase quantity/i });
    for (let i = 0; i < 15; i++) await increase.click();

    // The server is the authority. Whatever the UI did optimistically,
    // the settled quantity must never exceed the per-line cap.
    await expect(page.getByRole("status")).not.toContainText("16");
  });
});

test.describe("cart merge on login", () => {
  test("a guest bag survives signing in", async ({ page }) => {
    await addFirstProductToCart(page);

    await page.goto("/login");
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill(TEST_USER.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/account|\/$/);

    await page.goto("/cart");
    // Losing someone's bag at the login step is one of the highest-impact
    // conversion bugs there is, and it is invisible in unit tests.
    await expect(page.getByRole("listitem")).toHaveCount(1);
  });
});

test.describe("checkout", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await addFirstProductToCart(page);
  });

  test("completes a cash-on-delivery order and shows a confirmation", async ({ page }) => {
    await page.goto("/checkout");

    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /continue/i }).click();   // address → delivery
    await page.getByRole("button", { name: /continue/i }).click();   // delivery → payment

    await page.getByLabel(/cash on delivery/i).check();
    await page.getByRole("button", { name: /continue/i }).click();   // payment → review

    await page.getByRole("button", { name: /place order/i }).click();

    await page.waitForURL(/\/order\/.+\/confirmed/);
    await expect(page.getByRole("heading", { name: /thanks/i })).toBeVisible();
    await expect(page.getByText(/ORD-\d{8}-\d{6}/)).toBeVisible();

    // The bag must be empty afterwards — place_order deletes cart_items
    // inside the same transaction that creates the order.
    await page.goto("/cart");
    await expect(page.getByText(/empty|nothing/i)).toBeVisible();
  });

  test("double-clicking Place Order creates only ONE order", async ({ page }) => {
    await page.goto("/checkout");
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel(/cash on delivery/i).check();
    await page.getByRole("button", { name: /continue/i }).click();

    const place = page.getByRole("button", { name: /place order/i });
    // Fire twice as fast as the browser allows — the idempotency key is
    // what has to catch this, not a disabled attribute.
    await Promise.all([place.click(), place.click().catch(() => {})]);

    await page.waitForURL(/\/order\/.+\/confirmed/);
    await page.goto("/account/orders");
    await expect(page.getByRole("row")).toHaveCount(2); // header + one order
  });
});

test.describe("accessibility and resilience", () => {
  test("the storefront is keyboard navigable from the skip link", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /skip to content/i })).toBeFocused();
  });

  test("a missing product returns a real 404, not a soft one", async ({ page }) => {
    const response = await page.goto("/product/does-not-exist-12345");

    // A soft 404 (200 with "not found" text) gets the page indexed and
    // pollutes search results, which is why Phase 13 used notFound().
    expect(response?.status()).toBe(404);
  });

  test("the checkout page is not indexable", async ({ page }) => {
    await signIn(page);
    await page.goto("/checkout");

    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/);
  });
});

/* ------------------------------------------------------------ helpers */

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/account|\/$/);
}

async function addFirstProductToCart(page: Page) {
  await page.goto("/shop");
  await page.getByRole("article").first().getByRole("link").first().click();
  await page.getByRole("button", { name: /add to bag/i }).click();
  await expect(page.getByText(/added to bag/i)).toBeVisible();
}
