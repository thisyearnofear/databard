/**
 * ChatGPT-ready MCP tool surface (Streamable HTTP JSON-RPC).
 *
 * Exposes a narrow free set: `health_check` (alias `is_my_data_healthy`).
 * Paid briefing / x402 stay on product URLs — not in this free ChatGPT set.
 *
 * Wire format: MCP Streamable HTTP (JSON responses; GET SSE not offered → 405).
 * Spec reference: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
 */

import { runHealthCheck, PLANS_URL, PRODUCT_ORIGIN } from "@/lib/mcp-health-check";

export const MCP_SERVER_NAME = "databard";
export const MCP_SERVER_VERSION = "1.0.0";
/** Prefer the 2025-03-26 streamable HTTP revision ChatGPT/Codex commonly speak. */
export const MCP_PROTOCOL_VERSION = "2025-03-26";

export const HEALTH_CHECK_TOOL_NAME = "health_check";
export const HEALTH_CHECK_TOOL_ALIASES = ["is_my_data_healthy", "databard_health_check"] as const;

const connectionInputSchema = {
  type: "object",
  description:
    "Optional data-source connection. Omit everything (or set demo:true) for a clearly-labelled sample schema analysis — useful when the user has not shared catalogue credentials yet.",
  properties: {
    source: {
      type: "string",
      enum: ["openmetadata", "dbt-cloud", "dbt-local", "the-graph", "dune", "coral", "datahub", "monid"],
      description: "Which catalogue adapter to use. Defaults to openmetadata when omitted.",
    },
    schemaFqn: {
      type: "string",
      description:
        'Fully-qualified schema name, e.g. "db.sales", "prod.analytics". If omitted, a demo schema is analysed.',
    },
    demo: {
      type: "boolean",
      description: "Force the labelled demo analysis without contacting any data source.",
    },
    openmetadata: {
      type: "object",
      properties: { url: { type: "string" }, token: { type: "string" } },
      required: ["url", "token"],
    },
    datahub: {
      type: "object",
      properties: { serverUrl: { type: "string" }, token: { type: "string" } },
      required: ["serverUrl"],
    },
    dbtCloud: {
      type: "object",
      properties: { accountId: { type: "string" }, projectId: { type: "string" }, token: { type: "string" } },
      required: ["accountId", "projectId", "token"],
    },
    dbtLocal: {
      type: "object",
      properties: { manifestPath: { type: "string" }, manifestContent: { type: "string" } },
    },
    theGraph: {
      type: "object",
      properties: { subgraphUrl: { type: "string" }, apiKey: { type: "string" } },
      required: ["subgraphUrl"],
    },
    dune: {
      type: "object",
      properties: { apiKey: { type: "string" }, namespace: { type: "string" } },
      required: ["apiKey"],
    },
    coral: {
      type: "object",
      properties: {
        query: { type: "string" },
        localFiles: {
          type: "array",
          items: { type: "object", properties: { path: { type: "string" }, name: { type: "string" } } },
        },
      },
      required: ["query"],
    },
    monid: {
      type: "object",
      properties: {
        apiKey: { type: "string" },
        provider: { type: "string" },
        endpoint: { type: "string" },
        inputs: { type: "object", additionalProperties: true },
        query: { type: "object", additionalProperties: { type: "string" } },
        path: { type: "object", additionalProperties: { type: "string" } },
        wait: { type: "boolean" },
      },
      required: ["provider", "endpoint"],
    },
  },
  additionalProperties: true,
} as const;

/** Tool metadata advertised on tools/list — descriptions in the user's words. */
export const CHATGPT_TOOLS = [
  {
    name: HEALTH_CHECK_TOOL_NAME,
    title: "Is my data healthy?",
    description:
      'Use this when the user asks whether their data, schema, warehouse, or catalogue is healthy — for example "is my data healthy?", "how healthy is our sales schema?", "score this DataHub dataset", or "any stale tables I should worry about?". Returns a 0–100 health score, critical tables, stale/ownerless/undocumented counts, key findings, and recommended actions. Call with no arguments (or demo:true) for a labelled sample analysis when the user has not shared credentials. Do NOT use this for narrated podcasts/briefings, marketplace agent scoring, writing tags back into DataHub, billing, checkout, or subscription upgrades. For a spoken briefing, tell the user to open DataBard\'s plans page with an existing account — do not start checkout in chat.',
    inputSchema: connectionInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
      title: "Is my data healthy?",
    },
  },
] as const;

