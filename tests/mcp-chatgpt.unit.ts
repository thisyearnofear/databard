/**
 * Unit tests for the ChatGPT Streamable HTTP MCP dispatcher
 * (src/lib/mcp-chatgpt-server.ts) — no live data source required.
 *
 * Run: npx tsx tests/mcp-chatgpt.unit.ts
 */
import assert from "node:assert/strict";
import {
  handleMcpJsonRpc,
  CHATGPT_TOOLS,
  HEALTH_CHECK_TOOL_NAME,
  MCP_PROTOCOL_VERSION,
} from "../src/lib/mcp-chatgpt-server";

let passed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  })();
}

async function main() {
  console.log("mcp-chatgpt.unit.ts");

  await check("tools catalog includes health_check with readOnlyHint", () => {
    assert.equal(CHATGPT_TOOLS.length, 1);
    assert.equal(CHATGPT_TOOLS[0].name, HEALTH_CHECK_TOOL_NAME);
    assert.equal(CHATGPT_TOOLS[0].annotations.readOnlyHint, true);
    assert.equal(CHATGPT_TOOLS[0].annotations.destructiveHint, false);
    assert.match(CHATGPT_TOOLS[0].description, /is my data healthy\?/i);
    assert.match(CHATGPT_TOOLS[0].description, /Do NOT use/i);
  });

  await check("initialize returns serverInfo + tools capability", async () => {
    const res = await handleMcpJsonRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    assert.ok(res);
    assert.equal(res!.error, undefined);
    const result = res!.result as {
      protocolVersion: string;
      capabilities: { tools: unknown };
      serverInfo: { name: string };
      instructions: string;
    };
    assert.equal(result.protocolVersion, MCP_PROTOCOL_VERSION);
    assert.ok(result.capabilities.tools);
    assert.equal(result.serverInfo.name, "databard");
    assert.match(result.instructions, /health_check/);
  });

  await check("notifications/initialized returns null (HTTP 202 path)", async () => {
    const res = await handleMcpJsonRpc({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    assert.equal(res, null);
  });

  await check("tools/list advertises health_check only", async () => {
    const res = await handleMcpJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.ok(res?.result);
    const tools = (res!.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] })
      .tools;
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "health_check");
    assert.equal(tools[0].annotations.readOnlyHint, true);
  });

  await check("tools/call demo health_check returns structured summary", async () => {
    const res = await handleMcpJsonRpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "health_check", arguments: { demo: true } },
    });
    assert.ok(res?.result);
    const result = res!.result as {
      isError?: boolean;
      content: { type: string; text: string }[];
      structuredContent: { ok: boolean; summary?: string; upgrade?: { kind?: string } };
    };
    assert.equal(result.isError, false);
    assert.ok(result.content[0]?.text);
    assert.equal(result.structuredContent.ok, true);
    assert.ok(result.structuredContent.summary);
    assert.equal(result.structuredContent.upgrade?.kind, "informational");
  });

  await check("alias is_my_data_healthy is accepted", async () => {
    const res = await handleMcpJsonRpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "is_my_data_healthy", arguments: { demo: true } },
    });
    assert.ok(res?.result);
    const result = res!.result as { isError?: boolean; structuredContent: { ok: boolean } };
    assert.equal(result.isError, false);
    assert.equal(result.structuredContent.ok, true);
  });

  await check("unknown tool returns JSON-RPC error", async () => {
    const res = await handleMcpJsonRpc({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "checkout_briefing", arguments: {} },
    });
    assert.ok(res?.error);
    assert.match(res!.error!.message, /Unknown tool/);
  });

  console.log(`\n${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
