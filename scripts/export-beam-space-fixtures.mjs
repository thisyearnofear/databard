#!/usr/bin/env npx tsx
/**
 * export-beam-space-fixtures — freezes the Gradio Space's demo fixtures
 * (space/fixtures/) from the SAME code paths production uses, so the Space's
 * featured analyses run on byte-identical prompts. Run: npx tsx scripts/export-beam-space-fixtures.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPACE = path.join(ROOT, "space");

const { getDemoSchema } = await import("../src/lib/market/demo-fixtures.ts");
const { analyzeSchema } = await import("../src/lib/schema-analysis.ts");
const { SYSTEM_PROMPT, EXECUTIVE_SUMMARY_PROMPT, buildUserPrompt } = await import(
  "../src/lib/script-generator.ts"
);

const FIXTURES = [
  { id: "web3", label: "Uniswap V3 subgraph", audio: "demo-episode-dune.mp3" },
  { id: "ecommerce", label: "Acme e-commerce warehouse", audio: "demo-episode.mp3" },
];

fs.mkdirSync(path.join(SPACE, "fixtures"), { recursive: true });

// Shared system prompts — the custom-DDL path uses these too.
fs.writeFileSync(
  path.join(SPACE, "fixtures", "prompts.json"),
  JSON.stringify(
    { podcast_system: SYSTEM_PROMPT, executive_system: EXECUTIVE_SUMMARY_PROMPT,
      exportedAt: new Date().toISOString(), source: "src/lib/script-generator.ts" },
    null, 2
  )
);

for (const f of FIXTURES) {
  const schema = await getDemoSchema(f.id);
  const insights = analyzeSchema(schema);
  const out = {
    id: f.id,
    label: f.label,
    audio: f.audio,
    schema,
    insights,
    prompts: {
      podcast: {
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(schema, insights, { format: "podcast" }),
      },
      executive: {
        system: EXECUTIVE_SUMMARY_PROMPT,
        user: buildUserPrompt(schema, insights, { format: "executive-summary" }),
      },
    },
  };
  fs.writeFileSync(path.join(SPACE, "fixtures", `${f.id}.json`), JSON.stringify(out));
  console.log(`fixture ${f.id}: ${schema.tables.length} tables, score ${insights.healthScore}, prompts frozen`);
  // Featured audio (existing production demo episodes — zero TTS cost)
  const src = path.join(ROOT, "public", f.audio);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(SPACE, f.audio));
    console.log(`  audio: ${f.audio} (${(fs.statSync(src).size / 1e6).toFixed(1)}MB)`);
  }
}
console.log(`\nWrote ${SPACE}/fixtures/ + audio`);
