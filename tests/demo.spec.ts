import { test, expect } from "@playwright/test";

test.describe("Demo Mode", () => {
  test("should load the landing page with hero and CTAs", async ({ page }) => {
    await page.goto("/");

    // Hero heading should be visible
    await expect(page.locator("h1")).toBeVisible();

    // Both primary CTAs should be present
    await expect(page.getByTestId("demo-button")).toBeVisible();
    await expect(page.getByTestId("connect-button")).toBeVisible();
  });

  test("should enter demo mode and reach episode player", async ({ page }) => {
    await page.goto("/");

    // Click demo button using stable testid
    await page.getByTestId("demo-button").click();

    // Step indicator should advance to "Listen"
    await expect(page.getByText("Listen")).toBeVisible({ timeout: 10_000 });

    // Episode card heading should appear (schema name from sample data)
    await expect(page.locator("h2")).toBeVisible({ timeout: 10_000 });
  });

  test("should show onboarding tooltips for first-time visitors", async ({ page }) => {
    await page.goto("/");

    // Clear onboarding state to simulate first visit
    await page.evaluate(() => localStorage.removeItem("databard:onboarding-complete"));
    await page.reload();

    // Welcome tooltip should appear after the 1.5s delay
    await expect(page.getByText("Welcome to DataBard")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Persona Toggle", () => {
  test("should switch persona and update landing content", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Default persona should be web3 (based on initialState)
    const web3Toggle = page.getByText("Web3");
    await expect(web3Toggle).toBeVisible();

    // Switch to Enterprise
    const enterpriseToggle = page.getByText("Enterprise");
    await enterpriseToggle.click();

    // Landing hero should update for enterprise persona
    await expect(page.getByText(/as a podcast/i)).toBeVisible({ timeout: 3_000 });
  });
});
