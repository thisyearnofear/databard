import { test, expect } from "@playwright/test";

test.describe("Story layer — protocol dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/insights", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          totals: { sources: 2, failingTests: 3, staleTables: 0, undocumentedTables: 0 },
          insights: [
            {
              schemaFqn: "sales.core", schemaName: "sales", recordedAt: "2026-09-17T00:00:00Z",
              healthScore: 58, healthLabel: "at-risk", testCoverage: 40, docCoverage: 60,
              failingTests: 3, untestedCount: 1, ownerlessCount: 1, staleCount: 0,
              undocumentedCount: 0, tableCount: 10,
              criticalTables: [{ name: "payments", failingTests: 3, downstreamCount: 8, risk: "critical" }],
              lineageHotspots: [{ name: "payments", connections: 8 }],
              healthHistory: [70, 64, 58],
            },
            {
              schemaFqn: "orders.core", schemaName: "orders", recordedAt: "2026-09-17T00:00:00Z",
              healthScore: 92, healthLabel: "healthy", testCoverage: 95, docCoverage: 90,
              failingTests: 0, untestedCount: 0, ownerlessCount: 0, staleCount: 0,
              undocumentedCount: 0, tableCount: 6,
              criticalTables: [], lineageHotspots: [],
              healthHistory: [90, 92],
            },
          ],
        }),
      });
    });
    await page.route("**/api/onchain/mints/stats*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, totalMints: 0, recent: [] }) });
    });
    await page.route("**/api/insights/trends", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          narratives: [
            {
              schemaFqn: "sales.core", schemaName: "sales", healthScore: 58, healthScoreChange: -12,
              diff: { newTables: [], removedTables: [], newFailures: ["payments"], resolvedFailures: [], healthScoreChange: -12, testCoverageChange: 0, summary: "" },
              narrative: "Health dropped 12 points, 1 new test failure (payments).",
              hasHistory: true,
            },
          ],
        }),
      });
    });
  });

  test("renders one hero, the story, then evidence — in order", async ({ page }) => {
    await page.goto("/protocol?workspace=protocols");

    // L0 hero: one decision with a single Listen action
    const hero = page.getByLabel("Priority briefing");
    await expect(hero.or(page.getByRole("heading", { name: /failing tests in sales|needs stronger/ }))).toBeVisible({ timeout: 10_000 });

    // L1 story section exists with a Why-it-matters clause and evidence link
    const story = page.getByLabel("The story this week");
    await expect(story).toBeVisible();
    await expect(story.getByText("Why it matters:")).toBeVisible();

    // L2 evidence section sits behind the story
    const evidence = page.getByLabel("Evidence behind the briefing above");
    await expect(evidence).toBeVisible();

    // DOM order: hero precedes story precedes evidence
    const order = await page.evaluate(() => {
      const heroEl = document.querySelector('[aria-label="Priority briefing"], #priority-title');
      const storyEl = document.getElementById("story");
      const evidenceEl = document.querySelector('[aria-label="Evidence behind the briefing above"]');
      if (!heroEl || !storyEl || !evidenceEl) return null;
      const pos = (el: Element) => el.getBoundingClientRect().top;
      return [pos(heroEl), pos(storyEl), pos(evidenceEl)];
    });
    expect(order).not.toBeNull();
    expect(order![0]).toBeLessThan(order![1]);
    expect(order![1]).toBeLessThan(order![2]);
  });

  test("trend evidence link jumps to the source card anchor", async ({ page }) => {
    await page.goto("/protocol?workspace=protocols");
    const story = page.getByLabel("The story this week");
    await expect(story).toBeVisible({ timeout: 10_000 });
    await story.getByRole("link", { name: /view evidence/i }).first().click();
    await expect(page.locator("#source-sales")).toBeVisible();
  });

  test("source card collapses evidence behind Details", async ({ page }) => {
    await page.goto("/protocol?workspace=protocols");
    const card = page.locator("#source-sales");
    await expect(card).toBeVisible({ timeout: 10_000 });
    // L0: finding sentence visible without expanding
    await expect(card.getByText(/tests failing silently/)).toBeVisible();
    // L1: engine analysis hidden until Details opens
    await expect(card.getByText("Test coverage", { exact: true })).toBeHidden();
    await card.getByText(/Details ·/).click();
    await expect(card.getByText("Test coverage", { exact: true })).toBeVisible();
  });
});