export const SERVER_INSTRUCTIONS =
  "DataBard answers \"is my data healthy?\" with the free health_check tool. Prefer health_check for score/findings/actions. Do not offer in-chat checkout; narrated briefings require an existing DataBard account or the plans page at " +
  PLANS_URL +
  ".";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function isNotification(msg: JsonRpcRequest): boolean {
  return msg.id === undefined;
}

function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function fail(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

function resolveHealthToolName(name: string): boolean {
  if (name === HEALTH_CHECK_TOOL_NAME) return true;
  return (HEALTH_CHECK_TOOL_ALIASES as readonly string[]).includes(name);
}

async function callHealthCheck(
  args: unknown,
  req?: { headers: { get(name: string): string | null } },
) {
  const result = await runHealthCheck(args ?? {}, {
    req,
    upgradeMode: "chatgpt-informational",
  });

  if (!result.ok) {
    return {
      content: [{ type: "text", text: `Health check failed: ${result.error}` }],
      isError: true,
      structuredContent: result,
    };
  }

  const text =
    `${result.summary}\n\n` +
    `Key findings:\n${(result.keyFindings as string[]).map((f) => `- ${f}`).join("\n")}` +
    `\n\nFor a narrated briefing (existing account / plans): ${PLANS_URL}`;

  return {
    content: [{ type: "text", text }],
    structuredContent: result,
    isError: false,
  };
}

export async function handleMcpJsonRpc(
  message: unknown,
  req?: { headers: { get(name: string): string | null } },
): Promise<JsonRpcResponse | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return fail(null, -32600, "Invalid Request: expected a JSON-RPC object");
  }

  const msg = message as JsonRpcRequest;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return fail(msg.id ?? null, -32600, "Invalid Request: jsonrpc 2.0 and method required");
  }

  // Notifications have no response body (HTTP 202).
  if (isNotification(msg)) {
    if (msg.method === "notifications/initialized" || msg.method === "notifications/cancelled") {
      return null;
    }
    // Unknown notifications: accept silently.
    return null;
  }

  const id = msg.id ?? null;

  switch (msg.method) {
    case "initialize": {
      const params = (msg.params ?? {}) as { protocolVersion?: string };
      const requested = params.protocolVersion;
      // Echo a version we support; fall back to our preferred revision.
      const protocolVersion =
        requested === "2025-03-26" ||
        requested === "2025-06-18" ||
        requested === "2025-11-25" ||
        requested === "2024-11-05"
          ? requested
          : MCP_PROTOCOL_VERSION;
      return ok(id, {
        protocolVersion,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: MCP_SERVER_NAME,
          version: MCP_SERVER_VERSION,
          title: "DataBard",
          websiteUrl: PRODUCT_ORIGIN,
        },
        instructions: SERVER_INSTRUCTIONS,
      });
    }

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, {
        tools: CHATGPT_TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations,
        })),
      });

    case "tools/call": {
      const params = (msg.params ?? {}) as { name?: string; arguments?: unknown };
      const name = typeof params.name === "string" ? params.name : "";
      if (!name) {
        return fail(id, -32602, "tools/call requires params.name");
      }
      if (!resolveHealthToolName(name)) {
        return fail(id, -32601, `Unknown tool: ${name}. Available: ${HEALTH_CHECK_TOOL_NAME}`);
      }
      try {
        const toolResult = await callHealthCheck(params.arguments ?? {}, req);
        return ok(id, toolResult);
      } catch (e) {
        const messageText = e instanceof Error ? e.message : "Tool call failed";
        return ok(id, {
          content: [{ type: "text", text: messageText }],
          isError: true,
        });
      }
    }

    case "resources/list":
      return ok(id, { resources: [] });

    case "prompts/list":
      return ok(id, { prompts: [] });

    default:
      return fail(id, -32601, `Method not found: ${msg.method}`);
  }
}

/** CORS + MCP discovery headers for the public /mcp endpoint. */
export function mcpHttpHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  h.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID, Authorization",
  );
  h.set("Access-Control-Expose-Headers", "MCP-Session-Id, MCP-Protocol-Version");
  return h;
}
