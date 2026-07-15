/**
 * POST /api/demo/seed — idempotently seed deterministic demo data.
 *
 * Seeds two things:
 *  1. Demo episodes (always re-written — share entries expire in 24h):
 *     - "demo"            → public/sample-episode-dune.json + /demo-episode-dune.mp3
 *     - "demo-enterprise" → public/sample-episode.json      + /demo-episode.mp3
 *     Both stored via the shares mechanism with a 7-day TTL.
 *  2. Engine snapshot history for four schemas (only when the seed flag is
 *     missing) so the dashboard cards, sparklines, and week-over-week trend
 *     narratives look alive. dune.uniswap is the demo hero: a clear health
 *     decline with new test failures and a coverage drop in the last week.
 *
 * Safe by design: only writes fixed demo keys, never deletes anything.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { shares, store } from "@/lib/store";
import { saveSnapshot, type SchemaSnapshot } from "@/lib/schema-snapshots";
import { analyzeSchema } from "@/lib/schema-analysis";
import type { Episode, SchemaMeta, TableMeta, QualityTest, ColumnMeta } from "@/lib/types";

const SEED_FLAG = "demo:seeded:v1";
const SEED_FLAG_TTL = 86400 * 90; // matches snapshot TTL
const SHARE_TTL = 86400 * 7; // 7 days
const DAY = 86400_000;
const HOUR = 3600_000;

// ── Builders ─────────────────────────────────────────────────────────────────

function col(name: string, dataType: string, description?: string): ColumnMeta {
  return { name, dataType, description, tags: [] };
}

interface TableOpts {
  desc?: string;
  owner?: string;
  /** Hours before the snapshot's recordedAt that this table was last updated */
  freshHoursAgo?: number;
  rows?: number;
  tests?: QualityTest[];
  columns?: ColumnMeta[];
}

function tbl(schemaFqn: string, name: string, asOf: number, o: TableOpts): TableMeta {
  return {
    fqn: `${schemaFqn}.${name}`,
    name,
    description: o.desc,
    columns: o.columns ?? [],
    qualityTests: o.tests ?? [],
    tags: [],
    owner: o.owner,
    rowCount: o.rows,
    freshness: o.freshHoursAgo != null ? new Date(asOf - o.freshHoursAgo * HOUR).toISOString() : undefined,
  };
}

function test(name: string, status: QualityTest["status"]): QualityTest {
  return { name, status };
}

/**
 * Build a snapshot from a SchemaMeta via the real analysis engine, then pin
 * the health score to the prescribed arc value (labels follow the engine's
 * thresholds) and recompute staleness relative to the snapshot's own time.
 */
function buildSnapshot(
  schemaFqn: string,
  schemaName: string,
  meta: SchemaMeta,
  score: number,
  daysAgo: number,
  now: number,
  episodeId?: string,
): SchemaSnapshot {
  const recordedAt = new Date(now - daysAgo * DAY);
  const insights = analyzeSchema(meta);
  insights.healthScore = score;
  insights.healthLabel = score >= 70 ? "healthy" : score >= 40 ? "at-risk" : "critical";
  // analyzeSchema computes staleness against wall-clock "now" — recompute
  // against the snapshot's recordedAt so historical snapshots stay coherent.
  const asOf = recordedAt.getTime();
  insights.staleTables = meta.tables
    .filter((t) => t.freshness)
    .map((t) => ({ name: t.name, freshness: t.freshness!, hoursAgo: Math.round((asOf - Date.parse(t.freshness!)) / HOUR) }))
    .filter((t) => t.hoursAgo > 24)
    .sort((a, b) => b.hoursAgo - a.hoursAgo);
  return {
    schemaFqn,
    schemaName,
    tableNames: meta.tables.map((t) => t.name),
    insights,
    recordedAt: recordedAt.toISOString(),
    episodeId,
  };
}

// ── dune.uniswap — the demo hero ─────────────────────────────────────────────
// Table names mirror public/sample-episode-dune.json's schemaMeta so the
// dashboard, the seeded episode, and the trend narrative tell one story.

