import { NextRequest, NextResponse } from "next/server";
import { runHealthCheck } from "@/lib/mcp-health-check";

export const runtime = "nodejs";

/**
 * A2MCP tool — `databard_health_check` (FREE).
 *
 * One-shot schema health analysis: fetch metadata for the given connection +
 * schema FQN, compute the health score + critical tables + stale/ownerless/
 * undocumented counts, and return prioritised recommended actions. No LLM
 * script generation, no audio — cheap and fast, the discovery driver for the
 * paid Data Briefing.
 *
 * ChatGPT / Codex should prefer the Streamable HTTP MCP endpoint at `/mcp`
 * (tool `health_check`) which wraps this same logic with informational
 * upgrade guidance (no in-plugin checkout).
 *
 * Self-check (must return HTTP 200):
 *   curl -i -X POST https://databard.persidian.com/api/mcp/health-check \
 *     -H 'content-type: application/json' \
 *     -d '{"source":"openmetadata","schemaFqn":"db.sales","openmetadata":{"url":"...","token":"..."}}'
 *
 *   curl -i -X POST https://databard.persidian.com/api/mcp/health-check \
 *     -H 'content-type: application/json' \
 *     -d '{"source":"datahub","schemaFqn":"db.sales","datahub":{"serverUrl":"http://localhost:8080","token":"..."}}'
 */
export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const result = await runHealthCheck(body, { req, upgradeMode: "x402" });
  if (!result.ok) {
    const { status, ...payload } = result;
    return NextResponse.json(payload, { status });
  }
  return NextResponse.json(result);
}
