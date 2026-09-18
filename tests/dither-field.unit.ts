import { it } from "node:test";
import assert from "node:assert/strict";
import { buildEarnSeries, focusSeriesFromRace, hash01, mulberry32, seedFromString } from "../src/lib/dither-field";
import type { EarnListing } from "../src/lib/superteam-earn";

function listing(id: string, deadline: string | null): EarnListing {
  return {
    id, title: id, slug: id, rewardAmount: 10, token: "USDC",
    deadline, type: "bounty", status: "CLOSED", isFeatured: false,
    agentAccess: null, sponsor: { name: "S" }, _count: { Submission: 1 },
  };
}

it("buildEarnSeries buckets by closing month, oldest to newest, excluding unusable deadlines", () => {
  const now = new Date("2026-09-18T00:00:00Z");
  const series = buildEarnSeries([
    listing("a", "2026-09-05T00:00:00Z"),   // current month → last slot
    listing("b", "2026-09-20T00:00:00Z"),   // current month → last slot
    listing("c", "2026-06-15T00:00:00Z"),   // 3 months back
    listing("d", "2025-01-10T00:00:00Z"),   // outside the 12-month window
    listing("e", null),                     // no deadline → excluded
    listing("f", "not-a-date"),             // unparseable → excluded
  ], now);
  assert.equal(series.length, 12);
  assert.equal(series[11], 2); // Sep 2026
  assert.equal(series[8], 1);  // Jun 2026
  assert.equal(series.reduce((a, b) => a + b, 0), 3);
});

it("focusSeriesFromRace converts a cumulative trace to monthly counts", () => {
  const race = {
    keys: ["Jupiter", "UK"],
    rows: [
      { t: "Jul 26", Jupiter: 1, UK: 4 },
      { t: "Aug 26", Jupiter: 1, UK: 7 },
      { t: "Sep 26", Jupiter: 4, UK: 9 },
    ],
  };
  assert.deepEqual(focusSeriesFromRace(race, "Jupiter"), [1, 0, 3]);
  assert.deepEqual(focusSeriesFromRace(race, "UK"), [4, 3, 2]);
  assert.deepEqual(focusSeriesFromRace(race, "Missing"), [0, 0, 0]);
  assert.deepEqual(focusSeriesFromRace({ keys: [], rows: [] }, "Jupiter"), []);
});

it("seedFromString and mulberry32 are deterministic and hash01 stays in [0,1)", () => {
  assert.equal(seedFromString("2026-09-18:1,2,3"), seedFromString("2026-09-18:1,2,3"));
  assert.notEqual(seedFromString("a"), seedFromString("b"));
  const rngA = mulberry32(42);
  const rngB = mulberry32(42);
  assert.deepEqual([rngA(), rngA(), rngA()], [rngB(), rngB(), rngB()]);
  for (let i = 0; i < 1000; i++) {
    const v = hash01(i, i * 7, 1234);
    assert.ok(v >= 0 && v < 1, `hash01 out of range: ${v}`);
  }
});