interface DuneState {
  /** Failing tests on Whale Movements (0–2) */
  whaleFailing: number;
  /** Whether Gas Cost Analysis has a failing data check */
  gasFailing: boolean;
  /** Hours since Gas Cost Analysis last refreshed (>24 ⇒ stale) */
  gasStaleHours: number;
  /** Whether New Pool Deployments still has tests configured */
  newPoolTested: boolean;
  /** Whether LP Fee Revenue has tests configured */
  lpTested: boolean;
}

function duneMeta(asOf: number, s: DuneState): SchemaMeta {
  const fqn = "dune.uniswap";
  const tables: TableMeta[] = [
    tbl(fqn, "Daily Volume by Chain", asOf, {
      desc: "Daily swap volume across all deployed chains.",
      owner: "uniswap-labs",
      freshHoursAgo: 2,
      rows: 2190,
      columns: [col("day", "date"), col("chain", "varchar"), col("volume_usd", "double")],
      tests: [test("query_has_description", "Success"), test("query_has_results", "Success"), test("query_has_data", "Success")],
    }),
    tbl(fqn, "TVL Breakdown by Pool", asOf, {
      desc: "Total value locked per pool, refreshed daily.",
      owner: "uniswap-labs",
      freshHoursAgo: 3,
      rows: 500,
      columns: [col("pool", "varchar"), col("tvl_usd", "double"), col("fee_tier", "integer")],
      tests: [test("query_has_description", "Success"), test("query_has_results", "Success"), test("query_has_data", "Success")],
    }),
    tbl(fqn, "Whale Movements", asOf, {
      desc: "Trades above $1M — the whale watch feed.",
      owner: "uniswap-labs",
      freshHoursAgo: 4,
      rows: s.whaleFailing > 0 ? 0 : 1240,
      columns: [col("tx_hash", "varchar"), col("trader", "varchar"), col("amount_usd", "double"), col("block_time", "timestamp")],
      tests: [
        test("query_has_description", "Success"),
        test("query_has_results", s.whaleFailing >= 2 ? "Failed" : "Success"),
        test("query_has_data", s.whaleFailing >= 1 ? "Failed" : "Success"),
      ],
    }),
    tbl(fqn, "Gas Cost Analysis", asOf, {
      // intentionally undocumented
      owner: "uniswap-labs",
      freshHoursAgo: s.gasStaleHours,
      rows: 365,
      columns: [col("day", "date"), col("avg_gas_usd", "double")],
      tests: [test("query_has_results", "Success"), test("query_has_data", s.gasFailing ? "Failed" : "Success")],
    }),
    tbl(fqn, "LP Fee Revenue", asOf, {
      // intentionally undocumented and ownerless
      freshHoursAgo: 5,
      columns: [col("pool", "varchar"), col("fees_usd", "double")],
      tests: s.lpTested ? [test("query_has_results", "Success")] : [],
    }),
    tbl(fqn, "New Pool Deployments", asOf, {
      // intentionally undocumented
      owner: "uniswap-labs",
      freshHoursAgo: 6,
      rows: 8200,
      columns: [col("pool", "varchar"), col("created_at", "timestamp")],
      tests: s.newPoolTested ? [test("query_has_results", "Success"), test("query_has_data", "Success")] : [],
    }),
  ];
  // Whale Movements feeds three downstream queries — failures there cascade.
  const lineage = [
    { fromTable: `${fqn}.Whale Movements`, toTable: `${fqn}.Daily Volume by Chain` },
    { fromTable: `${fqn}.Whale Movements`, toTable: `${fqn}.TVL Breakdown by Pool` },
    { fromTable: `${fqn}.Whale Movements`, toTable: `${fqn}.LP Fee Revenue` },
    { fromTable: `${fqn}.Daily Volume by Chain`, toTable: `${fqn}.Gas Cost Analysis` },
  ];
  return { fqn, name: "Uniswap Analytics", tables, lineage };
}

// ── analytics.ecommerce — gentle improvement ─────────────────────────────────
// Table names mirror public/sample-episode.json's schemaMeta (matches the
// existing mint-ledger schema group so those cards stop reading 0).

