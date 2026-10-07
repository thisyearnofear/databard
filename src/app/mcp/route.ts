import { NextRequest, NextResponse } from "next/server";
import { handleMcpJsonRpc, mcpHttpHeaders, MCP_PROTOCOL_VERSION } from "@/lib/mcp-chatgpt-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ChatGPT / Codex Streamable HTTP MCP endpoint.
 *
 * Production: https://databard.persidian.com/mcp
 * Local:      http://localhost:3000/mcp
 *
 * Free tool surface: health_check (read-only). Existing A2MCP REST tools remain
 * under /api/mcp/* for OKX marketplace agents.
 *
 * Inspect:
 *   npx @modelcontextprotocol/inspector
 *   → Streamable HTTP → http://localhost:3000/mcp
 */

function withMcpHeaders(res: NextResponse): NextResponse {
  const extra = mcpHttpHeaders();
  extra.forEach((value, key) => res.headers.set(key, value));
  res.headers.set("MCP-Protocol-Version", MCP_PROTOCOL_VERSION);
  return res;
}

export async function OPTIONS() {
  return withMcpHeaders(new NextResponse(null, { status: 204 }));
}

/**
 * Stateless server: no long-lived SSE stream on GET.
 * Spec allows 405 when SSE is not offered.
 */
export async function GET() {
  return withMcpHeaders(
    NextResponse.json(
      {
        ok: true,
        transport: "streamable-http",
        mcp: true,
        endpoint: "/mcp",
        note: "POST JSON-RPC messages (initialize, tools/list, tools/call). GET SSE is not offered on this endpoint.",
        tools: ["health_check"],
      },
      { status: 405 },
    ),
  );
}

/** Session teardown — stateless, so DELETE is a no-op success. */
export async function DELETE() {
  return withMcpHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return withMcpHeaders(
      NextResponse.json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        { status: 400 },
      ),
    );
  }

  // Batch: array of messages — process sequentially, return JSON array of responses.
  if (Array.isArray(body)) {
    const responses = [];
    for (const item of body) {
      const res = await handleMcpJsonRpc(item, req);
      if (res) responses.push(res);
    }
    if (responses.length === 0) {
      return withMcpHeaders(new NextResponse(null, { status: 202 }));
    }
    return withMcpHeaders(NextResponse.json(responses.length === 1 ? responses[0] : responses));
  }

  const response = await handleMcpJsonRpc(body, req);
  if (!response) {
    // Notification accepted.
    return withMcpHeaders(new NextResponse(null, { status: 202 }));
  }

  return withMcpHeaders(NextResponse.json(response));
}
