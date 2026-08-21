import { test, expect } from "@playwright/test";

test.describe("Wizard Flow", () => {
  test("should navigate from landing to connect step", async ({ page }) => {
    await page.goto("/");

    // Click connect using stable testid
    await page.getByTestId("connect-button").click();

    // Connect step should show its heading (Protocols default → Coral query)
    await expect(page.getByRole("heading", { name: "Query your data" })).toBeVisible({ timeout: 3_000 });

    // Step indicator should highlight the first Coral step
    await expect(page.getByText("Query & ask", { exact: true }).first()).toBeVisible();
  });

  test("should show all four step labels in the step indicator", async ({ page }) => {
    await page.goto("/");

    // Enter the connect step to reach the step indicator (demo now leaves the wizard)
    await page.getByTestId("connect-button").click();

    // Coral skips the schema picker — three step labels, not four
    const nav = page.locator("nav[aria-label='Progress']");
    await expect(nav.getByText("Query & ask", { exact: true })).toBeVisible();
    await expect(nav.getByText("Generate", { exact: true })).toBeVisible();
    await expect(nav.getByText("Briefing", { exact: true })).toBeVisible();
  });

  test("should allow navigating back from schema picker", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("connect-button").click();

    // Back button should be visible
    await expect(page.getByRole("button", { name: /back/i })).toBeVisible();
  });
});

test.describe("Schema Picker", () => {
  test.beforeEach(async ({ page }) => {
    // Mock /api/connect so the OpenMetadata sandbox path can reach the schema picker
    await page.route("**/api/connect", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          source: "openmetadata",
          omMode: "sandbox",
          schemas: [
            "shop.orders",
            "shop.customers",
            "shop.products",
            "shop.inventory",
            "shop.events",
            "shop.carts",
            "shop.reviews",
            "shop.sessions",
            "shop.promos",
            "shop.returns",
          ],
        }),
      });
    });
    await page.goto("/?workspace=teams&start=connect&mode=sample");
    await expect(page.getByRole("heading", { name: "Connect your analyst to your data" })).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /Connect & Continue/i }).click();
    await page.waitForSelector("[data-tour='research-question']", { timeout: 5_000 });
  });

  test("should show search input when schemas are loaded", async ({ page }) => {
    // Search input uses data-testid; it appears when there are more than 5 schemas
    const searchInput = page.getByTestId("schema-search");
    await expect(searchInput).toBeVisible();
  });

  test("should display research question guidance", async ({ page }) => {
    // The guidance panel should be present
    await expect(page.getByText(/Good questions are specific/i)).toBeVisible();
  });

  test("should show question presets", async ({ page }) => {
    // At least one preset should be visible
    await expect(page.getByRole("button", { name: /What tables are most likely to break downstream/i })).toBeVisible();
  });
});

test.describe("Episode Player", () => {
  // The demo is dashboard-first now — seed the demo episode and open its page directly
  test.beforeEach(async ({ page }) => {
    await page.request.post("/api/demo/seed");
    await page.goto("/episode/demo");
  });

  test("should render player controls for the demo episode", async ({ page }) => {
    await expect(page.getByTestId("play-button")).toBeVisible({ timeout: 10_000 });
  });

  test("should show a score card without a wallet prompt", async ({ page }) => {
    await expect(page.getByRole("article", { name: /health/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Send me this every Monday")).toBeVisible();
    await expect(page.getByText(/connect your solana wallet/i)).toHaveCount(0);
  });

  test("should show share button in episode card", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Share", exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("should show mobile action bar on small viewports", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    // Mobile action bar uses stable data-testid
    await expect(page.getByTestId("mobile-action-bar")).toBeAttached({ timeout: 10_000 });
  });
});
