import { chromium } from "playwright";
import { mkdirSync, existsSync } from "fs";
import path from "path";

const BASE = "https://databard.persidian.com";
const OUT = path.join(process.cwd(), "demo-assets");

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
  });

  // Set dark theme preference
  await context.addInitScript(() => {
    localStorage.setItem("databard:onboarding-complete", "1");
  });

  const page = await context.newPage();

  // Scene 1: Landing page (onchain persona)
  console.log("Scene 1: Landing page");
  await page.goto(`${BASE}/?persona=onchain`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "01-landing.png"), fullPage: false });

  // Scene 2: Dashboard - click "Try the demo"
  console.log("Scene 2: Dashboard");
  await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  // Click the demo button to seed and go to protocol
  const demoBtn = page.locator("text=Try the demo").first();
  if (await demoBtn.isVisible()) {
    await demoBtn.click();
    await page.waitForTimeout(3000);
  }
  await page.goto(`${BASE}/protocol`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "02-dashboard.png"), fullPage: false });

  // Scroll to "What changed" section
  const whatChanged = page.locator("text=What changed").first();
  if (await whatChanged.isVisible()) {
    await whatChanged.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "03-what-changed.png"), fullPage: false });
  }

  // Scene 3: Audio briefing - find and click the listen button
  console.log("Scene 3: Audio briefing");
  const listenBtn = page.locator("text=Listen to this analysis").first();
  if (await listenBtn.isVisible()) {
    await listenBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "04-listen-button.png"), fullPage: false });
  }

  // Scene 4: Leaderboard
  console.log("Scene 4: Leaderboard");
  await page.goto(`${BASE}/leaderboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "05-leaderboard.png"), fullPage: false });

  // Scene 5: Verify page
  console.log("Scene 5: Verify page");
  await page.goto(`${BASE}/verify`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "06-verify.png"), fullPage: false });

  // Scene 6: Onchain page
  console.log("Scene 6: Onchain page");
  await page.goto(`${BASE}/onchain`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "07-onchain.png"), fullPage: false });

  // Scene 7: Market page
  console.log("Scene 7: Market page");
  await page.goto(`${BASE}/market`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "08-market.png"), fullPage: false });

  // Close video recording
  const video = page.video();
  await page.close();
  if (video) {
    const videoPath = await video.path();
    console.log(`Screen recording saved to: ${videoPath}`);
  }

  await context.close();
  await browser.close();
  console.log("Done! Screenshots saved to demo-assets/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
