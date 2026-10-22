#!/usr/bin/env npx tsx
/**
 * Beam benchmark harness — "Beam as a data analyst" (docs/BEAM.md).
 *
 * Runs DataBard's real synthesis workload (the exact production prompts from
 * src/lib/script-generator.ts) through candidate models and grades the output
 * the same way the production pipeline does: JSON parse, segment shape,
 * speaker validity, health-score grounding, research-question attention.
 *
 * Usage:
 *   npx tsx scripts/beam-bench.mjs [--models beam,prod] [--runs 2] [--out data/beam-bench.json]
 *
 * Models:
 *   beam       — Reflection API (free daily allowance), Beam-1.0-501B-A23B
 *   openrouter — OpenRouter's Beam listing (account currently has $0 credits)
 *   prod       — the production synthesis model (OPENAI_* env)
 *
 * Cost: the default route (beam) spends nothing — Reflection's beta plan has
 * a free daily allowance (10M input / 1M output / 20k requests per day).
 * Beam is a thinking model; beamBudget() inflates max_tokens so reasoning
 * never starves the visible content.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const text = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (m && m[1] === name) return m[2].trim().replace(/^"|"$/g, "");
    }
  } catch {}
  return undefined;
}

// CLI flags
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const modelIds = flag("models", "beam,prod").split(",").map((s) => s.trim()).filter(Boolean);
const RUNS = Math.max(1, parseInt(flag("runs", "2"), 10));
const OUT = flag("out", path.join(ROOT, "data", "beam-bench.json"));

const { getDemoSchema } = await import("../src/lib/market/demo-fixtures.ts");
const { analyzeSchema } = await import("../src/lib/schema-analysis.ts");
const { SYSTEM_PROMPT, EXECUTIVE_SUMMARY_PROMPT, buildUserPrompt } = await import(
  "../src/lib/script-generator.ts"
);
const { openaiCompatChatDetailed, parseJsonFromText, beamBudget } = await import(
  "../src/lib/llm-providers.ts"
);

// ---- model registry -------------------------------------------------------

const MODELS = {
  beam: {
    label: "Beam 1.0 501B-A23B (Reflection API)",
    baseUrl: (readEnv("REFLECTION_BASE_URL") || "https://api.reflection.ai/openai/v1").replace(/\/+$/, ""),
    apiKey: readEnv("REFLECTION_API_KEY"),
    model: readEnv("LOOP_REFLECTION_MODEL") || "Beam-1.0-501B-A23B",
    thinking: true,
  },
  openrouter: {
    label: "Beam 1.0 501B-A23B (OpenRouter)",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: readEnv("OPENROUTER_API_KEY"),
    model: readEnv("LOOP_OPENROUTER_MODEL") || "reflection/beam-1.0-501b-a23b",
    thinking: true,
  },
  prod: {
    label: `Production synthesis model (${readEnv("OPENAI_MODEL") || "gpt-4o-mini"})`,
    baseUrl: (readEnv("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, ""),
    apiKey: readEnv("OPENAI_API_KEY"),
    model: readEnv("OPENAI_MODEL") || "gpt-4o-mini",
    thinking: false,
  },
};

// ---- tasks -----------------------------------------------------------------

const QUESTIONS = {
  web3: "Which tables carry the biggest cascading risk if they fail?",
  ecommerce: "Where are the governance gaps in this warehouse?",
};

const TASKS = [
  { id: "web3-podcast", fixture: "web3", format: "podcast" },
  { id: "ecom-podcast", fixture: "ecommerce", format: "podcast" },
  { id: "web3-exec", fixture: "web3", format: "executive-summary" },
  { id: "ecom-exec", fixture: "ecommerce", format: "executive-summary" },
  { id: "web3-question", fixture: "web3", format: "podcast", question: QUESTIONS.web3 },
  { id: "ecom-question", fixture: "ecommerce", format: "podcast", question: QUESTIONS.ecommerce },
];

const SEG_RANGE = { podcast: [12, 25], "executive-summary": [5, 8] };

// ---- grading ----------------------------------------------------------------

function gradeScript(raw, task, healthScore) {
  const checks = {};
  let segments = null;
  let failMode = null;
  try {
    const parsed = parseJsonFromText(raw);
    if (Array.isArray(parsed)) segments = parsed;
    else if (parsed && typeof parsed === "object") segments = parsed.segments ?? parsed.script ?? null;
    if (!segments) failMode = Array.isArray(parsed) ? "empty-array" : "object-not-array";
    checks.jsonValid = Array.isArray(segments) && segments.length > 0;
  } catch {
    checks.jsonValid = false;
    failMode = "unparseable";
  }
  if (!checks.jsonValid) {
    return {
      failMode,
      checks: { ...checks, segmentCountInRange: false, speakersValid: false, textSane: false,
        mentionsHealthScore: false, ...(task.question ? { mentionsQuestion: false } : {}) },
      stats: { segments: 0, words: 0 },
    };
  }

  const [lo, hi] = SEG_RANGE[task.format];
  checks.segmentCountInRange = segments.length >= lo && segments.length <= hi;
  checks.speakersValid = segments.every((s) => s?.speaker === "Alex" || s?.speaker === "Morgan");
  const texts = segments.map((s) => String(s?.text ?? "").trim());
  const words = texts.join(" ").split(/\s+/).filter(Boolean).length;
  const avgWords = words / segments.length;
  checks.textSane = texts.every((t) => t.length > 0) && avgWords >= 8 && avgWords <= 90;
  checks.mentionsHealthScore = raw.includes(String(healthScore));
  if (task.question) {
    const keywords = task.question.toLowerCase().split(/\W+/).filter((w) => w.length > 5);
    const body = texts.join(" ").toLowerCase();
    checks.mentionsQuestion = keywords.some((k) => body.includes(k));
  }
  return { checks, stats: { segments: segments.length, words: Math.round(words), avgWords: Math.round(avgWords) } };
}

// ---- run ---------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runOne(modelId, model, task, runIdx) {
  const schema = await getDemoSchema(task.fixture);
  const insights = analyzeSchema(schema);
  const system = task.format === "executive-summary" ? EXECUTIVE_SUMMARY_PROMPT : SYSTEM_PROMPT;
  const user = buildUserPrompt(schema, insights, {
    researchQuestion: task.question,
    format: task.format,
  });
  let input = { system, user, temperature: 0.8, json: true, timeoutMs: 120_000, maxTokens: 8000 };
  if (model.thinking) input = beamBudget(input);

  const started = Date.now();
  try {
    const res = await openaiCompatChatDetailed(model.baseUrl, model.apiKey, model.model, input);
    const { checks, stats, failMode } = gradeScript(res.text, task, insights.healthScore);
    const passed = Object.values(checks).filter(Boolean).length;
    return {
      task: task.id, model: modelId, run: runIdx, ok: true,
      latencyMs: res.ms, wallMs: Date.now() - started,
      usage: res.usage ?? null, finishReason: res.finishReason ?? null,
      checks, stats,
      failMode: failMode ?? null,
      score: passed / Object.keys(checks).length,
      outputChars: res.text.length,
    };
  } catch (e) {
    return {
      task: task.id, model: modelId, run: runIdx, ok: false,
      error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
      latencyMs: Date.now() - started, wallMs: Date.now() - started,
      checks: {}, stats: { segments: 0, words: 0 }, score: 0,
    };
  }
}

function aggregate(results) {
  const byModel = {};
  for (const r of results) {
    const agg = (byModel[r.model] ??= { runs: 0, ok: 0, scoreSum: 0, latencySum: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, perTask: {} });
    agg.runs += 1;
    if (r.ok) { agg.ok += 1; agg.scoreSum += r.score; agg.latencySum += r.latencyMs; }
    agg.tokensIn += r.usage?.promptTokens ?? 0;
    agg.tokensOut += r.usage?.completionTokens ?? 0;
    agg.reasoningTokens += r.usage?.reasoningTokens ?? 0;
    const t = (agg.perTask[r.task] ??= { runs: 0, scoreSum: 0, ok: 0 });
    t.runs += 1; t.scoreSum += r.score; if (r.ok) t.ok += 1;
  }
  for (const m of Object.values(byModel)) {
    m.passRate = m.ok / m.runs;
    m.meanScore = m.ok > 0 ? m.scoreSum / m.ok : 0;
    m.meanLatencyMs = m.ok > 0 ? Math.round(m.latencySum / m.ok) : null;
    for (const t of Object.values(m.perTask)) t.meanScore = t.scoreSum / t.runs;
  }
  return byModel;
}

// ---- main ---------------------------------------------------------------------

const active = modelIds.filter((id) => {
  const m = MODELS[id];
  if (!m) { console.warn(`unknown model '${id}' — skipping`); return false; }
  if (!m.apiKey) { console.warn(`no API key for '${id}' — skipping`); return false; }
  return true;
});
if (active.length === 0) {
  console.error("No runnable models. Set REFLECTION_API_KEY and/or OPENAI_API_KEY in .env");
  process.exit(1);
}

console.log(`Beam bench — models: ${active.join(", ")} · ${RUNS} run(s) each · ${TASKS.length} tasks`);
const results = [];
for (const task of TASKS) {
  for (const modelId of active) {
    for (let i = 1; i <= RUNS; i++) {
      const r = await runOne(modelId, MODELS[modelId], task, i);
      const checkLine = Object.entries(r.checks).map(([k, v]) => `${v ? "✓" : "✗"}${k}`).join(" ");
      console.log(
        `[${task.id} ${modelId} #${i}] ${r.ok ? `${(r.score * 100).toFixed(0)}% ${r.latencyMs}ms ${r.stats.segments}seg ${r.usage?.completionTokens ?? "?"}tok` : `FAIL ${r.error}`} ${checkLine}`
      );
      results.push(r);
      await sleep(1500); // stay well under Reflection's 60 req/min
    }
  }
}

const summary = aggregate(results);
const report = {
  generatedAt: new Date().toISOString(),
  harness: "scripts/beam-bench.mjs",
  config: { runsPerTask: RUNS, models: modelIds },
  models: Object.fromEntries(
    active.map((id) => [id, { label: MODELS[id].label, model: MODELS[id].model, thinking: MODELS[id].thinking }])
  ),
  tasks: TASKS.map((t) => ({
    id: t.id, fixture: t.fixture, format: t.format, researchQuestion: t.question ?? null,
  })),
  summary,
  results,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\nWrote ${OUT}`);
for (const [id, agg] of Object.entries(summary)) {
  console.log(
    `  ${id.padEnd(12)} pass ${(agg.passRate * 100).toFixed(0)}% · mean score ${(agg.meanScore * 100).toFixed(0)}% · mean latency ${agg.meanLatencyMs ?? "—"}ms · out ${agg.tokensOut} tok (reasoning ${agg.reasoningTokens})`
  );
}
