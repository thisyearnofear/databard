// Smoke — score → reading → audit → saved result, against the fake host.
// Run with: node anna/test/smoke.mjs

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

import { parseCsv, analyzeCommunityData, SAMPLES } from "../bundle/community-health.js";
import { reportPayload, buildReadingPrompt, readReport, quotaMessage } from "../bundle/reading.js";
import { writeCheckpoint, readActiveTask, saveReading, readLastReading } from "../bundle/recovery.js";
import { fakeAnna } from "./fake-anna.js";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "..", "manifest.json"), "utf8"));

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const { header, rows } = parseCsv(SAMPLES[0].csv);
const payload = reportPayload(analyzeCommunityData(header, rows));

const cleanReading = {
  headline: `The "email" column is doing the damage`,
  claim: `The sheet holds ${payload.rowCount} rows across ${payload.columnCount} columns.`,
  risk: `Gaps, not people, are the story here.`,
  steps: [payload.actions[0] ?? "Add an email column."],
};
const llmReading = (req) => ({
  content: { type: "text", text: JSON.stringify(cleanReading) },
  stopReason: "endTurn",
});

// ── manifest sanity ──────────────────────────────────────────────────────
ok("schema 4 bundle-only app", manifest.schema === 4 && manifest.required_executas.length === 0);
ok("user-scope storage declared", manifest.storage?.scopes?.user === "rw");
ok("static-spa bundle, no external origins", manifest.ui?.bundle?.format === "static-spa" && manifest.ui?.bundle?.external_origins?.length === 0);
ok("both form factors", manifest.ui?.form_factors?.includes("desktop") && manifest.ui?.form_factors?.includes("mobile"));

// ── 1. happy path: score → checkpoint → reading → audit → saved ─────────
{
  const anna = fakeAnna({ llm: llmReading });
  await writeCheckpoint(anna, { v: 1, id: "run-1", stage: "reading", tone: "straight", purpose: "cleanup", payload });
  const { checkpoint } = await readActiveTask(anna);
  ok("checkpoint sealed before the model call", checkpoint?.stage === "reading");

  const out = await readReport(anna, checkpoint.payload, checkpoint.tone, checkpoint.purpose);
  ok("one model call on the happy path", anna.calls.llm.length === 1);
  ok("reading narrated", out.narrated === true);

  const record = { payload, reading: out.reading, narrated: out.narrated, tone: "straight", purpose: "cleanup", at: Date.now() };
  await saveReading(anna, record);
  const back = await readLastReading(anna);
  ok("reading saved and reopens", back?.reading?.headline === cleanReading.headline);

  const prompt = anna.calls.llm[0].messages[0].content.text;
  ok("prompt carries the payload, not rows", prompt.includes(JSON.stringify(payload.score)) && !prompt.includes("amara.osei"));
  ok("maxTokens within the sync cap", anna.calls.llm[0].maxTokens <= 8192);
}

// ── 2. unnarrated path: model keeps inventing → saved with narrated:false ─
{
  const bad = { headline: "fine headline here", claim: "a 99% invented figure", risk: "goes wrong", steps: ["do a thing"] };
  const anna = fakeAnna({
    llm: () => ({ content: { type: "text", text: JSON.stringify(bad) }, stopReason: "endTurn" }),
  });
  const out = await readReport(anna, payload, "roast", "send");
  ok("unnarrated after two calls", out.narrated === false && anna.calls.llm.length === 2);
  const record = { payload, reading: null, narrated: false, tone: "roast", purpose: "send", at: Date.now() };
  await saveReading(anna, record);
  const back = await readLastReading(anna);
  ok("unnarrated result saved honestly", back?.narrated === false && back?.reading === null);
}

// ── 3. the payload carries zero member data end to end ───────────────────
{
  const anna = fakeAnna({ llm: llmReading });
  await readReport(anna, payload, "straight", "cleanup");
  const wire = JSON.stringify(anna.calls.llm);
  const { rows: raw } = parseCsv(SAMPLES[0].csv);
  const emails = raw.flat().filter((c) => c.includes("@"));
  ok("no sample email reaches the model", emails.every((e) => !wire.includes(e)));
}

// ── 4. quota precheck failure propagates with the numbers ────────────────
{
  const anna = fakeAnna({
    llm: () => {
      const e = new Error("quota exceeded");
      e.code = "APP_QUOTA_EXCEEDED";
      e.data = { requiredCu: 3.6, remainingCu: 0.9 };
      throw e;
    },
  });
  await assert.rejects(
    readReport(anna, payload, "straight", "cleanup"),
    (e) => e.code === "APP_QUOTA_EXCEEDED" && e.data.remainingCu === 0.9,
  );
  passed += 1;
  console.log(`ok ${passed} - APP_QUOTA_EXCEEDED is not swallowed as a rejection`);
  ok("one call only — quota is not retried", anna.calls.llm.length === 1);
  ok("quotaMessage carries the numbers",
    quotaMessage({ code: "APP_QUOTA_EXCEEDED", data: { requiredCu: 3.6, remainingCu: 0.9 } })
      === "Your Anna quota is too low for this run — it needs about 3.6 CU, you have 0.9.");
}

// ── 5. the prompt forbids inventing community facts ──────────────────────
{
  const p = buildReadingPrompt(payload, "straight", "cleanup");
  ok("no-invented-facts rule present",
    p.includes("Do not invent facts about the community"));
}

// ── 6. truncation retry + thinking off ───────────────────────────────────
{
  let n = 0;
  const anna = fakeAnna({
    llm: () => {
      n += 1;
      return n === 1
        ? { content: { type: "text", text: "{\"headline\":" }, stopReason: "maxTokens" }
        : { content: { type: "text", text: JSON.stringify(cleanReading) }, stopReason: "endTurn" };
    },
  });
  const out = await readReport(anna, payload, "straight", "sponsor");
  ok("truncated first reading -> long retry succeeds", out.reading !== null && anna.calls.llm.length === 2);
  ok("first cap 4096, long retry 12000",
    anna.calls.llm[0].maxTokens === 4096 && anna.calls.llm[1].maxTokens === 12000);
  ok("thinking off on every call",
    anna.calls.llm.every((c) => c.thinking === false));
}
{
  let n = 0;
  const anna = fakeAnna({
    llm: () => {
      n += 1;
      if (n === 1) return { content: { type: "text", text: "{\"headline\":" }, stopReason: "maxTokens" };
      const e = new Error("quota exceeded");
      e.code = "APP_QUOTA_EXCEEDED";
      e.data = { requiredCu: 5, remainingCu: 1 };
      throw e;
    },
  });
  try {
    await readReport(anna, payload, "straight", "sponsor");
    ok("quota on long retry surfaces", false);
  } catch (e) {
    ok("quota on long retry surfaces", e.code === "APP_QUOTA_EXCEEDED");
  }
  ok("quota on long retry is not retried again", anna.calls.llm.length === 2);
}

console.log(`\nsmoke: ${passed} checks passed`);
