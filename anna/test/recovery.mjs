// recovery.js — checkpoint envelope + saved readings.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVE_TASK_KEY,
  validateCheckpoint,
  readActiveTask,
  writeCheckpoint,
  clearCheckpoint,
  saveReading,
  readLastReading,
} from "../bundle/recovery.js";
import { reportPayload } from "../bundle/reading.js";
import { parseCsv, analyzeCommunityData, SAMPLES } from "../bundle/community-health.js";
import { fakeAnna } from "./fake-anna.js";

const { header, rows } = parseCsv(SAMPLES[0].csv);
const payload = reportPayload(analyzeCommunityData(header, rows));

function cp(extra = {}) {
  return { v: 1, id: "run-1", stage: "reading", tone: "straight", purpose: "cleanup", payload, ...extra };
}

test("a well-formed checkpoint validates; bad envelopes are corrupt", () => {
  assert.ok(validateCheckpoint(cp()).checkpoint);
  assert.ok(validateCheckpoint({}).corrupt);
  assert.ok(validateCheckpoint(cp({ v: 2 })).corrupt);
  assert.ok(validateCheckpoint(cp({ stage: "scoring" })).corrupt);
  assert.ok(validateCheckpoint(cp({ tone: "mean" })).corrupt);
  assert.ok(validateCheckpoint(cp({ purpose: "vibes" })).corrupt);
  assert.ok(validateCheckpoint(cp({ payload: { ...payload, score: "high" } })).corrupt);
  assert.ok(validateCheckpoint(cp({ payload: { ...payload, columns: [{ name: "x", samples: ["a@b.co"] }] } })).corrupt);
});

test("the checkpoint carries the payload only — no rows, no samples", async () => {
  const anna = fakeAnna();
  await writeCheckpoint(anna, cp());
  const stored = JSON.stringify(anna.store.get(ACTIVE_TASK_KEY));
  const messy = SAMPLES.find((s) => s.key === "messy");
  const { rows: rawRows } = parseCsv(messy.csv);
  for (const cell of rawRows.flat()) {
    if (cell.includes("@")) assert.ok(!stored.includes(cell), `row value leaked: ${cell}`);
  }
  assert.ok(!stored.includes("amara.osei"), "member email must not be in the checkpoint");
});

test("read → resume carries the payload to the model call", async () => {
  const anna = fakeAnna();
  await writeCheckpoint(anna, cp());
  const res = await readActiveTask(anna);
  assert.equal(res.status, "valid");
  assert.equal(res.checkpoint.stage, "reading");
  assert.equal(res.checkpoint.payload.score, payload.score);
});

test("a corrupt checkpoint is reported and kept", async () => {
  const anna = fakeAnna();
  anna.store.set(ACTIVE_TASK_KEY, { nope: 1 });
  const res = await readActiveTask(anna);
  assert.equal(res.status, "corrupt");
  assert.deepEqual(anna.store.get(ACTIVE_TASK_KEY), { nope: 1 });
});

test("saveReading writes readings/<ts> and readings/last", async () => {
  const anna = fakeAnna();
  const record = { payload, reading: { headline: "h", claim: "c", risk: "r", steps: ["s"] }, narrated: true, tone: "straight", purpose: "cleanup", at: 1700000000000 };
  await saveReading(anna, record);
  const back = await readLastReading(anna);
  assert.equal(back.reading.headline, "h");
  await clearCheckpoint(anna);
  assert.equal((await readActiveTask(anna)).status, "none");
});