function ecommerceMeta(asOf: number, failing: Set<string>): SchemaMeta {
  const fqn = "analytics.ecommerce";
  const tables: TableMeta[] = [
    tbl(fqn, "orders", asOf, {
      desc: "One row per customer order.",
      owner: "Sarah Chen",
      freshHoursAgo: 1,
      rows: 182_000,
      tests: [test("not_null_order_id", "Success"), test("unique_order_id", "Success"), test("accepted_values_status", failing.has("orders") ? "Failed" : "Success")],
    }),
    tbl(fqn, "customers", asOf, {
      desc: "Customer master with contact details.",
      owner: "Sarah Chen",
      freshHoursAgo: 2,
      rows: 54_000,
      tests: [test("not_null_customer_id", "Success"), test("unique_email", "Success"), test("not_null_email", "Success")],
    }),
    tbl(fqn, "order_items", asOf, {
      desc: "Line items per order.",
      freshHoursAgo: 1,
      rows: 410_000,
      tests: [test("not_null_order_id", "Success"), test("positive_quantity", failing.has("order_items") ? "Failed" : "Success")],
    }),
    tbl(fqn, "products", asOf, {
      // intentionally undocumented, untested, ownerless
      freshHoursAgo: 4,
      rows: 3200,
      tests: [],
    }),
    tbl(fqn, "payments", asOf, {
      desc: "Payment transactions per order.",
      owner: "Mike Kumar",
      freshHoursAgo: 1,
      rows: 178_000,
      tests: [test("not_null_payment_id", "Success"), test("payment_amount_positive", failing.has("payments") ? "Failed" : "Success")],
    }),
    tbl(fqn, "revenue_daily", asOf, {
      desc: "Daily revenue rollup.",
      owner: "Mike Kumar",
      freshHoursAgo: 3,
      rows: 730,
      tests: [test("not_null_date", "Success")],
    }),
  ];
  const lineage = [
    { fromTable: `${fqn}.customers`, toTable: `${fqn}.orders` },
    { fromTable: `${fqn}.orders`, toTable: `${fqn}.order_items` },
    { fromTable: `${fqn}.products`, toTable: `${fqn}.order_items` },
    { fromTable: `${fqn}.orders`, toTable: `${fqn}.payments` },
    { fromTable: `${fqn}.orders`, toTable: `${fqn}.revenue_daily` },
    { fromTable: `${fqn}.payments`, toTable: `${fqn}.revenue_daily` },
  ];
  return { fqn, name: "E-commerce Analytics", tables, lineage };
}

// ── jupiter.swap_metrics — healthy and stable ────────────────────────────────

function jupiterMeta(asOf: number): SchemaMeta {
  const fqn = "jupiter.swap_metrics";
  const tables: TableMeta[] = [
    tbl(fqn, "swap_volume_daily", asOf, { desc: "Daily aggregated swap volume.", owner: "jupiter-data", freshHoursAgo: 1, rows: 1095, tests: [test("not_null_day", "Success"), test("volume_positive", "Success")] }),
    tbl(fqn, "route_performance", asOf, { desc: "Fill quality per routing path.", owner: "jupiter-data", freshHoursAgo: 2, rows: 8600, tests: [test("not_null_route_id", "Success"), test("slippage_within_bounds", "Success")] }),
    tbl(fqn, "token_pair_liquidity", asOf, { desc: "Liquidity depth per token pair.", owner: "jupiter-data", freshHoursAgo: 1, rows: 4200, tests: [test("not_null_pair", "Success"), test("liquidity_positive", "Success")] }),
    tbl(fqn, "aggregator_fees", asOf, { desc: "Platform fees collected per day.", owner: "jupiter-data", freshHoursAgo: 3, rows: 1095, tests: [test("not_null_day", "Success"), test("fees_positive", "Success")] }),
    tbl(fqn, "dca_orders", asOf, { owner: "jupiter-data", freshHoursAgo: 2, rows: 12_400, tests: [test("not_null_order_id", "Success")] }),
  ];
  const lineage = [
    { fromTable: `${fqn}.route_performance`, toTable: `${fqn}.swap_volume_daily` },
    { fromTable: `${fqn}.swap_volume_daily`, toTable: `${fqn}.aggregator_fees` },
  ];
  return { fqn, name: "Jupiter Swap Metrics", tables, lineage };
}

