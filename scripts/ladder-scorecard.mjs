#!/usr/bin/env node
/**
 * Virality ladder scorecard — docs/GTM.md "The virality ladder".
 *
 * Buckets the event ledger into ISO weeks and scores four rungs:
 *   1 share    — someone shares (clip_share, finding_share, share, *_share_copy)
 *   2 land     — a recipient lands (shared_episode_open/clip_play, or any
 *                pageview tagged src=share on a non-/episode path)
 *   3 activate — a recipient acts (shared_episode_cta_click, or src=share on
 *                generate/connect/demo/monday/roast CTAs)
 *   4 pay      — a recipient pays (src=share on edition_intent/publish*, schedule_setup)
 *
 * A rung is PROVEN when the next rung produced ≥5 events in each of the last
 * 3 complete ISO weeks (rung 4 is proven by its own count). Absolute counts —
 * percentages are noise at this volume.
 *
 * Usage:
 *   node scripts/ladder-scorecard.mjs [--data-dir DIR] [--events FILE]
 *          [--pageviews FILE] [--weeks N] [--json]
 *
 * Defaults: $DATABARD_DATA_DIR (env or .env), else ./data.
 *
 * Prod pull (run locally, nothing to install on the box):
 *   ssh snel-bot 'cat /opt/databard/data/events.json /opt/databard/data/pageviews.json' \
 *     is two files — simpler: scp snel-bot:/opt/databard/data/{events,pageviews}.json /tmp/
 *   node scripts/ladder-scorecard.mjs --data-dir /tmp
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

export const SHARE_EVENTS = new Set([
  "share",
  "clip_share",
  "finding_share",
  "league_share_copy",
  "superteam_share_copy",
  "edition_share_copy",
]);
export const EPISODE_LANDINGS = new Set(["shared_episode_open", "shared_clip_play"]);
export const ACTIVATE_EVENTS = new Set([
  "landing_cta_click",
  "demo_start",
  "demo_play",
  "connect_start",
  "generate_complete",
  "monday_signup",
  "integration_cta_click",
  "roast_cta_click",
  "dashboard_listen_click",
]);
export const PAY_EVENTS = new Set([
  "edition_intent",
  "edition_publish_start",
  "edition_published",
  "schedule_setup",
]);

export const PROOF_THRESHOLD = 5;
export const PROOF_WEEKS = 3;

/** ISO-8601 week for a UTC instant — same scheme as league.ts isoWeekParts. */
export function isoWeek(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day); // Thursday of this ISO week
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - 3);
  monday.setUTCHours(0, 0, 0, 0);
  return { key: `${year}-W${String(week).padStart(2, "0")}`, monday: monday.getTime() };
}

/** Per-week rung counts from raw ledger rows. */
export function countRungs(events, pageviews) {
  /** key -> { share, land, activate, pay, order } */
  const weeks = new Map();
  const bucket = (createdAt) => {
    const w = isoWeek(createdAt);
    if (!w) return null;
    if (!weeks.has(w.key)) weeks.set(w.key, { order: w.monday, share: 0, land: 0, activate: 0, pay: 0 });
    return weeks.get(w.key);
  };

  for (const e of events ?? []) {
    const b = bucket(e?.createdAt);
    if (!b || typeof e?.type !== "string") continue;
    const shareSrc = e.meta?.src === "share";
    if (SHARE_EVENTS.has(e.type)) b.share++;
    if (EPISODE_LANDINGS.has(e.type)) b.land++;
    if (e.type === "shared_episode_cta_click" || (shareSrc && ACTIVATE_EVENTS.has(e.type))) b.activate++;
    if (shareSrc && PAY_EVENTS.has(e.type)) b.pay++;
  }
  for (const v of pageviews ?? []) {
    // Tagged episode opens self-identify via shared_episode_open; counting
    // /episode/* pageviews too would double-count them.
    if (v?.src === "share" && typeof v.path === "string" && !v.path.startsWith("/episode")) {
      const b = bucket(v.createdAt);
      if (b) b.land++;
    }
  }
  return [...weeks.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, w]) => ({ week: key, monday: w.order, share: w.share, land: w.land, activate: w.activate, pay: w.pay }));
}

/**
 * proven[1..3] = next rung hit threshold in each of the last `proofWeeks`
 * complete weeks; proven[4] = pay hit threshold itself. Returns null statuses
 * when fewer than `proofWeeks` complete weeks exist.
 */
export function scoreLadder(weeks, now = Date.now()) {
  const currentMonday = isoWeek(new Date(now).toISOString())?.monday ?? now;
  const complete = weeks.filter((w) => w.monday < currentMonday);
  const recent = complete.slice(-PROOF_WEEKS);
  const enough = recent.length >= PROOF_WEEKS;
  const conversions = { 1: "land", 2: "activate", 3: "pay", 4: "pay" };
  const proven = {};
  for (const rung of [1, 2, 3, 4]) {
    const field = conversions[rung];
    proven[rung] = enough && recent.every((w) => w[field] >= PROOF_THRESHOLD);
  }
  const firstUnproven = [1, 2, 3, 4].find((r) => !proven[r]) ?? null;
  return { recentWeeks: recent.map((w) => w.week), enoughHistory: enough, proven, firstUnproven };
}

