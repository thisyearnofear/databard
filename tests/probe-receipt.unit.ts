import {
  buildProbeReceiptEvidence,
  canonicalEndpointUrl,
  canonicalSubjectUri,
  createProbeReceiptArtifact,
  receiptStatusFor,
  stableStringify,
  subjectHashFor,
  RECEIPT_STATUS_CODES,
} from "../src/lib/probe-receipt";
import type { ProbeResult } from "../src/lib/probe-runner";
import { scoreProbe } from "../src/lib/probe-scorer";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

function makeResult(overrides: Partial<ProbeResult["metrics"]> = {}): ProbeResult {
  return {
    candidate: {
      name: "Example MCP",
      endpoint: "https://example.com/api/mcp",
      method: "POST",
      body: { jsonrpc: "2.0", id: "tools/list", method: "tools/list", params: {} },
      knownPriceUsd: 0,
    },
    metrics: {
      reachable: true,
      statusCode: 200,
      latencyMs: 400,
      hasInputSchema: true,
      hasExamples: false,
      hasDescription: true,
      toolCount: 2,
      hasTimestamp: false,
      timestampAgeMinutes: null,
      priceUsd: 0,
      responseFieldCount: 8,
      isDemo: false,
      hasError: false,
      credentialVerified: null,
      ...overrides,
    },
    rawSnippet: "{\"jsonrpc\":\"2.0\"}",
    statusCode: 200,
  };
}

// stableStringify is key-order independent.
{
  const a = stableStringify({ z: 1, a: { b: 2, a: [true, null] } });
  const b = stableStringify({ a: { a: [true, null], b: 2 }, z: 1 });
  assert(a === b, "stableStringify deterministic across key order");
}

// Canonical endpoint/subject/hash shapes are deterministic and contract-sized.
{
  const endpoint = canonicalEndpointUrl("HTTPS://EXAMPLE.com/api/mcp#fragment");
  assert(endpoint === "https://example.com/api/mcp", `canonical endpoint strips fragment/case (got ${endpoint})`);
  const subjectUri = canonicalSubjectUri(endpoint, "mcp");
  assert(subjectUri.startsWith("probe:mcp:https://example.com/api/mcp"), "canonical MCP subject");
  assert(/^0x[0-9a-f]{64}$/.test(subjectHashFor(subjectUri)), "subject hash is bytes32 hex");
}

// Healthy single-shot receipt artifact derives the exact contract input.
{
  const result = makeResult();
  const score = scoreProbe(result.metrics);
  const evidence = buildProbeReceiptEvidence(result, score, { measuredAt: "2026-11-27T12:00:00.000Z" });
  const artifact = createProbeReceiptArtifact(evidence, "https://databard.persidian.com/probe/receipts/example.json");
  assert(evidence.schema === "databard.probe-receipt.v1", "schema version set");
  assert(evidence.subject.protocol === "mcp", "JSON-RPC candidate inferred as MCP");
  assert(evidence.assessment.status === "healthy", `healthy status expected (got ${evidence.assessment.status})`);
  assert(/^0x[0-9a-f]{64}$/.test(artifact.evidenceHash), "evidence hash is bytes32 hex");
  assert(artifact.contractInput.status === RECEIPT_STATUS_CODES.healthy, "contract status mapped");
  assert(artifact.contractInput.checkedAt === Math.floor(Date.parse("2026-11-27T12:00:00.000Z") / 1000), "checkedAt seconds");
  assert(artifact.contractInput.subjectHash === subjectHashFor(evidence.subject.uri), "contract subject hash matches canonical URI");
  assert(stableStringify(evidence) === artifact.canonicalJson, "canonical JSON matches stable stringify");
  assert(
    evidence.methodology.caveats.some((caveat) => caveat.includes("tools/list interface response only")),
    "tools/list-only caveat is explicit"
  );
}

// Errored and unreachable probes never become healthy receipts.
{
  const errored = makeResult({ hasError: true });
  const erroredScore = scoreProbe(errored.metrics);
  assert(receiptStatusFor(errored, erroredScore) === "degraded", "errored reachable probe degraded");
  const unreachable = makeResult({ reachable: false, hasError: true });
  const unreachableScore = scoreProbe(unreachable.metrics);
  assert(receiptStatusFor(unreachable, unreachableScore) === "unreachable", "unreachable probe unreachable");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
