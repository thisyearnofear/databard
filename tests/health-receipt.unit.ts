import { it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/mcp/health-check/route";
import { GET } from "../src/app/api/mcp/tools/route";
import { verifyEvidenceReceipt } from "../src/lib/evidence-receipt";

it("health-check emits a verifiable, explicitly demo receipt without connector secrets", async () => {
  const req = new NextRequest("http://localhost/api/mcp/health-check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      demo: true, source: "datahub", schemaFqn: "private.requested",
      datahub: { serverUrl: "https://private-connector.invalid", token: "secret-never-in-receipt" },
    }),
  });
  const res = await POST(req);
  assert.equal(res.status, 200);
  const { evidenceReceipt, ...result } = await res.json();
  assert.ok(verifyEvidenceReceipt(evidenceReceipt, { result }));
  assert.ok(evidenceReceipt.payload.request && typeof evidenceReceipt.payload.request === "object" && !Array.isArray(evidenceReceipt.payload.request));
  assert.ok(evidenceReceipt.payload.evidence && typeof evidenceReceipt.payload.evidence === "object" && !Array.isArray(evidenceReceipt.payload.evidence));
  assert.equal(result.serviceVersion, 2);
  assert.equal(result.demo, true);
  assert.equal(evidenceReceipt.payload.request.source, "datahub");
  assert.equal(evidenceReceipt.payload.request.schemaFqn, "private.requested");
  assert.equal(evidenceReceipt.payload.evidence.demo, true);
  assert.equal(evidenceReceipt.payload.evidence.source, "demo-fixture");
  assert.notEqual(evidenceReceipt.payload.evidence.schemaFqn, "private.requested");
  assert.ok(evidenceReceipt.payload.evidence.observedAt);
  assert.equal(evidenceReceipt.payload.generatedAt, result.generatedAt);
  const json = JSON.stringify(evidenceReceipt);
  assert.ok(!json.includes("secret-never-in-receipt"));
  assert.ok(!json.includes("private-connector.invalid"));
  assert.equal(verifyEvidenceReceipt(evidenceReceipt, { result: { ...result, demo: false } }), false);
});

it("discovery advertises the receipt only on the implemented health-check tool", async () => {
  const response = await GET();
  const body = await response.json();
  const health = body.tools.find((tool: { name: string }) => tool.name === "databard_health_check");
  const briefing = body.tools.find((tool: { name: string }) => tool.name === "databard_briefing");
  assert.equal(health.outputSchema.properties.evidenceReceipt.properties.version.const, 1);
  assert.equal(briefing.outputSchema.properties.evidenceReceipt, undefined);
});
