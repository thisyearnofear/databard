#!/usr/bin/env node
/**
 * export-agent-service-quality — assembles the HF dataset entry for the
 * Beam × HF competition (docs/BEAM.md, Option B).
 *
 * Sources (read-only):
 *   data/probe-verdicts.json            — published Probe verdicts (rolling 50)
 *   data/marketplace-index/latest.json  — latest scored OKX.AI service index (if present)
 *   src/lib/okx-marketplace.snapshot.json — crawled listing metadata
 *
 * Output: data/exports/agent-service-quality/
 *   README.md          — HF dataset card
 *   verdicts.jsonl     — one Probe verdict per line
 *   service-index.jsonl— one scored service row per line (when an index exists)
 *   services.json      — raw crawled listing snapshot
 *
 * Usage: node scripts/export-agent-service-quality.mjs
 * On the VPS run it against /opt/databard (richer data) — same command.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = process.env.DATABARD_DATA_DIR || path.join(ROOT, "data");
const OUT = path.join(DATA, "exports", "agent-service-quality");
const DATASET_ID = process.env.HF_DATASET_ID || "databard/agent-service-quality"; // your HF org/user

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

const verdicts = readJson(path.join(DATA, "probe-verdicts.json")) ?? [];
const index = readJson(path.join(DATA, "marketplace-index", "latest.json"));
const snapshot = readJson(path.join(ROOT, "src", "lib", "okx-marketplace.snapshot.json"));

if (verdicts.length === 0 && !index && !snapshot) {
  console.error("Nothing to export — no verdicts, index, or snapshot found.");
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

// --- verdicts.jsonl (flatten ranked rows: one line per measured service) ---
const verdictRows = [];
for (const v of verdicts) {
  for (const r of v.ranked ?? []) {
    verdictRows.push({
      verdictId: v.id,
      verdictGeneratedAt: v.generatedAt,
      rank: r.rank,
      agentId: r.agentId,
      service: r.name,
      endpoint: r.endpoint,
      score: r.score,
      label: r.label,
      breakdown: r.breakdown,
      flags: r.flags,
      reachable: r.reachable,
      knownPriceUsd: r.knownPriceUsd,
      fromCache: r.fromCache,
      topPick: v.topPick === r.name,
    });
  }
}
fs.writeFileSync(
  path.join(OUT, "verdicts.jsonl"),
  verdictRows.map((r) => JSON.stringify(r)).join("\n") + (verdictRows.length ? "\n" : "")
);

// --- service-index.jsonl ---
let indexRows = 0;
if (index?.services?.length) {
  const rows = index.services.map((s) => ({
    serviceId: s.serviceId,
    agentId: s.agentId,
    agentName: s.agentName,
    serviceName: s.serviceName,
    endpoint: s.endpoint,
    feeUsd: s.feeUsd,
    category: s.category,
    ours: s.ours,
    score: s.score,
    status: s.status,
    checks: s.checks,
    flags: s.flags,
    latencyMs: s.latencyMs,
    httpStatus: s.httpStatus,
    verification: s.verification,
    subScores: s.subScores,
    uptimePct: s.uptimePct ?? null,
    protocol: s.protocol ?? null,
    toolCount: s.toolCount ?? null,
    paid: s.paid,
    lastPaidVerification: s.lastPaidVerification
      ? {
          at: s.lastPaidVerification.at,
          delivered: s.lastPaidVerification.delivered,
          outcome: s.lastPaidVerification.outcome ?? null,
          amountUsd: s.lastPaidVerification.amountUsd ?? null,
        }
      : null,
    indexGeneratedAt: index.generatedAt,
  }));
  fs.writeFileSync(path.join(OUT, "service-index.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  indexRows = rows.length;
}

// --- services.json (raw snapshot) ---
if (snapshot) {
  fs.writeFileSync(path.join(OUT, "services.json"), JSON.stringify(snapshot, null, 2));
}

// --- README.md dataset card ---
const generatedAt = new Date().toISOString();
const agg = index?.aggregates;
const card = `---
license: cc-by-4.0
task_categories:
  - tabular
  - other
tags:
  - agent-services
  - x402
  - mcp
  - service-quality
  - okx
size_categories:
  - n<1K
configs:
  - config_name: default
    data_files:
      - split: train
        path: "*.jsonl"
---

# Agent Service Quality — DataBard

Longitudinal, measured quality data for pay-per-call agent services (A2MCP /
MCP endpoints with x402 payment gates) on the OKX.AI marketplace, produced by
[DataBard](https://databard.persidian.com) — an AI data analyst registered as
Agent Service Provider #9878 on the same marketplace.

This dataset was assembled for the Beam × Hugging Face build contest alongside
our benchmark of [reflection/Beam-1.0-501B-A23B](https://huggingface.co/reflection/Beam-1.0-501B-A23B)
on DataBard's synthesis workload: [databard.persidian.com/benchmarks/beam](https://databard.persidian.com/benchmarks/beam).

## What's inside

- \`verdicts.jsonl\` — one row per measured service per weekly Probe verdict:
  composite 0–100 quality score, 6-dimension breakdown (schema completeness,
  latency, freshness, price/value, reliability, credentials), reachability,
  flags, and rank. ${verdictRows.length} rows from ${verdicts.length} published verdict(s).
- ${index ? `\`service-index.jsonl\` — one row per listed service from the latest marketplace health index: gate checks, delivery status, latency, uptime share, and (when run) paid-verification outcome. ${indexRows} rows.` : "`service-index.jsonl` — not generated on this host (no index run yet)."}
- \`services.json\` — the raw crawled listing snapshot (service metadata as
  registered on-chain): endpoints, fees, categories, descriptions.

## How it's measured

DataBard's Probe and marketplace index send real (unpaid) requests to every
listed endpoint: listing/payment-gate verification, x402 challenge decoding,
MCP handshake, latency, freshness. Paid verification happens only on scoped
briefings under a hard $1/day ledger. Rows marked \`ours: true\` are DataBard's
own services (ASP #9878) and are excluded from our public aggregates — they
are included here, labelled, for completeness.

**Honesty note:** index checks verify the listing and payment gate only — NOT
paid output quality. "Gate not reached" is a neutral flag, not an accusation.
Scores are computed, never curated.

## Fields of note

- \`score\` / \`breakdown\` — composite and per-dimension quality scores (0–100)
- \`status\` — healthy / degraded / broken / unreachable / unverified
- \`lastPaidVerification\` — outcome of the most recent paid call (delivered, thin, errored, payment_rejected, not_settled)
- \`knownPriceUsd\` / \`feeUsd\` — advertised per-call price

Generated ${generatedAt} by \`scripts/export-agent-service-quality.mjs\`.
Latest data lives at [databard.persidian.com/probe/marketplace](https://databard.persidian.com/probe/marketplace)
and [databard.persidian.com/probe/verdicts](https://databard.persidian.com/probe/verdicts).
`;
fs.writeFileSync(path.join(OUT, "README.md"), card);

console.log(`Exported to ${OUT}`);
console.log(`  verdicts.jsonl       ${verdictRows.length} rows (${verdicts.length} verdicts)`);
console.log(`  service-index.jsonl  ${indexRows} rows ${index ? "" : "(no index on this host)"}`);
console.log(`  services.json        ${snapshot ? `${snapshot.services?.length ?? 0} listings` : "(no snapshot)"}`);
console.log(`  README.md            dataset card`);
console.log(`\nUpload (after 'huggingface-cli login'):`);
console.log(`  huggingface-cli upload ${DATASET_ID} ${OUT} --repo-type dataset`);
