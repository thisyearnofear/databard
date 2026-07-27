import { NextRequest, NextResponse } from "next/server";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { analyzeSchema, generateActionItems } from "@/lib/schema-analysis";
import { parseMcpInput } from "@/lib/mcp";
import { ValidationError, rateLimit } from "@/lib/validation";

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
 * Self-check (must return HTTP 200):
 *   curl -i -X POST https://databard.persidian.com/api/mcp/health-check \
 *     -H 'content-type: application/json' \
 *     -d '{"source":"openmetadata","schemaFqn":"db.sales","openmetadata":{"url":"...","token":"..."}}'
 */
export async function POST(req: NextRequest) {
  try {
    // Light abuse guard — the expensive work is on the caller's data source,
    // not on us, but the metadata fetch + analysis isn't free.
    rateLimit(req, { maxRequests: 60, windowMs: 3600000 });

    const body = await req.json();
    const { config, schemaFqn } = parseMcpInput(body);

    const meta = await fetchSchemaMeta(config, schemaFqn);
    const insights = analyzeSchema(meta);
    const actions = generateActionItems(insights);

    return NextResponse.json({
      ok: true,
      tool: "databard.health-check",
      schemaFqn,
      schemaName: meta.name,
      tableCount: meta.tables.length,
      health: {
        score: insights.healthScore,
        label: insights.healthLabel,
        failingTests: insights.failingTests,
        passingTests: insights.passingTests,
        totalTests: insights.totalTests,
        testCoverage: insights.testCoverage,
        docCoverage: insights.docCoverage,
        staleTables: insights.staleTables.length,
        ownerlessTables: insights.ownerlessTables.length,
        undocumentedTables: insights.undocumentedTables.length,
      },
      criticalTables: insights.criticalTables.slice(0, 8).map((ct) => ({
        name: ct.table.name,
        failingTests: ct.failingTests,
        downstreamCount: ct.downstreamCount,
        risk: ct.risk,
      })),
      staleTables: insights.staleTables.slice(0, 8).map((t) => ({
        name: t.name,
        hoursAgo: t.hoursAgo,
      })),
      recommendedActions: actions.slice(0, 12).map((a) => ({
        priority: a.priority,
        category: a.category,
        title: a.title,
        description: a.description,
        table: a.table,
        effort: a.effort,
      })),
    });
  } catch (e) {
    if (e instanceof ValidationError) {
      const status = e.message.startsWith("Rate limit") ? 429 : 400;
      return NextResponse.json({ ok: false, error: e.message }, { status });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