// ── marinade.staking — mild decline ──────────────────────────────────────────

function marinadeMeta(asOf: number, failing: Set<string>): SchemaMeta {
  const fqn = "marinade.staking";
  const tables: TableMeta[] = [
    tbl(fqn, "stake_accounts", asOf, { desc: "Active stake accounts and balances.", owner: "marinade-core", freshHoursAgo: 2, rows: 96_000, tests: [test("not_null_account", "Success"), test("balance_positive", "Success")] }),
    tbl(fqn, "msol_price_feed", asOf, {
      desc: "mSOL/SOL exchange rate history.",
      owner: "marinade-core",
      freshHoursAgo: failing.has("msol_price_feed") ? 60 : 1,
      rows: 26_000,
      tests: [test("not_null_price", "Success"), test("price_freshness_check", failing.has("msol_price_feed") ? "Failed" : "Success")],
    }),
    tbl(fqn, "validator_set", asOf, {
      // intentionally undocumented
      owner: "marinade-core",
      freshHoursAgo: 4,
      rows: 450,
      tests: [test("not_null_vote_account", "Success")],
    }),
    tbl(fqn, "unstake_queue", asOf, {
      desc: "Pending delayed-unstake tickets.",
      owner: "marinade-core",
      freshHoursAgo: 3,
      rows: 1800,
      tests: [test("not_null_ticket", "Success"), test("ticket_amount_positive", failing.has("unstake_queue") ? "Failed" : "Success")],
    }),
    tbl(fqn, "epoch_rewards", asOf, {
      // intentionally ownerless and untested
      desc: "Rewards distributed per epoch.",
      freshHoursAgo: 6,
      rows: 620,
      tests: [],
    }),
  ];
  const lineage = [
    { fromTable: `${fqn}.stake_accounts`, toTable: `${fqn}.epoch_rewards` },
    { fromTable: `${fqn}.msol_price_feed`, toTable: `${fqn}.unstake_queue` },
    { fromTable: `${fqn}.validator_set`, toTable: `${fqn}.epoch_rewards` },
  ];
  return { fqn, name: "Marinade Staking", tables, lineage };
}

// ── raydium.amm — healthy, slight wobble ─────────────────────────────────────

function raydiumMeta(asOf: number, failing: Set<string>): SchemaMeta {
  const fqn = "raydium.amm";
  const tables: TableMeta[] = [
    tbl(fqn, "pool_reserves", asOf, { desc: "Liquidity reserves per AMM pool.", owner: "raydium-team", freshHoursAgo: 1, rows: 12_000, tests: [test("not_null_pool", "Success"), test("reserve_positive", "Success")] }),
    tbl(fqn, "swap_events", asOf, { desc: "Every swap routed through Raydium AMM.", owner: "raydium-team", freshHoursAgo: 1, rows: 240_000, tests: [test("not_null_tx", "Success"), test("amount_positive", "Success")] }),
    tbl(fqn, "farm_rewards", asOf, { desc: "Yield farming reward distributions.", owner: "raydium-team", freshHoursAgo: 3, rows: 8_900, tests: [test("not_null_farm", "Success"), test("reward_positive", failing.has("farm_rewards") ? "Failed" : "Success")] }),
    tbl(fqn, "concentrated_liquidity", asOf, { owner: "raydium-team", freshHoursAgo: 2, rows: 5_400, tests: [test("not_null_position", "Success")] }),
    tbl(fqn, "fee_tiers", asOf, { desc: "Fee configuration per pool tier.", owner: "raydium-team", freshHoursAgo: 48, rows: 120, tests: [] }),
  ];
  const lineage = [
    { fromTable: `${fqn}.pool_reserves`, toTable: `${fqn}.swap_events` },
    { fromTable: `${fqn}.swap_events`, toTable: `${fqn}.farm_rewards` },
  ];
  return { fqn, name: "Raydium AMM", tables, lineage };
}

// ── orca.whirlpools — recently degraded ──────────────────────────────────────

