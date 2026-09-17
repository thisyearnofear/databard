/**
 * Story composers: deterministic L0/L1 sentences from existing analysis data.
 * Run with: npx tsx tests/story.unit.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findingSentence, consequenceSentence, calmConfirmation, chartCaption, bottomLine } from "../src/lib/story";
import type { InsightSummary } from "../src/app/api/insights/route";
import type { TrendNarrative } from "../src/app/api/insights/trends/route";
import type { SourceCard } from "../src/components/briefing/types";
import type { Episode } from "../src/lib/types";

const insight: InsightSummary = {
  schemaFqn: "db.sales", schemaName: "sales", recordedAt: "2026-09-17T00:00:00Z",
  healthScore: 58, healthLabel: "at-risk", testCoverage: 40, docCoverage: 60,
  failingTests: 3, untestedCount: 2, ownerlessCount: 1, staleCount: 0,
  undocumentedCount: 0, tableCount: 10,
  criticalTables: [{ name: "payments", failingTests: 3, downstreamCount: 8, risk: "critical" }],
  lineageHotspots: [], healthHistory: [70, 58],
};

function card(overrides: Partial<SourceCard> = {}): SourceCard {
  return {
    name: "sales", displayName: "sales", source: "unknown", latestHealth: 58,
    trend: "down", mintCount: 0, wallets: 0, lastActivity: "", recentMints: [],
    healthHistory: [70, 58], insight, ...overrides,
  };
}

const trend: TrendNarrative = {
  schemaFqn: "db.sales", schemaName: "sales", healthScore: 58, healthScoreChange: -12,
  diff: { newTables: [], removedTables: [], newFailures: ["payments", "orders"], resolvedFailures: [], healthScoreChange: -12, testCoverageChange: 0, summary: "" },
  narrative: "Health dropped 12 points.", hasHistory: true,
};

const episode: Episode = {
  schemaFqn: "db.sales", schemaName: "sales", tableCount: 10,
  qualitySummary: { passed: 7, failed: 3, total: 10 }, healthScore: 58,
  script: [{ speaker: "Morgan", topic: "health", text: "Three tests failing." }],
};

describe("story composers", () => {
  it("findingSentence leads with the most severe cost", () => {
    assert.match(findingSentence(insight) ?? "", /3 tests failing silently, cascading to 8 downstream tables/);
    assert.equal(findingSentence(undefined), null);
  });

  it("findingSentence falls back to ownerless, then null when healthy", () => {
    const ownerless = { ...insight, failingTests: 0, untestedCount: 0, ownerlessCount: 2, criticalTables: [] };
    assert.match(findingSentence(ownerless) ?? "", /2 tables with no owner/);
    assert.equal(findingSentence({ ...ownerless, ownerlessCount: 0 }), null);
  });

  it("consequenceSentence explains new failures, drops, recoveries, first snapshots", () => {
    assert.match(consequenceSentence(trend) ?? "", /2 new test failures.*check the latest deploy/);
    assert.match(consequenceSentence({ ...trend, diff: { ...trend.diff!, newFailures: [] } }) ?? "", /significant drop/);
    assert.match(consequenceSentence({ ...trend, diff: null, hasHistory: false }) ?? "", /First snapshot/);
    assert.equal(consequenceSentence({ ...trend, diff: null, hasHistory: true }), null);
    assert.equal(consequenceSentence({ ...trend, healthScoreChange: 0, diff: { ...trend.diff!, newFailures: [], resolvedFailures: [], removedTables: [] } }), null);
  });

  it("calmConfirmation only fires when nothing needs attention", () => {
    assert.equal(calmConfirmation([card()], 58), null);
    const healthy = { ...insight, failingTests: 0, staleCount: 0, untestedCount: 0, ownerlessCount: 0, criticalTables: [] };
    assert.match(calmConfirmation([card({ insight: healthy })], 92) ?? "", /No material issues\. Estate health 92% across 1 source/);
    assert.equal(calmConfirmation([], 92), null);
  });

  it("chartCaption names the largest mover or stays quiet", () => {
    assert.match(chartCaption([card()]), /Largest move: sales down 12 points/);
    assert.match(chartCaption([card({ displayName: "x", healthHistory: [80, 80] })]), /quiet week/);
    assert.match(chartCaption([card({ healthHistory: [80] })]), /Not enough history/);
  });

  it("bottomLine prioritises failing tests, confirms health, else null", () => {
    assert.match(bottomLine(episode) ?? "", /3 failing tests in sales/);
    assert.match(bottomLine({ ...episode, qualitySummary: { passed: 10, failed: 0, total: 10 }, healthScore: 92 }) ?? "", /healthy at 92%/);
    assert.equal(bottomLine({ ...episode, qualitySummary: { passed: 10, failed: 0, total: 10 }, healthScore: 58 }), null);
  });
});
