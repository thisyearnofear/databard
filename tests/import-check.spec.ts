import { test, expect } from "@playwright/test";

test.describe("/community/import-check", () => {
  test("result-first sample view", async ({ page }) => {
    await page.goto("/community/import-check");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Same email, different people?");
    await expect(page.getByRole("heading", { level: 2 })).toHaveText("1 group to review");
    await expect(page.getByText("Fictional sample · 4 records checked")).toBeVisible();
    // conflicting records visible in the preview; the matching group stays collapsed
    await expect(page.getByText("Alex Dean").first()).toBeVisible();
    await expect(page.getByText("Jo Dean").first()).toBeVisible();
    await expect(page.getByText("Sam Kim").first()).not.toBeVisible();
    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Check my file" })).toBeVisible();
    // compare details reveal the field×record table with real record headers
    await page.getByText("Compare records").first().click();
    await expect(page.getByRole("columnheader", { name: "record 3" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "record 4" })).toBeVisible();
    await page.getByText(/group with matching fields/).click();
    await page.locator("details details summary").click();
    await expect(page.getByText("Sam Kim").first()).toBeVisible();
  });

  test("own data: ambiguous key, run, back to sample", async ({ page }) => {
    await page.goto("/community/import-check");
    await page.getByRole("button", { name: "Check my file" }).click();
    const box = page.locator("#import-check-csv");
    await expect(box).toBeFocused();
    await expect(page.getByText(/max 512,000 chars/)).toBeVisible();
    await box.fill("Ticket,BuyerEmail,GuestEmail\nVIP,pat@x.test,g1@x.test\nVIP,pat@x.test,g2@x.test\nGA,sam@x.test,g1@x.test");
    await page.getByRole("button", { name: "Run the check" }).click();
    await expect(page.getByRole("alert").first()).toContainText("pick the key");
    await page.locator("#import-check-column").selectOption("2");
    await expect(page.getByText("Grouped by “GuestEmail”")).toBeVisible();
    await expect(page.getByText("g1@x.test").first()).toBeVisible();
    await page.getByRole("button", { name: "Back to sample" }).click();
    await expect(page.getByText("Fictional sample · 4 records checked")).toBeVisible();
  });

  test("cancel edit restores original result and raw data", async ({ page }) => {
    await page.goto("/community/import-check");
    await page.getByRole("button", { name: "Check my file" }).click();
    const box = page.locator("#import-check-csv");
    await box.fill("Name,Email\nAna,ana@x.test\nAna,ana@x.test\nBea,shared@x.test\nBo,shared@x.test");
    await page.getByRole("button", { name: "Run the check" }).click();
    await expect(page.getByText("Pasted data · 4 records checked")).toBeVisible();
    await expect(page.getByText("shared@x.test").first()).toBeVisible();
    // edit then cancel — original result and raw text restored
    await page.getByRole("button", { name: "Edit data" }).click();
    await box.fill("Name,Email\nZed,zed@x.test");
    await page.getByRole("button", { name: "Back to results" }).click();
    await expect(page.getByText("Pasted data · 4 records checked")).toBeVisible();
    await expect(page.getByText("shared@x.test").first()).toBeVisible();
    // changing the key after the restore still checks the original data
    await page.getByRole("button", { name: "Change" }).click();
    await page.locator("select").selectOption("0");
    await expect(page.getByText("Grouped by “Name”")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText("Nothing to review");
  });

  test("ambiguous file upload resolves to a keyed result", async ({ page }) => {
    await page.goto("/community/import-check");
    const csv = "A,BuyerEmail,GuestEmail\nVIP,pat@x.test,g1@x.test\nVIP,pat@x.test,g2@x.test";
    await page.locator("input[type=file]").setInputFiles({
      name: "guests.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });
    // ambiguous keys keep the input mode open with a picker, never a blank result
    await expect(page.getByRole("alert").first()).toContainText("pick the key");
    await expect(page.locator("#import-check-csv")).toBeVisible();
    await page.locator("#import-check-column").selectOption("1");
    await expect(page.getByText("Your file · guests.csv · 2 records checked")).toBeVisible();
    await expect(page.getByText("pat@x.test").first()).toBeVisible();
  });
});
