/**
 * Superteam Earn edition: pure stats layer — chapter aggregates, UK spotlight,
 * stable-token honesty, live-deadline logic.
 * Run with: npx tsx tests/superteam-earn.unit.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeEarnEdition, isStableToken, type EarnListing } from "../src/lib/superteam-earn";
import { hashEvidence, verifyEvidenceReceipt } from "../src/lib/evidence-receipt";

const NOW = new Date("2026-09-17T12:00:00Z");

function listing(overrides: Partial<EarnListing> = {}): EarnListing {
  return {
    id: Math.random().toString(36).slice(2),
    title: "A bounty",
    slug: "a-bounty",
    rewardAmount: 100,
    token: "USDC",
    deadline: "2026-10-01T00:00:00Z",
    type: "bounty",
    status: "OPEN",
    isFeatured: false,
    agentAccess: "HUMAN_ONLY",
    _count: { Submission: 10 },
    sponsor: { name: "Superteam UK" },
    ...overrides,
  };
}

describe("isStableToken", () => {
  it("accepts USD stables, rejects volatile/empty", () => {
    assert.equal(isStableToken("USDC"), true);
    assert.equal(isStableToken("usdg"), true);
    assert.equal(isStableToken("USDT"), true);
    assert.equal(isStableToken("BONK"), false);
    assert.equal(isStableToken("SOL"), false);
    assert.equal(isStableToken(null), false);
    assert.equal(isStableToken(undefined), false);
  });
});

describe("computeEarnEdition", () => {
  it("counts only USD-stable amounts in usdRewards", () => {
    const e = computeEarnEdition([
      listing({ rewardAmount: 500, token: "USDC" }),
      listing({ rewardAmount: 33_000_000, token: "BONK" }),
    ]);
    assert.equal(e.uk.usdRewards, 500);
    assert.equal(e.uk.listings, 2);
    assert.equal(e.totals.stableListings, 1);
  });

  it("does not match Superteam Ukraine or BukProtocol as UK", () => {
    const e = computeEarnEdition([
      listing({ sponsor: { name: "Superteam UK" } }),
      listing({ sponsor: { name: "Superteam Ukraine" } }),
      listing({ sponsor: { name: "BukProtocol" } }),
    ]);
    assert.equal(e.uk.listings, 1);
    const names = e.chapters.map((c) => c.name);
    assert.ok(names.includes("Superteam UK"));
    assert.ok(names.includes("Superteam Ukraine"));
    assert.ok(!names.includes("BukProtocol"));
  });

  it("ranks chapters by USD rewards, UK ranked by listings across all sponsors", () => {
    const e = computeEarnEdition([
      listing({ sponsor: { name: "Superteam UK" }, rewardAmount: 100 }),
      listing({ sponsor: { name: "Superteam UK" }, rewardAmount: 100 }),
      listing({ sponsor: { name: "Superteam Nigeria" }, rewardAmount: 5000 }),
      listing({ sponsor: { name: "Jupiter" }, rewardAmount: 999 }),
    ]);
    assert.equal(e.chapters[0].name, "Superteam Nigeria");
    assert.equal(e.chapters[1].name, "Superteam UK");
    // UK has 2 listings vs Nigeria's 1 vs Jupiter's 1 → #1 by listing count
    assert.equal(e.uk.rankByListings, 1);
    assert.equal(e.uk.rankByRewards, 2);
    // Past tense + all-time: the count is of published listings, not a live rate.
    assert.match(e.headline.claim, /more Earn listings/);
    assert.match(e.headline.claim, /has published/);
  });

  it("liveNow counts deadline in the future, not the API status field", () => {
    const e = computeEarnEdition(
      [
        listing({ deadline: "2026-10-01T00:00:00Z" }), // future → live
        listing({ deadline: "2020-01-01T00:00:00Z" }), // past → dead
        listing({ deadline: null }),
      ],
      NOW,
    );
    assert.equal(e.uk.liveNow.length, 1);
    assert.equal(e.totals.liveNow, 1);
  });

  it("composes share copy with real numbers and the permalink", () => {
    const e = computeEarnEdition([listing({ rewardAmount: 95_600, _count: { Submission: 1491 } })]);
    assert.match(e.tweet, /\$95\.6K/);
    assert.match(e.tweet, /databard\.persidian\.com\/superteam|\/superteam/);
    assert.match(e.linkedin, /submissions/);
    assert.match(e.emailBlurb, /not an official|the conversation/i);
  });

  it("handles empty input without NaN", () => {
    const e = computeEarnEdition([]);
    assert.equal(e.uk.listings, 0);
    assert.equal(e.uk.subsPerListing, 0);
    assert.equal(e.totals.listings, 0);
    assert.equal(e.chapters.length, 0);
  });

  it("flags AGENT_ALLOWED listings in totals", () => {
    const e = computeEarnEdition([
      listing({ agentAccess: "AGENT_ALLOWED" }),
      listing({ agentAccess: "HUMAN_ONLY" }),
    ]);
    assert.equal(e.totals.agentAllowed, 1);
  });

  it("builds a cumulative race series bucketed by deadline month", () => {
    const e = computeEarnEdition(
      [
        listing({ deadline: "2026-01-15T00:00:00Z", sponsor: { name: "Superteam UK" } }),
        listing({ deadline: "2026-02-15T00:00:00Z", sponsor: { name: "Superteam UK" } }),
        listing({ deadline: "2026-03-15T00:00:00Z", sponsor: { name: "Superteam UK" } }),
        listing({ deadline: "2026-02-15T00:00:00Z", sponsor: { name: "Superteam Brasil" } }),
      ],
      NOW,
    );
    assert.deepEqual(e.race.keys, ["Superteam UK", "Superteam Brasil"]);
    assert.equal(e.race.rows.length, 3); // Jan, Feb, Mar
    const last = e.race.rows.at(-1)!;
    assert.equal(last["Superteam UK"], 3);
    assert.equal(last["Superteam Brasil"], 1);
  });

  it("detects when UK took the sole listings lead and the activity streak", () => {
    const e = computeEarnEdition(
      [
        // Brasil leads through Feb, UK overtakes in Mar and keeps posting
        listing({ deadline: "2026-01-10T00:00:00Z", sponsor: { name: "Superteam Brasil" } }),
        listing({ deadline: "2026-02-10T00:00:00Z", sponsor: { name: "Superteam Brasil" } }),
        listing({ deadline: "2026-03-10T00:00:00Z", sponsor: { name: "Superteam UK" } }),
        listing({ deadline: "2026-03-20T00:00:00Z", sponsor: { name: "Superteam UK" } }),
        listing({ deadline: "2026-04-10T00:00:00Z", sponsor: { name: "Superteam UK" } }),
      ],
      NOW,
    );
    // Mar ends 2–2 (tie), Apr is the first month UK is solely ahead
    assert.equal(e.uk.leadSinceMonth, "2026-04");
    assert.equal(e.uk.streakMonths, 2); // Mar + Apr consecutive
    // The axis is closing month, not posting month — say so.
    assert.match(e.story.join(" "), /since Apr 2026/);
    assert.match(e.story.join(" "), /closed more bounties/);
  });

  it("omits the lead claim when UK has never held it", () => {
    const e = computeEarnEdition([
      listing({ deadline: "2026-01-10T00:00:00Z", sponsor: { name: "Superteam Brasil" } }),
      listing({ deadline: "2026-01-10T00:00:00Z", sponsor: { name: "Superteam Brasil" } }),
      listing({ deadline: "2026-01-10T00:00:00Z", sponsor: { name: "Superteam UK" } }),
    ]);
    assert.equal(e.uk.leadSinceMonth, null);
    assert.ok(!e.story.some((s) => /closed more bounties than any other sponsor/.test(s)));
  });

  it("lists the most recently closed UK listings when nothing is open", () => {
    const e = computeEarnEdition(
      [
        listing({ title: "Older", deadline: "2026-01-10T00:00:00Z" }),
        listing({ title: "Newer", deadline: "2026-03-10T00:00:00Z" }),
        listing({ title: "Still open", deadline: "2026-12-10T00:00:00Z" }),
        listing({ title: "No deadline", deadline: null }),
      ],
      NOW,
    );
    assert.equal(e.uk.liveNow.length, 1);
    // Newest-closed first, future and undated excluded.
    assert.deepEqual(e.uk.recent.map((l) => l.title), ["Newer", "Older"]);
  });

  it("keeps the OG card claim identical to the page headline and states the caveats", () => {
    const e = computeEarnEdition([listing({ rewardAmount: 95_600, _count: { Submission: 1491 } })]);
    assert.equal(e.headline.card, `${e.headline.claim}.`);
    assert.match(e.tweet, /USD-denominated rewards/);
    assert.match(e.linkedin, /floors, not ceilings/);
    assert.match(e.emailBlurb, /floors, not ceilings/);
  });

  it("keeps the tweet inside X's 280-char budget at realistic magnitudes", () => {
    // Mirrors the live shape: 93 UK listings, ~$95.6K, ~1.5K submissions, and
    // two chapters ahead on reward dollars.
    const listings = [
      ...Array.from({ length: 93 }, () =>
        listing({ rewardAmount: 1027, _count: { Submission: 16 } }),
      ),
      ...Array.from({ length: 54 }, () =>
        listing({ sponsor: { name: "Superteam Nigeria" }, rewardAmount: 2714 }),
      ),
      ...Array.from({ length: 58 }, () =>
        listing({ sponsor: { name: "Superteam Ukraine" }, rewardAmount: 2139 }),
      ),
    ];
    const e = computeEarnEdition(listings, NOW);
    // X counts every URL as 23 characters (t.co), regardless of its real length.
    const asPosted = e.tweet.replace(e.permalink, "x".repeat(23));
    assert.ok(asPosted.length <= 280, `tweet is ${asPosted.length} chars, over X's 280 limit`);
    assert.match(e.tweet, /has published more Earn listings/);
    assert.match(e.tweet, /USD-denominated rewards/);
    assert.ok(e.tweet.includes(e.permalink), "tweet must carry the permalink");
    assert.ok(!/took the listings lead|posts more opportunities/.test(e.tweet), "no stale claim wording");
  });
});

describe("evidence receipt", () => {
  it("emits a self-verifying receipt over the listing input and the computed result", () => {
    const listings = [listing({ rewardAmount: 100 })];
    const e = computeEarnEdition(listings);
    assert.equal(e.receipt.format, "databard.evidence-receipt");
    assert.equal(e.receipt.version, 1);
    assert.equal(e.receipt.hashAlgorithm, "sha256");
    assert.ok(verifyEvidenceReceipt(e.receipt), "receipt must self-verify");

    const evidence = e.receipt.payload.evidence as Record<string, unknown>;
    assert.equal(evidence.kind, "earn-listings");
    assert.equal(evidence.delivery, "live");
    assert.equal(evidence.listings, 1);
    assert.equal(evidence.listingsHash, hashEvidence(JSON.parse(JSON.stringify(listings))));

    const { receipt: _receipt, ...result } = e;
    void _receipt;
    assert.equal(e.receipt.payload.resultHash, hashEvidence(JSON.parse(JSON.stringify(result))));
    // A supplied preimage that disagrees with the receipt must fail.
    assert.ok(verifyEvidenceReceipt(e.receipt, { result }));
    assert.equal(verifyEvidenceReceipt(e.receipt, { result: { ...result, uk: {} } }), false);
  });

  it("fails verification when any hashed number is altered", () => {
    const e = computeEarnEdition([listing()]);
    const tampered = JSON.parse(JSON.stringify(e.receipt)) as typeof e.receipt;
    (tampered.payload as Record<string, unknown>).resultHash = "0".repeat(64);
    assert.equal(verifyEvidenceReceipt(tampered), false);
  });

  it("labels snapshot delivery, composition time and observation time separately", () => {
    const e = computeEarnEdition([listing()], NOW, {
      source: "snapshot",
      observedAt: "2026-09-01T00:00:00Z",
      requestedAt: "2026-09-17T12:00:00Z",
    });
    assert.equal(e.source, "snapshot");
    assert.equal(e.observedAt, "2026-09-01T00:00:00Z");
    assert.equal(e.generatedAt, "2026-09-17T12:00:00Z");
    const evidence = e.receipt.payload.evidence as Record<string, unknown>;
    assert.equal(evidence.delivery, "snapshot");
    assert.equal(evidence.observedAt, "2026-09-01T00:00:00Z");
    assert.ok(verifyEvidenceReceipt(e.receipt));
  });
});
