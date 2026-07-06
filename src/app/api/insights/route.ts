import { NextResponse } from "next/server";
import { listSnapshots, getSnapshotHistory } from "@/lib/schema-snapshots";

/**
 * GET /api/insights — latest engine analysis per schema, with health history.
 *
 * Serves the analytics dashboard from the same SchemaInsights snapshots the
 * synthesis pipeline records. Returns summary fields only — PII column names
 * and owner identities stay out of this public endpoint.
 */
export interface InsightSummary {
  schemaFqn: string;
  schemaName: string;
  recordedAt: string;
  episodeId?: string;
  healthScore: number;
  healthLabel: "healthy" | "at-risk" | "critical";
  testCoverage: number;
  docCoverage: number;
  failingTests: number;
  untestedCount: number;
  ownerlessCount: number;
  tableCount: number;
  criticalTables: { name: string; failingTests: number; downstreamCount: number; risk: string }[];
  lineageHotspots: { name: string; connections: number }[];
  /** Chronological health scores across recorded snapshots */
  healthHistory: number[];
}

export async function GET() {
  try {
    const insights: InsightSummary[] = listSnapshots().map((snap) => ({
      schemaFqn: snap.schemaFqn,
      schemaName: snap.schemaName,
      recordedAt: snap.recordedAt,
      episodeId: snap.episodeId,
      healthScore: snap.insights.healthScore,
      healthLabel: snap.insights.healthLabel,
      testCoverage: snap.insights.testCoverage,
      docCoverage: snap.insights.docCoverage,
      failingTests: snap.insights.failingTests,
      untestedCount: snap.insights.untestedTables.length,
      ownerlessCount: snap.insights.ownerlessTables.length,
      tableCount: snap.tableNames.length,
      criticalTables: snap.insights.criticalTables.slice(0, 5).map((ct) => ({
        name: ct.table.name,
        failingTests: ct.failingTests,
        downstreamCount: ct.downstreamCount,
        risk: ct.risk,
      })),
      lineageHotspots: snap.insights.lineageHotspots,
      healthHistory: getSnapshotHistory(snap.schemaFqn).map((h) => h.insights.healthScore),
    }));

    insights.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    return NextResponse.json({ ok: true, insights });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
