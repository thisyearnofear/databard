import { extractProbeMetrics, parseSseJsonRpc } from "../src/lib/probe-runner";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const baseInput = {
  reachable: true,
  statusCode: 200,
  latencyMs: 400,
  bodyText: "",
  knownPriceUsd: 0,
};

// MCP JSON-RPC tools/list responses are measured by their result payload.
{
  const parsed = {
    jsonrpc: "2.0",
    id: "tools/list",
    result: {
      tools: [
        {
          name: "service_status",
          description: "Read the live service deployment status and counters.",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    },
  };
  const metrics = extractProbeMetrics({ ...baseInput, parsed });
  assert(metrics.hasInputSchema, "MCP result.tools inputSchema detected");
  assert(metrics.hasDescription, "MCP result.tools description detected");
  assert(metrics.toolCount === 1, `MCP tool count 1 (got ${metrics.toolCount})`);
  assert(metrics.responseFieldCount >= 5, `MCP tool-list richness counted (got ${metrics.responseFieldCount})`);
  assert(!metrics.hasError, "MCP result is not an error");
}

// JSON-RPC errors remain errors even when HTTP 200.
{
  const parsed = { jsonrpc: "2.0", id: "x", error: { code: -32601, message: "method not found" } };
  const metrics = extractProbeMetrics({ ...baseInput, parsed });
  assert(metrics.hasError, "JSON-RPC error envelope marked errored");
}

// SSE MCP responses expose their JSON-RPC payload to the same extractor.
{
  const sse = `event: message\ndata: {"jsonrpc":"2.0","id":"x",` +
    `\ndata: "result":{"tools":[{"name":"service_status","description":"Read service status","inputSchema":{"type":"object"}}]}}` +
    `\n\n`;
  const parsed = parseSseJsonRpc(sse) as Record<string, unknown>;
  assert(parsed?.jsonrpc === "2.0", "SSE JSON-RPC envelope parsed");
  const metrics = extractProbeMetrics({ ...baseInput, parsed });
  assert(metrics.toolCount === 1, `SSE MCP tool count 1 (got ${metrics.toolCount})`);
  assert(metrics.hasInputSchema, "SSE MCP input schema detected");
}

// Existing non-MCP shapes still measure directly.
{
  const parsed = {
    tools: [
      { name: "a", description: "A useful test tool", inputSchema: { type: "object", properties: { x: { type: "string" } } } },
      { name: "b", description: "Another useful test tool", schema: { type: "object" } },
    ],
  };
  const metrics = extractProbeMetrics({ ...baseInput, parsed });
  assert(metrics.toolCount === 2, `direct tools count 2 (got ${metrics.toolCount})`);
  assert(metrics.hasInputSchema, "direct tools inputSchema detected");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
