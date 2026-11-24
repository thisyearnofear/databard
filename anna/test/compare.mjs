// compare.js — the since-last-check snapshot + diff.

import { test } from "node:test";
import assert from "node:assert/strict";

import { snapshotOf, diffSnapshots } from "../bundle/compare.js";
import { reportPayload } from "../bundle/reading.js";
import { parseCsv, analyzeCommunityData, SAMPLES } from "../bundle/community-health.js";

const messy = SAMPLES.find((s) => s.key === "messy");
const { header, rows } = parseCsv(messy.csv);
const payload = reportPayload(analyzeCommunityData(header, rows));
const snap = snapshotOf(payload, Date.parse("2026-11-17T00:00:00Z"));

test("a snapshot is aggregates only — no cell value survives", () => {
  const json = JSON.stringify(snap);
  const cellValues = rows.flat().filter((v) => v.trim().length >= 4);
  assert.ok(cellValues.length > 0);
  for (const v of cellValues) assert.ok(!json.includes(v), `cell value leaked: ${v}`);
  assert.equal(snap.score, payload.score);
  assert.equal(snap.columnNames.length, payload.columnCount);
  assert.equal(snap.checks.length, payload.checks.length);
});

test("no previous snapshot, or a malformed one, yields no diff", () => {
  assert.equal(diffSnapshots(null, snap), null);
  assert.equal(diffSnapshots({}, snap), null);
  assert.equal(diffSnapshots({ at: "yesterday" }, snap), null);
});

test("a different sheet yields no diff rather than a meaningless one", () => {
  const other = { ...snap, columnNames: ["email", "name", "phone"] };
  assert.equal(diffSnapshots(other, snapshotOf(payload)), null);
});

test("an unchanged sheet diffs to a quiet strip", () => {
  const out = diffSnapshots(snap, snapshotOf(payload));
  assert.equal(out.changed, false);
  assert.equal(out.entries.length, 0);
});

test("score moves carry direction — up is good, down is not", () => {
  const up = diffSnapshots({ ...snap, score: snap.score - 10 }, snapshotOf(payload));
  const scoreEntry = up.entries.find((e) => e.key === "score");
  assert.equal(scoreEntry.good, true);
  assert.equal(scoreEntry.delta, 10);
  const down = diffSnapshots({ ...snap, score: snap.score + 10 }, snapshotOf(payload));
  assert.equal(down.entries.find((e) => e.key === "score").good, false);
});

test("empty cells are good when they shrink", () => {
  const prev = { ...snap, emptyCellsPercent: (snap.emptyCellsPercent ?? 0) + 10 };
  const out = diffSnapshots(prev, snapshotOf(payload));
  const entry = out.entries.find((e) => e.key === "emptyCellsPercent");
  assert.equal(entry.good, true);
  assert.equal(entry.delta, -10);
});

test("a check that changed state shows up labelled, ranked by direction", () => {
  const prev = {
    ...snap,
    checks: snap.checks.map((c, i) => (i === 0 ? { ...c, state: c.state === "fail" ? "pass" : "fail" } : c)),
  };
  const out = diffSnapshots(prev, snapshotOf(payload));
  const entry = out.entries.find((e) => e.key === `check:${snap.checks[0].name}`);
  assert.ok(entry, "the flipped check is missing");
  assert.notEqual(entry.from, entry.to);
  assert.equal(entry.good, (snap.checks[0].state === "fail") === false);
});

test("days between checks are counted whole", () => {
  const out = diffSnapshots(snap, snapshotOf(payload, Date.parse("2026-11-24T00:00:00Z")));
  assert.equal(out.days, 7);
});

test("missing derived numbers are skipped, not diffed as zero", () => {
  const prev = { ...snap, uniqueMembers: null, contactable: null, emptyCellsPercent: null };
  const out = diffSnapshots(prev, snapshotOf(payload));
  assert.ok(!out.entries.some((e) => e.key === "uniqueMembers"));
  assert.ok(!out.entries.some((e) => e.key === "contactable"));
});
