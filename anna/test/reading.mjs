// reading.js — payload hygiene, parser, and the deterministic audit.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  reportPayload,
  buildReadingPrompt,
  parseReading,
  auditReading,
  readReport,
  figures,
} from "../bundle/reading.js";
import { parseCsv, analyzeCommunityData, SAMPLES } from "../bundle/community-health.js";
import { fakeAnna } from "./fake-anna.js";

const messy = SAMPLES.find((s) => s.key === "messy");
const { header, rows } = parseCsv(messy.csv);
const report = analyzeCommunityData(header, rows);
const payload = reportPayload(report);
const payloadJson = JSON.stringify(payload);

const sampleValues = report.columns.flatMap((c) => c.samples);

test("reportPayload strips every sample value — no member data reaches the prompt", () => {
  assert.ok(sampleValues.length > 0);
  const prompt = buildReadingPrompt(payload, "straight", "sponsor");
  const identifiable = sampleValues.filter((v) => v.trim().length >= 4);
  assert.ok(identifiable.length > 0);
  for (const v of identifiable) {
    assert.ok(!prompt.includes(v), `sample value leaked: ${v}`);
    assert.ok(!payloadJson.includes(v), `sample in payload: ${v}`);
  }
  assert.ok(!("samples" in payload.columns[0] ?? {}));
});

test("reportPayload carries code-derived numbers the model would otherwise invent", () => {
  assert.equal(payload.derived.uniqueMembers, payload.rowCount - report.stats.duplicates);
  assert.equal(payload.derived.contactable, report.stats.validEmails);
  assert.equal(payload.derived.emptyCellsPercent, 100 - report.stats.completeness);
});

test("the prompt states the purpose in one plain sentence", () => {
  const p = buildReadingPrompt(payload, "straight", "sponsor");
  assert.ok(p.includes("purpose is reporting numbers to a sponsor"));
  const p2 = buildReadingPrompt(payload, "roast", "send");
  assert.ok(p2.includes("purpose is emailing the list"));
});

const cleanReading = {
  headline: `The "email" column is doing the damage`,
  claim: `You can defend ${payload.derived.uniqueMembers} unique members once the duplicate is merged.`,
  risk: `Sending as-is bounces ${payload.derived.contactable === 9 ? "one malformed address" : "a malformed address"} and double-counts a member.`,
  steps: [`Merge the duplicate rows in "email".`, `Fix the malformed entry in "email".`],
};

test("parser accepts fenced and bare JSON, rejects prose and over-cap", () => {
  assert.equal(parseReading("```json\n" + JSON.stringify(cleanReading) + "\n```").headline, cleanReading.headline);
  assert.equal(parseReading(JSON.stringify(cleanReading)).claim, cleanReading.claim);
  assert.throws(() => parseReading("Here is your reading."), /no JSON/);
  assert.throws(() => parseReading(JSON.stringify({ ...cleanReading, headline: "x".repeat(101) })), /headline/);
  assert.throws(() => parseReading(JSON.stringify({ ...cleanReading, steps: [] })), /steps/);
  assert.throws(() => parseReading(JSON.stringify({ ...cleanReading, claim: "x".repeat(241) })), /claim/);
});

test("audit keeps a reading whose numbers come from the report", () => {
  const out = auditReading(parseReading(JSON.stringify(cleanReading)), payload);
  assert.equal(out.narrated, true);
  assert.equal(out.dropped.length, 0);
});

test("audit drops a field that invents a number", () => {
  const r = parseReading(JSON.stringify({
    ...cleanReading,
    claim: "Engagement dropped 73% last quarter.",
  }));
  const out = auditReading(r, payload);
  assert.equal(out.narrated, false);
  assert.equal(out.dropped[0].field, "claim");
});

test("audit drops an unknown quoted column name", () => {
  const r = parseReading(JSON.stringify({
    ...cleanReading,
    steps: ["Backfill \"postcode\" first."],
  }));
  const out = auditReading(r, payload);
  assert.equal(out.narrated, false);
  assert.ok(out.dropped[0].reason.includes("postcode"));
});

