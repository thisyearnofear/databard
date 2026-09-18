/**
 * Attention market: pure stats layer — attention-price index, outlier handling,
 * month phases, calendar spine, receipt integrity.
 * Run with: npx tsx tests/attention-market.unit.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeAttentionEdition, OUTLIER_USD } from "../src/lib/attention-market";
import type { EarnListing } from "../src/lib/superteam-earn";
import { hashEvidence, verifyEvidenceReceipt } from "../src/lib/evidence-receipt";

function listing(overrides: Partial<EarnListing> = {}): EarnListing {
  return {
    id: Math.random().toString(36).slice(2),
    title: "A bounty",
    slug: "a-bounty",
    rewardAmount: 200,
    token: "USDC",
    deadline: "2026-01-15T00:00:00Z",
    type: "bounty",
    status: "OPEN",
    isFeatured: false,
    agentAccess: "HUMAN_ONLY",
    _count: { Submission: 10 },
    sponsor: { name: "A sponsor" },
    ...overrides,
  };
}

/** A complete year behind us, so every constructed month counts toward the trend. */
const AFTER = new Date("2027-01-15T00:00:00Z");

describe("stablecoin honesty", () => {
  it("counts token-denominated campaigns as listings but never as dollars", () => {
    const e = computeAttentionEdition([
      listing({ token: "USDC", rewardAmount: 1_000 }),
      listing({ token: "BONK", rewardAmount: 33_000_000 }),
      listing({ token: "SOL", rewardAmount: 5_000 }),
    ]);
    assert.equal(e.totals.stableListings, 1);
    assert.equal(e.totals.tokenListings, 2);
    assert.equal(e.totals.usdRewards, 1_000);
    assert.match(e.story.join(" "), /pay in their own token/);
  });
});

describe("outlier handling", () => {
  // Early half is a steady $20/submission; the late half holds that line while a
  // single $1M campaign lands on top of it.
  const withMega = () =>
    computeAttentionEdition(
      [
        listing({ deadline: "2026-01-10T00:00:00Z", rewardAmount: 200, _count: { Submission: 10 } }),
        listing({ deadline: "2026-02-10T00:00:00Z", rewardAmount: 200, _count: { Submission: 10 } }),
        listing({ deadline: "2026-03-10T00:00:00Z", rewardAmount: 210, _count: { Submission: 10 } }),
        listing({ deadline: "2026-04-10T00:00:00Z", rewardAmount: 210, _count: { Submission: 10 } }),
        listing({
          title: "Mega hackathon",
          sponsor: { name: "Mega" },
          deadline: "2026-03-20T00:00:00Z",
          rewardAmount: 1_000_000,
          _count: { Submission: 10_000 },
        }),
      ],
      AFTER,
    );

  it("reports a mega-campaign by name and keeps it out of the price trend", () => {
    const e = withMega();
    assert.equal(e.outliers.length, 1);
    assert.equal(e.outliers[0].sponsor, "Mega");
    assert.equal(e.outliers[0].rewardAmount, 1_000_000);
    // Included in the headline volume, excluded from the core figure.
    assert.equal(e.totals.usdRewards, 1_000_820);
    assert.equal(e.totals.usdRewardsCore, 820);
    // $21/submission late vs $20 early — flat. Without exclusion this would be ~5x.
    assert.equal(e.priceTrend.direction, "flat");
    assert.ok(
      Math.abs(e.priceTrend.lateUsdPerSubmission - 21) < 0.001,
      `got ${e.priceTrend.lateUsdPerSubmission}`,
    );
    assert.match(e.story.join(" "), /Mega/);
    assert.match(e.story.join(" "), /excluded from the per-submission figures/);
  });

  it("keeps outliers out of the structural sponsor league", () => {
    const e = withMega();
    assert.ok(!e.topSponsors.some((s) => s.name === "Mega"), "one-off hackathon is not a structural buyer");
    assert.ok(e.topSponsors.some((s) => s.name === "A sponsor"));
  });

  it("honours the OUTLIER_USD boundary", () => {
    const atBoundary = computeAttentionEdition([listing({ rewardAmount: OUTLIER_USD })], AFTER);
    const belowBoundary = computeAttentionEdition([listing({ rewardAmount: OUTLIER_USD - 1 })], AFTER);
    assert.equal(atBoundary.outliers.length, 1);
    assert.equal(belowBoundary.outliers.length, 0);
  });
});
describe("month phases and calendar spine", () => {
  const NOW = new Date("2026-09-15T00:00:00Z");

  it("labels complete, current and scheduled deadline months", () => {
    const e = computeAttentionEdition(
      [
        listing({ deadline: "2026-08-10T00:00:00Z" }),
        listing({ deadline: "2026-09-20T00:00:00Z" }),
        listing({ deadline: "2026-10-05T00:00:00Z" }),
      ],
      NOW,
    );
    const phase = Object.fromEntries(e.months.map((m) => [m.month, m.phase]));
    assert.equal(phase["2026-08"], "complete");
    assert.equal(phase["2026-09"], "current");
    assert.equal(phase["2026-10"], "scheduled");
    // Only complete months inform the trend.
    assert.equal(e.window.completeMonths, 1);
  });

  it("fills gaps so the series is continuous", () => {
    const e = computeAttentionEdition(
      [listing({ deadline: "2026-01-10T00:00:00Z" }), listing({ deadline: "2026-04-10T00:00:00Z" })],
      NOW,
    );
    assert.deepEqual(
      e.months.map((m) => m.month),
      ["2026-01", "2026-02", "2026-03", "2026-04"],
    );
    assert.equal(e.months[1].listings, 0);
    assert.equal(e.months[1].usdPerSubmission, null);
    assert.equal(e.months[2].usdRewards, 0);
  });

  it("ignores listings with no deadline for the timeline but still counts them", () => {
    const e = computeAttentionEdition([listing({ deadline: null })], NOW);
    assert.equal(e.totals.stableListings, 1);
    assert.equal(e.months.length, 0);
  });
});

