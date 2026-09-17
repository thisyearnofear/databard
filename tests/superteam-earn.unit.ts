/**
 * Superteam Earn edition: pure stats layer — chapter aggregates, UK spotlight,
 * stable-token honesty, live-deadline logic.
 * Run with: npx tsx tests/superteam-earn.unit.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeEarnEdition, isStableToken, type EarnListing } from "../src/lib/superteam-earn";

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
    assert.match(e.headline.claim, /more Earn opportunities/);
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
    assert.match(e.story.join(" "), /lead in Apr 2026/);
  });

  it("omits the lead claim when UK has never held it", () => {
    const e = computeEarnEdition([
      listing({ deadline: "2026-01-10T00:00:00Z", sponsor: { name: "Superteam Brasil" } }),
      listing({ deadline: "2026-01-10T00:00:00Z", sponsor: { name: "Superteam Brasil" } }),
      listing({ deadline: "2026-01-10T00:00:00Z", sponsor: { name: "Superteam UK" } }),
    ]);
    assert.equal(e.uk.leadSinceMonth, null);
    assert.ok(!e.story.some((s) => /took the listings lead/.test(s)));
  });
});