function orcaMeta(asOf: number, failing: Set<string>): SchemaMeta {
  const fqn = "orca.whirlpools";
  const tables: TableMeta[] = [
    tbl(fqn, "whirlpool_positions", asOf, { desc: "Concentrated liquidity positions.", owner: "orca-team", freshHoursAgo: 2, rows: 18_000, tests: [test("not_null_position", "Success"), test("liquidity_positive", "Success")] }),
    tbl(fqn, "tick_data", asOf, { desc: "Tick-level liquidity and price data.", owner: "orca-team", freshHoursAgo: 1, rows: 92_000, tests: [test("not_null_tick", "Success"), test("price_within_bounds", failing.has("tick_data") ? "Failed" : "Success")] }),
    tbl(fqn, "collect_fees", asOf, { owner: "orca-team", freshHoursAgo: 4, rows: 31_000, tests: [test("not_null_position", "Success")] }),
    tbl(fqn, "swap_quotes", asOf, { desc: "Simulated swap quotes for routing.", owner: "orca-team", freshHoursAgo: failing.has("swap_quotes") ? 72 : 2, rows: 15_000, tests: [test("not_null_quote", "Success"), test("quote_freshness", failing.has("swap_quotes") ? "Failed" : "Success")] }),
    tbl(fqn, "pool_config", asOf, { desc: "Whirlpool initialization parameters.", owner: "orca-team", freshHoursAgo: 12, rows: 340, tests: [test("not_null_pool", "Success")] }),
  ];
  const lineage = [
    { fromTable: `${fqn}.whirlpool_positions`, toTable: `${fqn}.collect_fees` },
    { fromTable: `${fqn}.tick_data`, toTable: `${fqn}.swap_quotes` },
  ];
  return { fqn, name: "Orca Whirlpools", tables, lineage };
}

// ── Seeding ──────────────────────────────────────────────────────────────────

