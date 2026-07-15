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

    // Teams is intentionally free of protocol/wallet chrome.
    await expect(page.getByRole("button", { name: /connect wallet/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Market", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Verify", exact: true })).toHaveCount(0);

    // A sample dashboard must say so and offer an explicit path to real data.
    await expect(page.getByRole("region", { name: "Sample briefing" })).toBeVisible();
    await expect(page.getByRole("link", { name: /analyse my data/i })).toHaveAttribute("href", "/?start=connect&workspace=teams");

    // The fresh-episode banner offers the audio as a CTA on the dashboard
    const listenCta = page.getByText("Listen to this analysis");
    await expect(listenCta).toBeVisible({ timeout: 10_000 });
    await listenCta.click();

    // Episode player page with the demo episode
    await page.waitForURL("**/episode/demo**", { timeout: 15_000 });
    await expect(page.getByTestId("play-button")).toBeVisible({ timeout: 10_000 });
  });

  test("takes a sample viewer straight into the real-data connection flow", async ({ page }) => {
    await page.goto("/protocol?episode=demo-enterprise&demo=1&workspace=teams");

    await page.getByRole("link", { name: /analyse my data/i }).click();
    await page.waitForURL("**/?start=connect&workspace=teams");
    await expect(page.getByRole("heading", { name: "Connect your data" })).toBeVisible();
    await expect(page.getByText("Your instance", { exact: true })).toBeVisible();
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

test.describe("Workspace switch", () => {
  test("should switch to the protocol presentation and update landing content", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Teams is the default workspace.
    await expect(page.getByText("Teams", { exact: true })).toBeVisible();

    await page.getByText("Protocols", { exact: true }).click();

    await expect(page.getByRole("heading", { name: /protocol health, explained and provable/i })).toBeVisible({ timeout: 3_000 });
  });

  test("keeps protocol context when navigating home from a protocol surface", async ({ page }) => {
    await page.goto("/onchain");

    await expect(page.getByRole("link", { name: "Back to DataBard home" }))
      .toHaveAttribute("href", "/?workspace=protocols");
  });

  test("switches dashboard workspace without changing the route", async ({ page }) => {
    await page.goto("/protocol?workspace=protocols");

    const teams = page.getByRole("link", { name: "Teams", exact: true });
    await expect(teams).toHaveAttribute("href", "/protocol?workspace=teams");
    await teams.click();

    await expect(page).toHaveURL(/\/protocol\?workspace=teams/);
    await expect(page.getByRole("link", { name: "Teams", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("keeps home and workspace controls available on mobile protocol surfaces", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/onchain");

    await expect(page.getByRole("link", { name: "Back to DataBard home" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Teams", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Protocols", exact: true })).toBeVisible();
    expect(await page.getByRole("banner").evaluate((header) => header.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
