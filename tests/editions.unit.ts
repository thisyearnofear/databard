/**
 * Unit tests for commissioned editions (src/lib/editions.ts) and the
 * sponsor-generic path through computeEarnEdition.
 *
 * Run: npx tsx tests/editions.unit.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  slugifySponsor,
  resolveSponsorName,
  createIntent,
  getIntent,
  getPublished,
  publishedForSponsor,
  publishEdition,
} from "../src/lib/editions";
import { claimPusdSignature, editionPricePusd } from "../src/lib/pusd";
import { computeEarnEdition, sponsorFocus, type EarnListing } from "../src/lib/superteam-earn";

function listing(overrides: Partial<EarnListing> = {}): EarnListing {
  return {
    id: Math.random().toString(36).slice(2),
    title: "A listing",
    slug: "a-listing",
    rewardAmount: 100,
    token: "USDC",
    deadline: "2026-03-01T00:00:00Z",
    type: "bounty",
    status: "CLOSED",
    isFeatured: false,
    agentAccess: null,
    sponsor: { name: "Superteam UK" },
    ...overrides,
  };
}

describe("slugify + sponsor resolution", () => {
  it("slugifies sponsor names to url-safe slugs", () => {
    assert.equal(slugifySponsor("Superteam Nigeria"), "superteam-nigeria");
    assert.equal(slugifySponsor("Jupiter"), "jupiter");
    assert.equal(slugifySponsor("  dYdX   Foundation "), "dydx-foundation");
  });

  it("resolves case-insensitive exact names, never partials", () => {
    const listings = [
      listing({ sponsor: { name: "Superteam Nigeria" } }),
      listing({ sponsor: { name: "Jupiter" } }),
    ];
    assert.equal(resolveSponsorName("superteam nigeria", listings), "Superteam Nigeria");
    assert.equal(resolveSponsorName("JUPITER", listings), "Jupiter");
    assert.equal(resolveSponsorName("superteam nig", listings), null);
    assert.equal(resolveSponsorName("nigeria", listings), null);
    assert.equal(resolveSponsorName("", listings), null);
  });
});

describe("generic sponsor edition", () => {
  it("spotlights a non-chapter sponsor with sponsor-wide ranks", () => {
    const e = computeEarnEdition(
      [
        listing({ sponsor: { name: "Jupiter" }, rewardAmount: 5000 }),
        listing({ sponsor: { name: "Jupiter" }, rewardAmount: 5000 }),
        listing({ sponsor: { name: "Superteam Nigeria" }, rewardAmount: 500 }),
        listing({ sponsor: { name: "Superteam UK" }, rewardAmount: 100 }),
      ],
      new Date("2026-09-17T12:00:00Z"),
      { focus: sponsorFocus("Jupiter", "/earn/jupiter") },
    );
    assert.equal(e.focus.name, "Jupiter");
    assert.equal(e.focus.short, "Jupiter");
    assert.equal(e.focus.isChapter, false);
    assert.equal(e.focus.listings, 2);
    assert.equal(e.focus.rankByListings, 1);
    assert.equal(e.focus.rankByRewards, 1); // most USD of all sponsors
    assert.equal(e.focus.rankByRewardsChapters, 0); // not a chapter
    assert.match(e.headline.claim, /leads the Earn economy on reward dollars|more Earn listings/);
    assert.equal(e.permalink.endsWith("/earn/jupiter"), true);
    // The race leads with the focus, not UK.
    assert.equal(e.race.keys[0], "Jupiter");
    // Sponsors league exists for non-chapter contexts.
    assert.ok(e.sponsors.length >= 3);
    assert.equal(e.sponsors[0].name, "Jupiter");
  });

  it("keeps UK behaviour identical when focus is omitted", () => {
    const e = computeEarnEdition([listing({ rewardAmount: 500 })]);
    assert.equal(e.focus.name, "Superteam UK");
    assert.equal(e.focus.isChapter, true);
    assert.equal(e.permalink.endsWith("/superteam"), true);
  });
});

describe("intents and publishing", () => {
  it("creates one intent per sponsor slug and reuses it", () => {
    const a = createIntent("Test Sponsor Alpha");
    const b = createIntent("Test Sponsor Alpha");
    assert.equal(a.id, b.id);
    assert.equal(a.slug, "test-sponsor-alpha");
    assert.equal(getIntent(a.id)?.sponsor, "Test Sponsor Alpha");
  });

  it("publishes once per sponsor and refuses a second charge", async () => {
    const intent = createIntent("Test Sponsor Beta");
    const edition = computeEarnEdition([listing({ sponsor: { name: "Test Sponsor Beta" } })], undefined, {
      focus: sponsorFocus("Test Sponsor Beta", "/earn/test-sponsor-beta"),
    });
    const payment = { walletAddress: "Buyer111", txSignature: "sig_beta_1" };
    const p1 = await publishEdition(intent, payment, { edition });
    const p2 = await publishEdition(intent, { walletAddress: "Buyer222", txSignature: "sig_beta_2" }, { edition });
    assert.equal(p1.slug, "test-sponsor-beta");
    assert.equal(p1.paidBy, "Buyer111");
    assert.equal(p2.paidBy, "Buyer111"); // second publish is a no-op
    assert.equal(publishedForSponsor("Test Sponsor Beta")?.slug, p1.slug);
    assert.equal(getPublished(p1.slug)?.txSignature, "sig_beta_1");
  });
});

describe("payment rails", () => {
  it("defaults the edition price and honours the env override", () => {
    const prev = process.env.EDITION_PRICE_PUSD;
    try {
      delete process.env.EDITION_PRICE_PUSD;
      assert.equal(editionPricePusd(), 25);
      process.env.EDITION_PRICE_PUSD = "40";
      assert.equal(editionPricePusd(), 40);
      process.env.EDITION_PRICE_PUSD = "nonsense";
      assert.equal(editionPricePusd(), 25);
    } finally {
      if (prev === undefined) delete process.env.EDITION_PRICE_PUSD;
      else process.env.EDITION_PRICE_PUSD = prev;
    }
  });

  it("claims a signature once — replaying it is refused", () => {
    const sig = `sig_replay_${Date.now()}`;
    const first = claimPusdSignature(sig, { purpose: "edition", reference: "int_1" });
    const second = claimPusdSignature(sig, { purpose: "edition", reference: "int_2" });
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.alreadySpentOn.reference, "int_1");
  });
});
