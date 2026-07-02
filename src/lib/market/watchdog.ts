/**
 * Watchdog — the reference machine buyer.
 *
 * Every time a Pro user's schedule ticks, Watchdog:
 *   1. Analyzes current catalog (existing schema-analysis)
 *   2. Loads previous SchemaSnapshot (existing schema-snapshots)
 *   3. Computes a delta score against previous insights
 *   4. If delta ≥ threshold: posts a WANT to the market on the user's behalf
 *   5. Else: no-op (silence is expected)
 *   6. Always saves a fresh snapshot for the next tick to diff against
 *
 * Reuses existing infrastructure — this is ~150 lines of glue, not a new service.
 */
import type { Bid, SchemaMeta, ResearchFocus, Want } from "../types";
import type { SchemaInsights } from "../schema-analysis";
import { analyzeSchema } from "../schema-analysis";
import { getLatestSnapshot, saveSnapshot, type SchemaSnapshot } from "../schema-snapshots";
import { createWant } from "./protocol";
import { autoBidInternal } from "./sellers";

/**
 * Delta threshold (0..1) above which Watchdog posts a WANT. 0.2 catches new failing tests,
 * new lineage edges, freshness regressions, and PII drift. Tune per-user later.
 */
export const DEFAULT_DELTA_THRESHOLD = 0.2;

export interface WatchdogTickInput {
  schema: SchemaMeta;
  buyerWalletAddress: string;
  /** Per-brief budget cap in lamports. Fixed cap for the demo. */
  budgetLamports: number;
  /** Time sellers have to bid + deliver (default 300s). */
  deadlineSec?: number;
  /** Override the threshold (0..1). */
  deltaThreshold?: number;
}

export interface WatchdogTickResult {
  posted: boolean;
  reason: string;
  deltaScore: number;
  want?: Want;
  bids?: Bid[];
}

/**
 * Compute a delta score in 0..1 by comparing SchemaInsights.
 * Weights:
 *  - New failing tests: 0.5 (fresh failure is the most brief-worthy signal)
 *  - PII column drift: 0.2 (governance flag)
 *  - New/removed lineage hotspots: 0.15
 *  - Freshness regression (new stale tables): 0.15
 */
export function computeDelta(current: SchemaInsights, previous: SchemaInsights | null): {
  score: number;
  hints: { table: string; reason: string }[];
  focus: ResearchFocus;
} {
  if (!previous) {
    return {
      score: 1,
      hints: current.criticalTables.slice(0, 5).map((c) => ({
        table: c.table.name,
        reason: c.failingTests > 0 ? `${c.failingTests} failing tests` : "no snapshot to diff",
      })),
      focus: "overview",
    };
  }

  const hints: { table: string; reason: string }[] = [];

  // Per-critical-table failure delta
  const prevFailing = new Map(previous.criticalTables.map((c) => [c.table.fqn, c.failingTests]));
  let failingDelta = 0;
  for (const c of current.criticalTables) {
    const prev = prevFailing.get(c.table.fqn) ?? 0;
    if (c.failingTests > prev) {
      failingDelta += c.failingTests - prev;
      hints.push({
        table: c.table.name,
        reason: `${c.failingTests - prev} new failing test${c.failingTests - prev === 1 ? "" : "s"}`,
      });
    }
  }
  // Also count aggregate failing test delta as a floor — catches new failures on
  // previously-non-critical tables.
  const aggregateFailingDelta = Math.max(0, current.failingTests - previous.failingTests);
  failingDelta = Math.max(failingDelta, aggregateFailingDelta);

  // PII drift — new PII tables
  const prevPiiTables = new Set(previous.piiTables.map((p) => p.name));
  let piiDelta = 0;
  for (const p of current.piiTables) {
    if (!prevPiiTables.has(p.name)) {
      piiDelta += 1;
      hints.push({ table: p.name, reason: `new PII columns: ${p.columns.slice(0, 3).join(", ")}` });
    }
  }

  // Freshness regression — new stale tables
  const prevStale = new Set(previous.staleTables.map((s) => s.name));
  let freshnessDelta = 0;
  for (const s of current.staleTables) {
    if (!prevStale.has(s.name)) {
      freshnessDelta += 1;
      hints.push({ table: s.name, reason: `now stale (${Math.round(s.hoursAgo)}h)` });
    }
  }

  // Lineage hotspots — changes in the top-5 by name
  const prevHotspots = new Set(previous.lineageHotspots.map((h) => h.name));
  const currHotspots = new Set(current.lineageHotspots.map((h) => h.name));
  let lineageDelta = 0;
  for (const n of currHotspots) if (!prevHotspots.has(n)) lineageDelta++;
  for (const n of prevHotspots) if (!currHotspots.has(n)) lineageDelta++;

  // Normalize each component and blend.
  const nFailing = Math.min(1, failingDelta / 5);
  const nPii = Math.min(1, piiDelta / 3);
  const nFresh = Math.min(1, freshnessDelta / 5);
  const nLineage = Math.min(1, lineageDelta / 4);

  const score = 0.5 * nFailing + 0.2 * nPii + 0.15 * nFresh + 0.15 * nLineage;

  const contributions: Array<[ResearchFocus, number]> = [
    ["quality", 0.5 * nFailing],
    ["governance", 0.2 * nPii],
    ["freshness", 0.15 * nFresh],
    ["lineage", 0.15 * nLineage],
  ];
  contributions.sort((a, b) => b[1] - a[1]);
  const focus = contributions[0][1] > 0 ? contributions[0][0] : "overview";

  return { score, hints: hints.slice(0, 10), focus };
}

/**
 * Watchdog tick. Synchronous — schema-analysis + schema-snapshots are both sync-store-backed.
 */
export function tick(input: WatchdogTickInput): WatchdogTickResult {
  const threshold = input.deltaThreshold ?? DEFAULT_DELTA_THRESHOLD;
  const insights = analyzeSchema(input.schema);
  const previousSnapshot = getLatestSnapshot(input.schema.fqn);
  const { score, hints, focus } = computeDelta(insights, previousSnapshot?.insights ?? null);

  // Always record the fresh snapshot so future ticks can diff.
  const snapshot: SchemaSnapshot = {
    schemaFqn: input.schema.fqn,
    schemaName: input.schema.name,
    tableNames: input.schema.tables.map((t) => t.name),
    insights,
    recordedAt: new Date().toISOString(),
  };
  saveSnapshot(snapshot);

  if (score < threshold) {
    return {
      posted: false,
      reason: `delta ${score.toFixed(2)} below threshold ${threshold.toFixed(2)}`,
      deltaScore: score,
    };
  }

  const want = createWant({
    buyer: {
      kind: "agent",
      publicKey: input.buyerWalletAddress,
      label: "Watchdog",
    },
    schemaFqn: input.schema.fqn,
    focus,
    budgetLamports: input.budgetLamports,
    deadlineSec: input.deadlineSec ?? 300,
    evidenceHints: hints,
  });
  // Auto-bid immediately so the dashboard can walk award/deliver/release without a race.
  const bids = autoBidInternal(want);

  return {
    posted: true,
    reason: `delta ${score.toFixed(2)} triggered ${focus} WANT with ${hints.length} hints; ${bids.length} bids received`,
    deltaScore: score,
    want,
    bids,
  };
}
