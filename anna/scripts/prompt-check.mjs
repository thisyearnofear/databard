// Real-model check of the DataBard reading without spending Anna quota.
// Runs bundle/reading.js readReport() unchanged on the three shipped
// samples, for chosen purposes and tones, against a stand-in llm.complete.
//
//   node scripts/prompt-check.mjs [--provider=gemini|reflection] [--headroom=1]
//        [--purposes=sponsor,send] [--tones=straight,roast] [--samples=messy,stale] [--env=a.env,b.env] [--json=out.json] [--record=dir]
//
// Keys: GEMINI_API_KEY or REFLECTION_API_KEY from the environment, ../.env,
// ./.env.local or any --env file. One run = up to 2 model calls.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, analyzeCommunityData, SAMPLES } from "../bundle/community-health.js";
import { reportPayload, readReport, PURPOSES, TONES } from "../bundle/reading.js";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "true"] : [a, "true"];
  }),
);
const env = { ...process.env };
for (const f of [join(here, "../../.env"), join(here, "../.env.local"), ...(args.env ?? "").split(",")].filter(Boolean)) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const PROVIDERS = {
  gemini: {
    key: env.GEMINI_API_KEY,
    base: env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
    model: env.GEMINI_MODEL || "gemini-3-flash-preview",
    extra: { reasoning_effort: env.LLM_REASONING_EFFORT || "minimal" },
  },
  reflection: {
    key: env.REFLECTION_API_KEY,
    base: env.REFLECTION_BASE_URL || "https://api.reflection.ai/openai/v1",
    model: env.LOOP_REFLECTION_MODEL || "Beam-1.0-501B-A23B",
    extra: {},
  },
};
const provider = PROVIDERS[args.provider ?? "gemini"];
if (!provider?.key) {
  console.error("Need the chosen provider's key (env, ../.env, .env.local, or --env=<file>).");
  process.exit(2);
}
const TEMPERATURE = Number(env.LLM_TEMPERATURE ?? 0.7); // Anna's llm.complete default
const HEADROOM = Number(args.headroom ?? 1);
const purposes = (args.purposes ?? "sponsor,send").split(",").filter((p) => PURPOSES.includes(p));
const tones = (args.tones ?? "straight").split(",").filter((t) => TONES.includes(t));

function host(stats) {
  return {
    llm: {
      complete: async ({ messages, maxTokens }) => {
        const res = await fetch(`${provider.base}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}` },
          body: JSON.stringify({
            model: provider.model, max_tokens: Math.round(maxTokens * HEADROOM), temperature: TEMPERATURE,
            ...provider.extra, messages: messages.map((m) => ({ role: m.role, content: m.content.text })),
          }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) throw new Error(`llm ${res.status}: ${(await res.text()).slice(0, 160)}`);
        const json = await res.json();
        const choice = json.choices?.[0] ?? {};
        stats.calls++;
        if (choice.finish_reason === "length") stats.truncated++;
        const out = {
          content: { type: "text", text: choice.message?.content ?? "" },
          stopReason: choice.finish_reason === "length" ? "maxTokens" : "endTurn",
        };
        stats.replies.push(out);
        return out;
      },
    },
  };
}

console.log(`model ${provider.model} · temperature ${TEMPERATURE} · maxTokens ×${HEADROOM}\n`);
const rows = [];
const only = args.samples ? args.samples.split(",") : null;
for (const sample of SAMPLES.filter((x) => !only || only.includes(x.key))) {
  const { header, rows: data } = parseCsv(sample.csv);
  const payload = reportPayload(analyzeCommunityData(header, data));
  for (const purpose of purposes) for (const tone of tones) {
    const stats = { calls: 0, truncated: 0, replies: [] };
    let out, error = null;
    try { out = await readReport(host(stats), payload, tone, purpose); } catch (e) { error = e.message; }
    const { replies, ...counts } = stats;
    // --record=<dir>: the raw model replies of this run, in call order.
    if (args.record && out?.narrated) {
      mkdirSync(args.record, { recursive: true });
      writeFileSync(
        join(args.record, `${sample.key}-${purpose}-${tone}.json`),
        JSON.stringify({ model: provider.model, recordedAt: new Date().toISOString(), sample: sample.key, purpose, tone, replies }, null, 2),
      );
    }
    const row = {
      sample: sample.key, purpose, tone, score: payload.score, ...counts,
      narrated: Boolean(out?.narrated), dropped: out?.dropped ?? [], reading: out?.reading ?? null, error,
    };
    rows.push(row);
    console.log(`${sample.key}/${purpose}/${tone} score=${payload.score} narrated=${row.narrated} calls=${row.calls} truncated=${row.truncated} dropped=${row.dropped.length}${error ? ` ERROR ${error}` : ""}`);
    for (const d of row.dropped) console.log(`   dropped ${d.field}: ${d.reason}`);
    if (row.reading) {
      console.log(`   headline: ${row.reading.headline}`);
      console.log(`   claim:    ${row.reading.claim}`);
      console.log(`   risk:     ${row.reading.risk}`);
      (row.reading.steps ?? []).forEach((s, i) => console.log(`   step ${i + 1}:   ${s}`));
    }
  }
}
const n = rows.length;
console.log(`\nnarrated ${rows.filter((r) => r.narrated).length}/${n} · first-call success ${rows.filter((r) => r.narrated && r.calls === 1).length}/${n} · with dropped fields ${rows.filter((r) => r.narrated && r.dropped.length).length} · truncated calls ${rows.reduce((a, r) => a + r.truncated, 0)}`);
if (args.json) writeFileSync(args.json, JSON.stringify(rows, null, 2));
