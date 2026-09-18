import { test, expect, type Page } from "@playwright/test";
import bs58 from "bs58";

const PENDING_SIG = bs58.encode(Buffer.from(Array.from({ length: 64 }, (_, i) => i + 7)));

function pendingRecord(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    walletAddress: "WalletPending111",
    purpose: "edition",
    editionId: "int_test_1",
    slug: "jupiter",
    method: "usdc",
    txSignature: PENDING_SIG,
    amountLabel: "25 USDC",
    createdAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

const pendingKey = "databard:pending-checkout:edition:jupiter";

async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth <= el.clientWidth + 1;
  });
}

test.describe("public report landing", () => {
  test("root shows the report landing and the CTA reaches the directory", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.getByRole("link", { name: "Find your organization" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /your data/i }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "From public data to a published report." })).toBeVisible();
    await page.getByRole("link", { name: "Find your organization" }).first().click();
    await expect(page).toHaveURL(/\/earn$/);
    await expect(page.getByRole("heading", { name: "Find your organization" })).toBeVisible();
  });

  test("workspace query still opens the wizard, not the report landing", async ({ page }) => {
    await page.goto("/?workspace=protocols");
    await expect(page.getByRole("button", { name: /Explore the protocol league/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "From public data to a published report." })).toHaveCount(0);
  });

  test("start=connect opens the wizard flow", async ({ page }) => {
    await page.goto("/?start=connect&workspace=teams");
    await expect(page.getByLabel("Choose a workspace")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Reports navigation")).toHaveCount(0);
  });
});

test.describe("report directory search", () => {
  test("search filters to the matching organization and back restores the query", async ({ page }) => {
    await page.goto("/earn");
    const input = page.getByLabel("Organization name");
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill("jupiter");
    await expect(page.getByRole("status")).toContainText("1 organization");
    const row = page.getByRole("link", { name: /Preview Jupiter report/ });
    await expect(row).toBeVisible();
    await expect(page.getByRole("link", { name: /Preview .* report/ })).toHaveCount(1);
    await row.click();
    await expect(page).toHaveURL(/\/earn\/jupiter/);
    await expect(page.getByRole("heading", { name: /Jupiter, measured/i })).toBeVisible({ timeout: 15_000 });
    await page.goBack();
    await expect(page.getByLabel("Organization name")).toHaveValue("jupiter");
    await expect(page.getByRole("status")).toContainText("1 organization");
  });

  test("an unmatched search explains itself and clears", async ({ page }) => {
    await page.goto("/earn");
    const input = page.getByLabel("Organization name");
    await input.fill("zz-no-such-org");
    await expect(page.getByText(/No organizations found/)).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(input).toHaveValue("");
    await expect(page.getByRole("link", { name: /Preview .* report/ }).first()).toBeVisible();
  });
});

test.describe("public report chrome", () => {
  test("/superteam uses the reports header with no workspace switch", async ({ page }) => {
    await page.goto("/superteam");
    await expect(page.getByLabel("Reports navigation")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Workspace")).toHaveCount(0);
    const logo = page.getByRole("link", { name: "DataBard home" });
    await expect(logo).toHaveAttribute("href", "/");
    await expect(page.getByLabel("Reports navigation").getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/earn");
  });
});

test.describe("preview and publish", () => {
  test("preview is readable without a wallet and honest about pricing", async ({ page }) => {
    await page.goto("/earn/jupiter");
    await expect(page.getByText(/Free preview/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Publish report — \$\d+/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to payment" })).toBeVisible();
    await expect(page.getByText(/attested|permanent/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /connect|select/i })).toHaveCount(0);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/attested|permanent link/i);
  });
});

test.describe("payment recovery without a wallet", () => {
  test("a saved pending edition opens recovery and only calls verify", async ({ page }) => {
    const apiCalls: string[] = [];
    await page.route("**/api/editions", async (route) => {
      apiCalls.push("editions");
      await route.fulfill({ status: 500, body: "unexpected" });
    });
    await page.route("**/api/checkout/palmusd", async (route) => {
      if (route.request().method() === "POST") apiCalls.push("prepare");
      await route.fulfill({ status: 500, body: "unexpected" });
    });
    await page.route("**/api/checkout/palmusd/verify", async (route) => {
      apiCalls.push("verify");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, permalink: "/earn/jupiter", slug: "jupiter" }),
      });
    });
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [pendingKey, JSON.stringify(pendingRecord())],
    );
    await page.goto("/earn/jupiter");

    const check = page.getByRole("button", { name: /Check payment \/ finish publishing/ });
    await expect(check).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/This payment belongs to/)).toBeVisible();
    await check.click();
    await expect(page.getByText(/Report published/)).toBeVisible({ timeout: 15_000 });
    expect(apiCalls).toEqual(["verify"]);
    const stored = await page.evaluate((k) => window.localStorage.getItem(k), pendingKey);
    expect(stored).toBeNull();
  });

  test("a corrupt pending record stays blocked after Check saved payment", async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [pendingKey, "{not json"],
    );
    await page.goto("/earn/jupiter");
    const retry = page.getByRole("button", { name: "Check saved payment" });
    await expect(retry).toBeVisible({ timeout: 20_000 });
    await retry.click();
    await expect(page.getByText(/Saved payment details could not be read/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Publish this page|Approve payment/ })).toHaveCount(0);
  });
});

test.describe("report layout geometry", () => {
  for (const width of [320, 375, 414, 768, 1440]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.getByRole("heading", { name: /your data/i }).first()).toBeVisible({ timeout: 15_000 });
      expect(await noHorizontalOverflow(page)).toBe(true);
    });
  }

  test("hero splits beside the example on desktop and stacks on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const heading = page.getByRole("heading", { name: /your data/i }).first();
    const article = page.getByRole("article", { name: "Example report" });
    await expect(article).toBeVisible({ timeout: 15_000 });
    const h = await heading.boundingBox();
    const a = await article.boundingBox();
    expect(a!.x).toBeGreaterThan(h!.x + h!.width - 1);

    await page.setViewportSize({ width: 390, height: 844 });
    const h2 = await heading.boundingBox();
    const a2 = await article.boundingBox();
    expect(a2!.y).toBeGreaterThan(h2!.y + h2!.height - 1);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test("header does not overlap the hero at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const nav = page.getByLabel("Reports navigation");
    await expect(nav).toBeVisible({ timeout: 15_000 });
    const h = await page.getByRole("heading", { name: /your data/i }).first().boundingBox();
    const navBox = await nav.boundingBox();
    expect(h!.y).toBeGreaterThan(navBox!.y + navBox!.height - 1);
  });

  test("reduced motion renders the same report content", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /your data/i }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("article", { name: "Example report" })).toBeVisible();
  });
});

