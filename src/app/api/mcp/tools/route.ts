import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * A2MCP service discovery — lists the tools this ASP exposes, with JSON Schema
 * for each tool's input and output. Used by the marketplace listing and by
 * caller agents that introspect available capabilities before invoking.
 *
 * Self-check (must return HTTP 200):
 *   curl -i https://databard.persidian.com/api/mcp/tools
 */

const connectionSchema = {
  type: "object",
  description: "Data source connection spec. `source` selects the adapter; populate the matching connector block.",
  properties: {
    source: {
      type: "string",
      enum: ["openmetadata", "dbt-cloud", "dbt-local", "the-graph", "dune", "coral"],
      default: "openmetadata",
    },
    schemaFqn: { type: "string", description: "Fully-qualified schema name, e.g. \"db.sales\" or \"prod.analytics\"." },
    openmetadata: {
      type: "object",
      properties: { url: { type: "string" }, token: { type: "string" } },
      required: ["url", "token"],
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
        localFiles: { type: "array", items: { type: "object", properties: { path: { type: "string" }, name: { type: "string" } } } },
      },
      required: ["query"],
    },
  },
  required: ["source", "schemaFqn"],
} as const;

const healthOutputSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    tool: { type: "string", const: "databard.health-check" },
    schemaFqn: { type: "string" },
    schemaName: { type: "string" },
    tableCount: { type: "number" },
    health: {
      type: "object",
      properties: {
        score: { type: "number", minimum: 0, maximum: 100 },
        label: { type: "string", enum: ["healthy", "at-risk", "critical"] },
        failingTests: { type: "number" },
        passingTests: { type: "number" },
        totalTests: { type: "number" },
        testCoverage: { type: "number" },
        docCoverage: { type: "number" },
        staleTables: { type: "number" },
        ownerlessTables: { type: "number" },
        undocumentedTables: { type: "number" },
      },
    },
    criticalTables: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          failingTests: { type: "number" },
          downstreamCount: { type: "number" },
          risk: { type: "string", enum: ["low", "medium", "high", "critical"] },
        },
      },
    },
    staleTables: { type: "array", items: { type: "object", properties: { name: { type: "string" }, hoursAgo: { type: "number" } } } },
    recommendedActions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
          category: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          table: { type: "string" },
          effort: { type: "string" },
        },
      },
    },
  },
} as const;

const briefingOutputSchema = {
  ...healthOutputSchema,
  properties: {
    ...healthOutputSchema.properties,
    tool: { type: "string", const: "databard.briefing" },
    researchQuestion: { type: "string" },
    outputFormat: { type: "string", enum: ["podcast", "executive-summary"] },
    script: {
      type: "array",
      items: {
        type: "object",
        properties: { speaker: { type: "string" }, topic: { type: "string" }, text: { type: "string" } },
      },
    },
    audio: { type: "string", description: "Base64-encoded MP3 of the briefing.", contentEncoding: "base64" },
    audioFormat: { type: "string", const: "mp3" },
    audioUrl: { type: "string", description: "Public Grove/IPFS URL when upload succeeds." },
  },
} as const;

const TOOLS = [
  {
    name: "databard_health_check",
    summary: "Compute a data health score, critical tables, and recommended actions for a schema. Free.",
    description:
      "Analyses a data source's schema metadata and returns a health score (0-100), failing/untested/stale/ownerless table counts, the critical tables whose failures cascade downstream, and prioritised recommended actions. No LLM script, no audio — the fast, free discovery tool.",
    method: "POST",
    endpoint: "/api/mcp/health-check",
    pricing: "free",
    inputSchema: connectionSchema,
    outputSchema: healthOutputSchema,
  },
  {
    name: "databard_briefing",
    summary: "Generate a full AI data-analyst briefing: script, audio, health, and recommended actions. Paid per call.",
    description:
      "Runs the full DataBard synthesis on a schema: fetches metadata, computes health + trend narrative, generates a two-speaker briefing script (Alex + Morgan), synthesises the audio (MP3), uploads to Grove/IPFS, and returns the script, base64 audio, audio URL, health score, critical tables, and prioritised recommended actions. The hero tool — pay-per-call via x402.",
    method: "POST",
    endpoint: "/api/mcp/briefing",
    pricing: "x402 pay-per-call (exact, USDT0 on X Layer eip155:196)",
    inputSchema: {
      ...connectionSchema,
      properties: {
        ...connectionSchema.properties,
        researchQuestion: { type: "string", description: "Optional focus question for the briefing (8-240 chars)." },
        outputFormat: { type: "string", enum: ["podcast", "executive-summary"], default: "podcast" },
      },
    },
    outputSchema: briefingOutputSchema,
  },
];

export async function GET() {
  return NextResponse.json({
    ok: true,
    asp: "DataBard",
    description: "AI data analyst that synthesises a data estate into health scores, briefings, and recommended actions.",
    tools: TOOLS,
  });
}