test("audit drops email-shaped and URL-shaped text", () => {
  const r = parseReading(JSON.stringify({
    ...cleanReading,
    risk: "Ask amara.osei@gmail.com what happened.",
  }));
  const out = auditReading(r, payload);
  assert.equal(out.narrated, false);
  const r2 = parseReading(JSON.stringify({
    ...cleanReading,
    claim: "See https://example.com/members for the fix.",
  }));
  assert.equal(auditReading(r2, payload).narrated, false);
});

test("a headline that restates the score or the label falls back to the verdict", () => {
  for (const h of [`Score ${payload.score} out of a possible 100`, `Your sheet is ${payload.label} now`]) {
    const r = parseReading(JSON.stringify({ ...cleanReading, headline: h }));
    const out = auditReading(r, payload);
    assert.equal(out.reading.headline, payload.verdict);
    assert.equal(out.dropped[0].field, "headline");
  }
});

test("figures() canonicalisation matches the doorknock contract", () => {
  assert.deepEqual(figures("$40M"), ["40m"]);
  assert.deepEqual(figures("40 million"), ["40m"]);
  assert.deepEqual(figures("12 percent"), ["12%"]);
  assert.deepEqual(figures("3,000"), ["3000"]);
  assert.deepEqual(figures("8 rows"), ["8"]);
  assert.deepEqual(figures("12 members"), ["12"]);
  assert.deepEqual(figures("3 k"), ["3"]);
  assert.deepEqual(figures("3k"), ["3k"]);
});

test("audit allows label, verdict and check states as quoted tokens", () => {
  const r = parseReading(JSON.stringify({
    ...cleanReading,
    claim: `The verdict "${payload.verdict}" and the label "${payload.label}" agree with a "partial" check.`,
  }));
  const out = auditReading(r, payload);
  assert.equal(out.narrated, true);
  assert.equal(out.dropped.length, 0);
});

// ── the model's repair plan: a decision over the report's own checks ─────
const firstCheck = payload.checks[0].name;
const secondCheck = payload.checks[1]?.name ?? payload.checks[0].name;
const planned = {
  ...cleanReading,
  priority: [
    { check: firstCheck, why: "This is the one that changes what you can send." },
    { check: secondCheck, why: "Cheaper to fix once the first one is done." },
  ],
};

test("the prompt asks for a priority list over the report's checks", () => {
  const p = buildReadingPrompt(payload, "straight", "sponsor");
  assert.ok(p.includes('"priority"'));
  assert.ok(/exact check name/i.test(p));
});

test("parseReading accepts a valid priority list and keeps the order", () => {
  const r = parseReading(JSON.stringify(planned));
  assert.deepEqual(r.priority.map((p) => p.check), [firstCheck, secondCheck]);
});

test("parseReading rejects a malformed priority list", () => {
  assert.throws(() => parseReading(JSON.stringify({ ...cleanReading, priority: [] })), /priority/);
  assert.throws(() => parseReading(JSON.stringify({ ...cleanReading, priority: [{ check: "x" }] })), /priority/);
});

test("a reading without priority stays valid — older drafts and recordings", () => {
  const r = parseReading(JSON.stringify(cleanReading));
  assert.equal(r.priority, null);
  const out = auditReading(r, payload);
  assert.equal(out.reading.priority, null);
  assert.equal(out.narrated, true);
});

test("audit keeps a plan whose checks are real and whose reasons add no figures", () => {
  const out = auditReading(parseReading(JSON.stringify(planned)), payload);
  assert.equal(out.narrated, true);
  assert.equal(out.dropped.length, 0);
  assert.deepEqual(out.reading.priority.map((p) => p.check), [firstCheck, secondCheck]);
});

test("audit drops a plan entry that names a check the report does not have", () => {
  const r = parseReading(JSON.stringify({
    ...cleanReading,
    priority: [{ check: "Vibes", why: "It feels wrong." }],
  }));
  const out = auditReading(r, payload);
  assert.equal(out.reading.priority, null);
  assert.equal(out.dropped[0].field, "priority");
  assert.match(out.dropped[0].reason, /unknown check/);
});

test("audit drops a plan entry that smuggles in a figure", () => {
  const r = parseReading(JSON.stringify({
    ...cleanReading,
    priority: [{ check: firstCheck, why: "Fixing this recovers 9999% of the list." }],
  }));
  const out = auditReading(r, payload);
  assert.equal(out.reading.priority, null);
  assert.equal(out.dropped[0].field, "priority");
});

