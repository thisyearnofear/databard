import { it } from "node:test";
import assert from "node:assert/strict";
import { buildReportExamples } from "../src/lib/report-examples";
import type { EarnListing, EarnListingsSnapshot } from "../src/lib/superteam-earn";

const listing = (id: string, name: string, token: string, rewardAmount: number, submissions: number): EarnListing => ({
  id, title: id, slug: id, rewardAmount, token, deadline: "2026-06-01T00:00:00Z",
  type: "bounty", status: "CLOSED", isFeatured: false, agentAccess: null,
  sponsor: { name }, _count: { Submission: submissions },
});
const loaded: EarnListingsSnapshot = {
  source: "snapshot", observedAt: "2026-09-17T00:00:00Z",
  listings: [listing("uk", "Superteam UK", "USDC", 100, 4), listing("jup-usd", "Jupiter", "USDC", 50, 2), listing("jup-sol", "Jupiter", "SOL", 999, 3)],
};
const requestedAt = "2026-09-18T00:00:00Z";

it("projects available examples from one frozen source without revaluing token rewards", () => {
  const before = JSON.stringify(loaded);
  const examples = buildReportExamples(loaded, requestedAt);
  assert.deepEqual(examples.map((example) => example.href), ["/superteam", "/earn/jupiter"]);
  assert.equal(examples[1].listings, 2);
  assert.equal(examples[1].usdRewards, 50);
  assert.equal(examples[1].submissions, 5);
  assert.ok(examples.every((example) => example.observedAt === loaded.observedAt && example.source === "snapshot"));
  assert.deepEqual(buildReportExamples(loaded, requestedAt), examples);
  assert.equal(JSON.stringify(loaded), before);
});

it("does not invent an organization when the source has no supported examples", () => {
  assert.deepEqual(buildReportExamples({ ...loaded, listings: [] }, requestedAt), []);
});