function seedSnapshots(now: number): void {
  // 1. dune.uniswap — 6 snapshots over ~21 days, health arc 84→86→84→81→79→73,
  //    with an ~11-point decline in the last week (84 at the 7-day mark → 73).
  //    Last week: Whale Movements degrades, Gas Cost Analysis starts failing
  //    and goes stale, New Pool Deployments loses its tests (coverage drop).
  const duneArc: Array<{ days: number; score: number; state: DuneState; episodeId?: string }> = [
    { days: 21, score: 84, state: { whaleFailing: 0, gasFailing: false, gasStaleHours: 3, newPoolTested: true, lpTested: false } },
    { days: 17, score: 86, state: { whaleFailing: 0, gasFailing: false, gasStaleHours: 2, newPoolTested: true, lpTested: true } },
    { days: 7, score: 84, state: { whaleFailing: 0, gasFailing: false, gasStaleHours: 3, newPoolTested: true, lpTested: false } },
    { days: 5, score: 81, state: { whaleFailing: 1, gasFailing: false, gasStaleHours: 4, newPoolTested: true, lpTested: false } },
    { days: 2, score: 79, state: { whaleFailing: 1, gasFailing: false, gasStaleHours: 30, newPoolTested: true, lpTested: false } },
    { days: 0, score: 73, state: { whaleFailing: 2, gasFailing: true, gasStaleHours: 96, newPoolTested: false, lpTested: false }, episodeId: "demo" },
  ];
  for (const s of duneArc) {
    const asOf = now - s.days * DAY;
    saveSnapshot(buildSnapshot("dune.uniswap", "Uniswap Analytics", duneMeta(asOf, s.state), s.score, s.days, now, s.episodeId));
  }

  // 2. analytics.ecommerce — 5 snapshots, gentle improvement 71→74→76→78→82.
  const ecomArc: Array<{ days: number; score: number; failing: string[]; episodeId?: string }> = [
    { days: 28, score: 71, failing: ["orders", "order_items", "payments"] },
    { days: 21, score: 74, failing: ["order_items", "payments"] },
    { days: 14, score: 76, failing: ["order_items", "payments"] },
    { days: 7, score: 78, failing: ["order_items", "payments"] },
    { days: 0, score: 82, failing: ["payments"], episodeId: "demo-enterprise" },
  ];
  for (const s of ecomArc) {
    const asOf = now - s.days * DAY;
    saveSnapshot(buildSnapshot("analytics.ecommerce", "E-commerce Analytics", ecommerceMeta(asOf, new Set(s.failing)), s.score, s.days, now, s.episodeId));
  }

  // 3. jupiter.swap_metrics — 4 snapshots, healthy and stable 89→91→90→92.
  const jupiterArc = [
    { days: 21, score: 89 },
    { days: 14, score: 91 },
    { days: 7, score: 90 },
    { days: 0, score: 92 },
  ];
  for (const s of jupiterArc) {
    const asOf = now - s.days * DAY;
    saveSnapshot(buildSnapshot("jupiter.swap_metrics", "Jupiter Swap Metrics", jupiterMeta(asOf), s.score, s.days, now));
  }

  // 4. marinade.staking — 4 snapshots, mild decline 78→77→74→71.
  const marinadeArc: Array<{ days: number; score: number; failing: string[] }> = [
    { days: 21, score: 78, failing: [] },
    { days: 14, score: 77, failing: ["msol_price_feed"] },
    { days: 7, score: 74, failing: ["msol_price_feed"] },
    { days: 0, score: 71, failing: ["msol_price_feed", "unstake_queue"] },
  ];
  for (const s of marinadeArc) {
    const asOf = now - s.days * DAY;
    saveSnapshot(buildSnapshot("marinade.staking", "Marinade Staking", marinadeMeta(asOf, new Set(s.failing)), s.score, s.days, now));
  }

  // 5. raydium.amm — 4 snapshots, healthy with a slight wobble 85→87→84→88.
  const raydiumArc: Array<{ days: number; score: number; failing: string[] }> = [
    { days: 21, score: 85, failing: [] },
    { days: 14, score: 87, failing: [] },
    { days: 7, score: 84, failing: ["farm_rewards"] },
    { days: 0, score: 88, failing: [] },
  ];
  for (const s of raydiumArc) {
    const asOf = now - s.days * DAY;
    saveSnapshot(buildSnapshot("raydium.amm", "Raydium AMM", raydiumMeta(asOf, new Set(s.failing)), s.score, s.days, now));
  }

  // 6. orca.whirlpools — 4 snapshots, recent degradation 83→82→75→68.
  const orcaArc: Array<{ days: number; score: number; failing: string[] }> = [
    { days: 21, score: 83, failing: [] },
    { days: 14, score: 82, failing: ["tick_data"] },
    { days: 7, score: 75, failing: ["tick_data", "swap_quotes"] },
    { days: 0, score: 68, failing: ["tick_data", "swap_quotes"] },
  ];
  for (const s of orcaArc) {
    const asOf = now - s.days * DAY;
    saveSnapshot(buildSnapshot("orca.whirlpools", "Orca Whirlpools", orcaMeta(asOf, new Set(s.failing)), s.score, s.days, now));
  }
}

async function readDemoEpisode(file: string, audioUrl: string): Promise<Episode> {
  const raw = await fs.readFile(path.join(process.cwd(), "public", file), "utf-8");
  const episode = JSON.parse(raw) as Episode;
  episode.audioUrl = audioUrl;
  return episode;
}

export async function POST() {
  try {
    // Share entries expire after 24h in normal use — always re-write them so
    // repeated demos never hit an expired episode.
    const [dune, enterprise] = await Promise.all([
      readDemoEpisode("sample-episode-dune.json", "/demo-episode-dune.mp3"),
      readDemoEpisode("sample-episode.json", "/demo-episode.mp3"),
    ]);
    shares.set("demo", dune, SHARE_TTL);
    shares.set("demo-enterprise", enterprise, SHARE_TTL);

    // Snapshot history is append-only — seed it once (or again if the flag
    // has expired / been lost), never on every call.
    if (!store.get(SEED_FLAG)) {
      seedSnapshots(Date.now());
      store.set(SEED_FLAG, { seededAt: new Date().toISOString() }, SEED_FLAG_TTL);
    }

    return NextResponse.json({ ok: true, episodeId: "demo" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
