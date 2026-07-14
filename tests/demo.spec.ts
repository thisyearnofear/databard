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

  test("should enter demo mode dashboard-first, then reach the episode player", async ({ page }) => {
    await page.goto("/");

    // Click demo button using stable testid — demo is dashboard-first now
    await page.getByTestId("demo-button").click();
    await page.waitForURL("**/protocol**", { timeout: 15_000 });

    // The fresh-episode banner offers the audio as a CTA on the dashboard
    const listenCta = page.getByText("Listen to this analysis");
    await expect(listenCta).toBeVisible({ timeout: 10_000 });
    await listenCta.click();

    // Episode player page with the demo episode
    await page.waitForURL("**/episode/demo**", { timeout: 15_000 });
    await expect(page.getByTestId("play-button")).toBeVisible({ timeout: 10_000 });
  });

  test("should show onboarding tooltips once inside the wizard (not on landing)", async ({ page }) => {
    await page.goto("/");

    // Clear onboarding state to simulate first visit
    await page.evaluate(() => localStorage.removeItem("databard:onboarding-complete"));
    await page.reload();

    // Landing must stay unobscured — no welcome overlay here
    await page.waitForTimeout(2_500);
    await expect(page.getByText("Your data, explained")).not.toBeVisible();

    // Entering the wizard surfaces the tour
    await page.getByTestId("connect-button").click();
    await expect(page.getByText("Your data, explained")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Persona Toggle", () => {
  test("should switch persona and update landing content", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Default persona should be enterprise
    await expect(page.getByText("Enterprise", { exact: false })).toBeVisible();

    // Switch to Onchain
    const onchainToggle = page.getByText("Onchain", { exact: false });
    await onchainToggle.click();

    // Landing hero should update for web3 persona
    await expect(page.getByRole("heading", { name: /on-chain reports/i })).toBeVisible({ timeout: 3_000 });
  });
});