test("a plan entry cannot leak an email either", () => {
  const r = parseReading(JSON.stringify({
    ...cleanReading,
    priority: [{ check: firstCheck, why: "Ask ada@example.org to confirm." }],
  }));
  const out = auditReading(r, payload);
  assert.equal(out.reading.priority, null);
});

// ── the purpose verdict: a model decision, audited like the headline ────

test("the prompt asks for a purpose verdict distinct from the label", () => {
  const p = buildReadingPrompt(payload, "straight", "sponsor");
  assert.ok(p.includes('"verdict"'));
  assert.ok(/verdict for this purpose/.test(p));
});

test("parse keeps a valid verdict; a missing one stays null; oversized rejects", () => {
  assert.equal(
    parseReading(JSON.stringify({ ...cleanReading, verdict: "Sendable once the duplicate is merged." })).verdict,
    "Sendable once the duplicate is merged.",
  );
  assert.equal(parseReading(JSON.stringify(cleanReading)).verdict, null);
  assert.throws(() => parseReading(JSON.stringify({ ...cleanReading, verdict: "x".repeat(141) })), /verdict/);
});

test("audit keeps a verdict grounded in the report", () => {
  const out = auditReading(parseReading(JSON.stringify({
    ...cleanReading,
    verdict: `Fine to send once the "email" duplicate is merged.`,
  })), payload);
  assert.equal(out.reading.verdict, 'Fine to send once the "email" duplicate is merged.');
  assert.equal(out.dropped.length, 0);
});

test("audit drops a verdict with an invented figure or a restated label", () => {
  const fig = auditReading(parseReading(JSON.stringify({
    ...cleanReading,
    verdict: "9999% ready to send.",
  })), payload);
  assert.equal(fig.reading.verdict, null);
  assert.equal(fig.dropped[0].field, "verdict");
  const label = auditReading(parseReading(JSON.stringify({
    ...cleanReading,
    verdict: `This list is ${payload.label}.`,
  })), payload);
  assert.equal(label.reading.verdict, null);
  assert.equal(label.dropped[0].field, "verdict");
});

// ── the diff rides inside the payload, so its numbers are auditable ──────

test("a claim may cite sinceLast figures — but the same claim fails without them", () => {
  const withSince = {
    ...payload,
    sinceLast: {
      days: 7,
      changed: true,
      entries: [{ key: "score", label: "Score", from: 61, to: payload.score, delta: payload.score - 61, good: true }],
    },
  };
  const r = parseReading(JSON.stringify({
    ...cleanReading,
    claim: `The score climbed ${payload.score - 61} points from 61 since the last check.`,
  }));
  const out = auditReading(r, withSince);
  assert.equal(out.reading.claim, `The score climbed ${payload.score - 61} points from 61 since the last check.`);
  const noSince = auditReading(r, payload);
  assert.equal(noSince.reading.claim, null);
});

// pipeline: claim+risk+steps must all survive — anything less is unnarrated
test("unnarrated path: two model calls, narrated false, reading null", async () => {
  const bad = { headline: "fine headline here", claim: "99% invented figure", risk: "it could go badly", steps: ["do a thing"] };
  const anna = fakeAnna({ llm: () => ({ content: { type: "text", text: JSON.stringify(bad) }, stopReason: "endTurn" }) });
  const out = await readReport(anna, payload, "straight", "cleanup");
  assert.equal(out.narrated, false);
  assert.equal(out.reading, null);
  assert.equal(anna.calls.llm.length, 2);
});

test("a redraft that lands narrates on the second call", async () => {
  let n = 0;
  const bad = { headline: "fine headline here", claim: "a 99% invented figure", risk: "goes wrong", steps: ["do a thing"] };
  const anna = fakeAnna({
    llm: () => ({ content: { type: "text", text: JSON.stringify(n++ === 0 ? bad : cleanReading) }, stopReason: "endTurn" }),
  });
  const out = await readReport(anna, payload, "straight", "sponsor");
  assert.equal(out.narrated, true);
  assert.equal(anna.calls.llm.length, 2);
});
