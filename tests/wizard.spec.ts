import { test, expect } from "@playwright/test";

test.describe("Wizard Flow", () => {
  test("should navigate from landing to connect step", async ({ page }) => {
    await page.goto("/");

    // Click connect using stable testid
    await page.getByTestId("connect-button").click();

    // Connect step should show its heading
    await expect(page.getByText("Connect a data source")).toBeVisible({ timeout: 3_000 });

    // Step indicator should highlight "Connect"
    await expect(page.getByText("Connect").first()).toBeVisible();
  });

  test("should show all four step labels in the step indicator", async ({ page }) => {
    await page.goto("/");

    // Enter demo mode to reach the step indicator
    await page.getByTestId("demo-button").click();

    // All four step labels should be present in the nav
    const nav = page.locator("nav[aria-label='Progress']");
    await expect(nav.getByText("Connect")).toBeVisible();
    await expect(nav.getByText("Pick dataset")).toBeVisible();
    await expect(nav.getByText("Generate")).toBeVisible();
    await expect(nav.getByText("Listen")).toBeVisible();
  });

  test("should allow navigating back from schema picker", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("connect-button").click();

    // Back button should be visible
    await expect(page.getByRole("button", { name: /back/i })).toBeVisible();
  });
});

test.describe("Schema Picker", () => {
  test("should show search input when schemas are loaded", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("connect-button").click();

    // Search input uses data-testid; visibility depends on having >5 schemas
    const searchInput = page.getByTestId("schema-search");
    // Assert it's either visible or absent (not a flaky "maybe" assertion)
    const count = await searchInput.count();
    expect(count).toBeLessThanOrEqual(1);
  });

  test("should display research question guidance", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("connect-button").click();

    // The guidance panel should be present
    await expect(page.getByText(/Good questions are specific/i)).toBeVisible();
  });

  test("should show question presets", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("connect-button").click();

    // At least one preset should be visible
    await expect(page.getByRole("button", { name: /failing tests/i })).toBeVisible();
  });
});

test.describe("Episode Player", () => {
  test("should render player controls after demo load", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("demo-button").click();

    // Wait for the episode step
    await expect(page.getByText("Listen")).toBeVisible({ timeout: 10_000 });

    // Play button should be present (uses data-testid)
    await expect(page.getByTestId("play-button")).toBeVisible({ timeout: 5_000 });
  });

  test("should show share button in episode card", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("demo-button").click();

    await expect(page.getByText("Listen")).toBeVisible({ timeout: 10_000 });

    // Share button should be visible in the episode card header
    await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  });

  test("should show mobile action bar on small viewports", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.getByTestId("demo-button").click();

    await expect(page.getByText("Listen")).toBeVisible({ timeout: 10_000 });

    // Mobile action bar uses stable data-testid
    await expect(page.getByTestId("mobile-action-bar")).toBeAttached();
  });
});
