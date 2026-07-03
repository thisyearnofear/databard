#!/usr/bin/env node
/**
 * Record the demo video via Playwright.
 *
 * Walks a scripted tour of the DataBard marketplace: /market Watchdog auction,
 * head-to-head race, Consumer → Digest graph, /loop audit trail, /market/receipts
 * ledger. Playwright records the tab; ffmpeg later mixes in the ElevenLabs voice track.
 *
 * Beats (approximate wall-clock; total ≈ 100s):
 *   0:00  /market — Watchdog track, delta meter jitters
 *   0:04  trigger cycle → bids fly in
 *   0:20  buyer rationale streams, winner pulses
 *   0:32  escrow lifecycle: DEPOSITED → DELIVERED → RELEASED
 *   0:44  cut to /market Head-to-head, trigger, two races run in parallel
 *   1:04  cut to /loop — audit trail with green/red iteration cards
 *   1:14  cut to /market/receipts — public ledger, hover a mint link
 *   1:24  cut back to /market Watchdog, hover an Explorer link on a settled deal
 *   1:34  fade out
 */
import { chromium } from "playwright";
import { resolve, join } from "path";

const BASE = process.env.DEMO_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(new URL("../../video", import.meta.url).pathname);

async function beat(page, ms, label) {
  process.stdout.write(`  · ${label} (${(ms / 1000).toFixed(1)}s)\n`);
  await page.waitForTimeout(ms);
}

async function click(page, selector, label) {
  process.stdout.write(`  · click "${label}"\n`);
  await page.click(selector);
}

async function goto(page, path, label) {
  process.stdout.write(`▶ ${label} — ${path}\n`);
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
}

async function main() {
  console.log(`Recording against ${BASE}`);
  console.log(`Output dir: ${OUT_DIR}`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  try {
    // ── Beat 1 — /market Watchdog idle → triggered ──────────────────
    await goto(page, "/market", "Watchdog auction");
    await beat(page, 3000, "watching the delta jitter");
    await click(page, "text=trigger the next cycle now", "trigger cycle");
    await beat(page, 4000, "auction fires — bids arriving");

    // Wait for bid cards to render
    await page.waitForSelector("text=SELLERS BID", { timeout: 25000 }).catch(() => {});
    await beat(page, 4000, "sellers bid");

    // Wait for rationale to stream
    await beat(page, 6000, "buyer rationale streaming");

    // Wait for settlement receipt
    await page.waitForSelector('text=/Settled|episode is the receipt/i', { timeout: 45000 }).catch(() => {});
    await beat(page, 5000, "settlement receipt — audio + explorer");

    // ── Beat 2 — Head-to-head race ──────────────────────────────────
    await click(page, "text=Head-to-head race", "switch to head-to-head");
    await beat(page, 1500, "head-to-head tab active");
    await click(page, "text=trigger the next cycle now", "trigger race").catch(() => {});
    await beat(page, 12_000, "two watchdogs racing");
    await page.waitForSelector('text=/Race settled|both funds chose/i', { timeout: 40000 }).catch(() => {});
    await beat(page, 4000, "race settled");

    // ── Beat 3 — Graph (Consumer → Digest → Newsroom×3) ─────────────
    await click(page, "text=Consumer → Digest graph", "switch to graph");
    await beat(page, 1500, "graph tab active");
    await click(page, "text=trigger the next cycle now", "trigger graph").catch(() => {});
    await beat(page, 12_000, "reseller graph settling");
    await page.mouse.wheel(0, 300).catch(() => {});
    await beat(page, 4000, "scrolled to combined episode receipt");

    // ── Beat 4 — /loop audit trail ──────────────────────────────────
    await goto(page, "/loop", "verification audit trail");
    await beat(page, 8000, "iterations + commits visible");
    await page.mouse.wheel(0, 400).catch(() => {});
    await beat(page, 3000, "scroll through more iterations");

    // ── Beat 5 — /market/receipts public ledger ─────────────────────
    await goto(page, "/market/receipts", "settlement ledger");
    await beat(page, 6000, "50 settled deals visible");
    // Hover a mint link to draw attention
    await page.hover("a:has-text('mint ↗')").catch(() => {});
    await beat(page, 3000, "on-chain mint attestations");

    // ── Beat 6 — back to /market, fade-out beat ─────────────────────
    await goto(page, "/market", "back to the auction");
    await beat(page, 4000, "fade out");
  } catch (err) {
    console.error("recording error:", err);
  } finally {
    const videoPath = await page.video()?.path();
    await context.close();
    await browser.close();
    if (videoPath) {
      console.log(`\n✓ Recorded to ${videoPath}`);
      // Symlink to a stable name so ffmpeg wrapper can find it
      const stableName = join(OUT_DIR, "raw.webm");
      try {
        const fs = await import("fs");
        try { fs.unlinkSync(stableName); } catch {}
        fs.symlinkSync(videoPath, stableName);
        console.log(`  symlinked → ${stableName}`);
      } catch (e) {
        console.warn("symlink failed (non-fatal):", e.message);
      }
    }
  }
}

main().catch((e) => {
  console.error("main failed:", e);
  process.exit(1);
});
