/**
 * Score-card extraction: the shareable finding, not a podcast blurb.
 * Run with: npx tsx tests/score-card.unit.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { healthScore, scoreFromEpisode, shareText } from "../src/lib/score-card";
import type { Episode } from "../src/lib/types";

const episode: Episode = {
  schemaFqn: "orca",
  schemaName: "Orca",
  tableCount: 12,
  qualitySummary: { passed: 68, failed: 32, total: 100 },
  script: [
    { speaker: "Alex", topic: "intro", text: "Welcome back to the briefing." },
    { speaker: "Morgan", topic: "health", text: "Orca has a red flag: coverage dropped on the swap pool tables." },
  ],
};

describe("score-card", () => {
  it("scores from pass rate", () => {
    assert.equal(healthScore(episode), 68);
  });

  it("picks the hooked line as the share quote", () => {
    const card = scoreFromEpisode(episode);
    assert.equal(card.score, 68);
    assert.equal(card.segmentIndex, 1);
    assert.match(card.quote, /red flag/);
    assert.match(shareText(card, "https://example.com/episode/x"), /Orca is 68/);
  });

  it("honours an explicit segment index", () => {
    const clipped = scoreFromEpisode(episode, 0);
    assert.equal(clipped.segmentIndex, 0);
    assert.match(clipped.quote, /Welcome back/);
  });
});
