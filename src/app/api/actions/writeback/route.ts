import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { analyzeSchema } from "@/lib/schema-analysis";
import { writeBackFindings, fetchFleetDatasets } from "@/lib/datahub-adapter";
import { buildFleetReport } from "@/lib/fleet-analysis";
import { rateLimit } from "@/lib/validation";
import type { SchemaInsights } from "@/lib/schema-analysis";
import type { SchemaMeta, TableMeta } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/actions/writeback — the dashboard "Contribute back to DataHub"
 * button. Uses the server-side session connection (credentials never leave the
 * server), re-runs the analysis, then writes tags + AI summaries back into the
 * DataHub context graph.
 */
export async function POST(req: NextRequest) {
  try {
    rateLimit(req, { maxRequests: 20, windowMs: 3600000 });

    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "Connect a data source first." },
        { status: 400 }
      );
    }

    const config = session.config;
    if (config.source !== "datahub" || !config.datahub) {
      return NextResponse.json(
        { ok: false, error: "Write-back requires a DataHub connection. Connect DataHub first." },
        { status: 400 }
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* empty body is fine */
    }

    // Fleet-scale write-back: analyze the whole DataHub graph and write findings
    // (tags + governance docs + ownership) across every dataset.
    if (body.fleet === true) {
      const datasets = await fetchFleetDatasets(config.datahub);
      const report = buildFleetReport(datasets);
      const tables: TableMeta[] = datasets.map((d) => ({
        fqn: d.urn,
        name: d.name,
        description: d.description,
        columns: d.columns,
        qualityTests: d.qualityTests,
        tags: d.tags,
        owner: d.owner,
        rowCount: d.rowCount,
        freshness: d.freshness,
      }));
      const meta: SchemaMeta = { fqn: "fleet", name: "fleet", tables, lineage: [] };
      const label = report.fleetScore >= 80 ? "healthy" : report.fleetScore >= 50 ? "at-risk" : "critical";
      const summaryLine = `DataBard: fleet health ${report.fleetScore}/100 across ${report.totalTables} tables.`;
      const written = await writeBackFindings(
        config.datahub,
        meta,
        label,
        {
          applyDescriptions: body.writeDescriptions !== false,
          applyOwnership: body.writeOwnership !== false,
        },
        summaryLine
      );
      return NextResponse.json({
        ok: true,
        schemaFqn: "fleet",
        health: { score: report.fleetScore, label },
        summaryLine,
        written,
        report,
      });
    }

    const schemaFqn =
      typeof body.schemaFqn === "string" && body.schemaFqn.trim()
        ? body.schemaFqn.trim()
        : session.schemas[0];

    if (!schemaFqn) {
      return NextResponse.json(
        { ok: false, error: "No schema to write back." },
        { status: 400 }
      );
    }

    const meta = await fetchSchemaMeta(config, schemaFqn);
    const insights = analyzeSchema(meta);
    const summaryLine = buildSummaryLine(insights, meta);
    const written = await writeBackFindings(
      config.datahub,
      meta,
      insights.healthLabel,
      { applyDescriptions: body.writeDescriptions !== false },
      summaryLine
    );

    return NextResponse.json({
      ok: true,
      schemaFqn,
      health: { score: insights.healthScore, label: insights.healthLabel },
      summaryLine,
      written,
    });
  } catch (e) {
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