const GUIDANCE = {
  1: "shares aren't producing landings — check share surfaces and OG previews, don't build new ones.",
  2: "recipients land but don't act — fix the shared-page CTA before any new surface.",
  3: "activations aren't converting to pay intent — look at the edition/Pro path, not acquisition.",
  4: "pay conversions under threshold — the loop works, scale inputs.",
};

function pct(a, b) {
  return b > 0 ? `${Math.round((a / b) * 100)}%` : "—";
}
function cell(n, width) {
  return String(n).padEnd(width);
}

function readJsonFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`Could not read ${file}: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
      const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (m && m[1] === name) return m[2].trim().replace(/^"|"$/g, "");
    }
  } catch { /* no .env — fine */ }
  return undefined;
}

function parseArgs(argv) {
  const args = { weeks: 8, json: false };
  const valued = { "--weeks": "weeks", "--data-dir": "dataDir", "--events": "eventsFile", "--pageviews": "pageviewsFile" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const [flag, inline] = eq > 0 ? [a.slice(0, eq), a.slice(eq + 1)] : [a, undefined];
    if (a === "--json") args.json = true;
    else if (flag in valued) {
      const value = inline ?? argv[++i];
      if (value == null) { console.error(`${flag} needs a value`); process.exit(2); }
      if (flag === "--weeks") args.weeks = Math.max(1, Number.parseInt(value, 10) || 8);
      else args[valued[flag]] = value;
    } else if (!a.startsWith("--")) args.eventsFile = a; // positional = events.json path
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = args.dataDir || readEnv("DATABARD_DATA_DIR") || path.join(ROOT, "data");
  const eventsFile = args.eventsFile || path.join(dataDir, "events.json");
  const pageviewsFile = args.pageviewsFile || path.join(dataDir, "pageviews.json");

  const missing = [eventsFile, pageviewsFile].filter((f) => !fs.existsSync(f));
  if (missing.length === 2) {
    console.error(`No ledger found at ${dataDir}`);
    console.error("Pull prod data first:  scp snel-bot:/opt/databard/data/{events,pageviews}.json /tmp/");
    console.error("then:                  node scripts/ladder-scorecard.mjs --data-dir /tmp");
    process.exit(1);
  }

  const isFile = (f) => fs.existsSync(f) && fs.statSync(f).isFile();
  const events = isFile(eventsFile) ? readJsonFile(eventsFile) : [];
  const pageviews = isFile(pageviewsFile) ? readJsonFile(pageviewsFile) : [];
  const all = countRungs(events, pageviews);
  const { proven, firstUnproven, enoughHistory, recentWeeks } = scoreLadder(all);
  const currentMonday = isoWeek(new Date().toISOString())?.monday;
  const shown = all.slice(-args.weeks);

  if (args.json) {
    console.log(JSON.stringify({ weeks: shown, proven, firstUnproven, enoughHistory }, null, 2));
    return;
  }

  console.log("DataBard virality ladder — share → land → activate → pay");
  console.log(`events: ${eventsFile} (n=${events.length}) · pageviews: ${pageviewsFile} (n=${pageviews.length})`);
  console.log("");

  const header = `${cell("Week", 10)}${cell("Share", 8)}${cell("Land", 8)}${cell("Act", 8)}${cell("Pay", 6)}${cell("S→L", 7)}${cell("L→A", 7)}A→P`;
  console.log(header);
  console.log("—".repeat(header.length + 3));
  for (const w of shown) {
    const label = w.monday >= currentMonday ? `${w.week}*` : w.week;
    console.log(
      `${cell(label, 10)}${cell(w.share, 8)}${cell(w.land, 8)}${cell(w.activate, 8)}${cell(w.pay, 6)}` +
        `${cell(pct(w.land, w.share), 7)}${cell(pct(w.activate, w.land), 7)}${pct(w.pay, w.activate)}`,
    );
  }
  if (shown.length === 0) console.log("(no events in ledger)");
  console.log("");

  const names = { 1: "share → land", 2: "land → activate", 3: "activate → pay", 4: "pay ≥5/wk" };
  for (const rung of [1, 2, 3, 4]) {
    const status = !enoughHistory ? "INSUFFICIENT DATA (<3 complete weeks)" : proven[rung] ? "PROVEN" : "UNPROVEN";
    console.log(`rung ${rung} (${names[rung]}): ${status}`);
  }
  console.log("");
  if (!enoughHistory) {
    console.log("FIRST UNPROVEN RUNG: undetermined — fewer than 3 complete weeks in window.");
  } else if (firstUnproven === null) {
    console.log("LADDER PROVEN — every rung ≥5/wk for 3 consecutive weeks. Scale inputs.");
  } else {
    console.log(`FIRST UNPROVEN RUNG: ${firstUnproven} — ${GUIDANCE[firstUnproven]}`);
  }
  if (recentWeeks.length) console.log(`(proof window: ${recentWeeks.join(", ")}; * = week in progress)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
