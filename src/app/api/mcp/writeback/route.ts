import { NextRequest, NextResponse } from "next/server";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { analyzeSchema } from "@/lib/schema-analysis";
import { parseMcpInput } from "@/lib/mcp";
import { writeBackFindings } from "@/lib/datahub-adapter";
import { ValidationError, rateLimit } from "@/lib/validation";
import type { SchemaInsights } from "@/lib/schema-analysis";
import type { SchemaMeta } from "@/lib/types";

export const runtime = "nodejs";

/**
 * A2MCP tool — `databard_write_back` (FREE).
 *
 * Analyses a DataHub schema, then writes DataBard's findings BACK into the
 * DataHub context graph: health-band + defect tags (ownerless / untested /
 * undocumented / stale) on each table, plus (optionally) an idempotent AI
 * summary appended to each dataset's description. This is the "contribute
 * back to the graph" half of the agent loop — the same synthesis engine that
 * reads DataHub context can annotate it.
 *
 * Self-check:
 *   curl -i -X POST http://localhost:3000/api/mcp/writeback \
 *     -H 'content-type: application/json' \
 *     -d '{"source":"datahub","schemaFqn":"db.sales","datahub":{"serverUrl":"http://localhost:8080","token":"..."}}'
 */
export async function POST(req: NextRequest) {
  try {
    rateLimit(req, { maxRequests: 60, windowMs: 3600000 });

    const body = await req.json();
    const { config, schemaFqn } = parseMcpInput(body);

    if (config.source !== "datahub" || !config.datahub) {
      throw new ValidationError(
        "Write-back is supported only for the datahub source — a DataHub GMS connection is required to mutate its context graph."
      );
    }

    const meta = await fetchSchemaMeta(config, schemaFqn);
    const insights = analyzeSchema(meta);
    const summaryLine = buildSummaryLine(insights, meta);
    const applyDescriptions = body.writeDescriptions !== false;

    const written = await writeBackFindings(
      config.datahub,
      meta,
      insights.healthLabel,
      { applyDescriptions },
      summaryLine
    );

    return NextResponse.json({
      ok: true,
      tool: "databard.write-back",
      schemaFqn,
      health: { score: insights.healthScore, label: insights.healthLabel },
      summaryLine,
      written,
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

function buildSummaryLine(insights: SchemaInsights, meta: SchemaMeta): string {
  const parts = [
    `health ${insights.healthScore}/100 (${insights.healthLabel})`,
    `${meta.tables.length} table${meta.tables.length === 1 ? "" : "s"}`,
  ];
  if (insights.failingTests > 0) {
    parts.push(`${insights.failingTests} failing test${insights.failingTests === 1 ? "" : "s"}`);
  }
  if (insights.ownerlessTables.length > 0) {
    parts.push(`${insights.ownerlessTables.length} ownerless`);
  }
  if (insights.untestedTables.length > 0) {
    parts.push(`${insights.untestedTables.length} untested`);
  }
  return `DataBard: ${parts.join(", ")}.`;
}