describe("price trend honesty", () => {
  function twoHalves(earlyReward: number, lateReward: number) {
    return computeAttentionEdition(
      [
        listing({ deadline: "2026-01-10T00:00:00Z", rewardAmount: earlyReward, _count: { Submission: 10 } }),
        listing({ deadline: "2026-02-10T00:00:00Z", rewardAmount: earlyReward, _count: { Submission: 10 } }),
        listing({ deadline: "2026-03-10T00:00:00Z", rewardAmount: lateReward, _count: { Submission: 10 } }),
        listing({ deadline: "2026-04-10T00:00:00Z", rewardAmount: lateReward, _count: { Submission: 10 } }),
      ],
      AFTER,
    );
  }

  it("calls a small move flat rather than dressing it up as a trend", () => {
    const e = twoHalves(200, 210); // 5% — inside the ±15% band
    assert.equal(e.priceTrend.direction, "flat");
    assert.match(e.headline.claim, /didn't move/);
  });

  it("reports down and up moves with the computed direction", () => {
    const down = twoHalves(400, 200);
    assert.equal(down.priceTrend.direction, "down");
    assert.match(down.headline.claim, /fell to/);

    const up = twoHalves(100, 400);
    assert.equal(up.priceTrend.direction, "up");
    assert.match(up.headline.claim, /rose to/);
  });

  it("states growth as a multiple of the early window", () => {
    const e = twoHalves(100, 400);
    assert.match(e.headline.claim, /grew 4\.0×/);
    assert.match(e.headline.line, /per submission in/);
  });

  it("does not claim a trend multiple from a single month", () => {
    const e = computeAttentionEdition([listing({ deadline: "2026-01-10T00:00:00Z" })], AFTER);
    assert.equal(e.window.completeMonths, 1);
    assert.ok(!/grew/.test(e.headline.claim), `claim should not state growth: ${e.headline.claim}`);
  });
});

describe("degenerate input", () => {
  it("handles empty input without NaN or Infinity", () => {
    const e = computeAttentionEdition([], AFTER);
    assert.equal(e.totals.listings, 0);
    assert.equal(e.totals.usdRewardsCore, 0);
    assert.equal(e.outliers.length, 0);
    assert.equal(e.months.length, 0);
    assert.equal(e.priceTrend.earlyUsdPerSubmission, 0);
    assert.ok(Number.isFinite(e.priceTrend.ratio));
    assert.ok(Number.isFinite(e.totals.usdRewards));
    assert.ok(!/NaN|Infinity/.test(`${e.headline.claim} ${e.headline.line} ${e.story.join(" ")}`));
  });

  it("treats a zero-submission month as an unknown price, not a divide-by-zero", () => {
    const e = computeAttentionEdition(
      [listing({ deadline: "2026-01-10T00:00:00Z", _count: { Submission: 0 } })],
      AFTER,
    );
    assert.equal(e.months[0].usdPerSubmission, null);
    assert.equal(e.totals.usdPerSubmissionCore, null);
    assert.ok(!/NaN|Infinity/.test(e.headline.line));
  });
});

describe("evidence receipt", () => {
  it("emits a self-verifying receipt that names the report and its version", () => {
    const listings = [listing(), listing({ token: "BONK" })];
    const e = computeAttentionEdition(listings, AFTER);
    assert.equal(e.receipt.format, "databard.evidence-receipt");
    assert.ok(verifyEvidenceReceipt(e.receipt));

    const analysis = e.receipt.payload.analysis as Record<string, unknown>;
    assert.equal(analysis.report, "attention-market");
    assert.equal(analysis.reportVersion, 1);

    const evidence = e.receipt.payload.evidence as Record<string, unknown>;
    assert.equal(evidence.listingsHash, hashEvidence(JSON.parse(JSON.stringify(listings))));
    assert.equal(evidence.listings, 2);
  });

  it("fails verification when a hashed number is altered", () => {
    const e = computeAttentionEdition([listing()], AFTER);
    const tampered = JSON.parse(JSON.stringify(e.receipt)) as typeof e.receipt;
    (tampered.payload as Record<string, unknown>).resultHash = "0".repeat(64);
    assert.equal(verifyEvidenceReceipt(tampered), false);
  });

  it("records snapshot delivery and observation time separately from composition", () => {
    const e = computeAttentionEdition([listing()], AFTER, {
      source: "snapshot",
      observedAt: "2026-09-01T00:00:00Z",
      requestedAt: "2026-09-17T12:00:00Z",
    });
    assert.equal(e.source, "snapshot");
    assert.equal(e.observedAt, "2026-09-01T00:00:00Z");
    assert.equal(e.generatedAt, "2026-09-17T12:00:00Z");
    const evidence = e.receipt.payload.evidence as Record<string, unknown>;
    assert.equal(evidence.delivery, "snapshot");
    assert.ok(verifyEvidenceReceipt(e.receipt));
  });
});
