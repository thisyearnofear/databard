#!/usr/bin/env tsx
/**
 * Measure the first Probe Receipt candidates and write canonical evidence JSON.
 * No payments are enabled: this is a free, single-shot measurement pass.
 *
 * Usage:
 *   tsx scripts/probe-receipt-measure.mts [outDir] [evidenceBaseUrl]
 */
import fs from "node:fs";
import path from "node:path";
import { probeAll, type ProbeCandidate } from "../src/lib/probe-runner";
import { scoreProbe } from "../src/lib/probe-scorer";
import {
  buildProbeReceiptEvidence,
  createProbeReceiptArtifact,
} from "../src/lib/probe-receipt";

const MCP_TOOLS_LIST = {
  jsonrpc: "2.0",
  id: "databard-probe-tools-list",
  method: "tools/list",
  params: {},
};

export const AGENT_ID_RECEIPT_CANDIDATES: ProbeCandidate[] = [
  {
    name: "Reckon MCP",
    endpoint: "https://reckon.markets/api/mcp",
    method: "POST",
    body: MCP_TOOLS_LIST,
    knownPriceUsd: 0,
  },
  {
    name: "MintBeacon MCP",
    endpoint: "https://mintbeacon-mcp.wisp.uno/mcp",
    method: "POST",
    body: MCP_TOOLS_LIST,
    knownPriceUsd: 0,
  },
  {
    name: "Pokter MCP",
    endpoint: "https://pokter.xyz/api/mcp",
    method: "POST",
    body: MCP_TOOLS_LIST,
    knownPriceUsd: 0,
  },
];

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const outDir = path.resolve(process.argv[2] || "data/probe-receipts");
const evidenceBaseUrl = (
  process.argv[3] ||
  process.env.PROBE_RECEIPT_EVIDENCE_BASE_URL ||
  "https://databard.persidian.com/probe/receipts"
).replace(/\/$/, "");

fs.mkdirSync(outDir, { recursive: true });

const measuredAt = new Date().toISOString();
const results = await probeAll(AGENT_ID_RECEIPT_CANDIDATES, {
  concurrency: 2,
  allowPayments: false,
});

const manifest = [];
for (const result of results) {
  const score = scoreProbe(result.metrics);
  const evidence = buildProbeReceiptEvidence(result, score, {
    measuredAt,
    paymentsAllowed: false,
  });
  // The filename is hash-bearing, but the hash is computed over the canonical
  // evidence only — never over the URL at which the evidence is hosted.
  const provisional = createProbeReceiptArtifact(evidence, "https://evidence.invalid/pending.json");
  const filename = `${slugify(result.candidate.name)}-${provisional.contentHash.slice(2, 12)}.json`;
  const evidenceUri = `${evidenceBaseUrl}/${filename}`;
  const artifact = createProbeReceiptArtifact(evidence, evidenceUri);
  const filePath = path.join(outDir, filename);
  fs.writeFileSync(filePath, artifact.canonicalJson);

  manifest.push({
    service: result.candidate.name,
    evidenceFile: path.relative(process.cwd(), filePath),
    evidenceUri,
    contentHash: artifact.contentHash,
    evidenceHash: artifact.evidenceHash,
    subjectUri: evidence.subject.uri,
    subjectHash: artifact.contractInput.subjectHash,
    score: artifact.contractInput.score,
    status: artifact.contractInput.status,
    statusLabel: evidence.assessment.status,
    checkedAt: artifact.contractInput.checkedAt,
    httpStatus: result.statusCode,
    latencyMs: result.metrics.latencyMs,
    error: result.error,
  });
}

const manifestPath = path.join(outDir, "manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: measuredAt, receipts: manifest }, null, 2) + "\n");
console.log(JSON.stringify({ manifestPath, receipts: manifest }, null, 2));
