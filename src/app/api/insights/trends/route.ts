/**
 * GET /api/insights/trends — week-over-week trend narratives for all schemas.
 *
 * For each schema with snapshot history, computes the diff between the latest
 * and the snapshot from ~7 days ago, then generates a human-readable narrative
 * explaining what changed and why it matters.
 */
import { NextResponse } from "next/server";
import { listSnapshots, getSnapshotHistory } from "@/lib/schema-snapshots";
import { diffInsights, type SchemaDiff } from "@/lib/schema-analysis";

export interface TrendNarrative {
  schemaFqn: string;
  schemaName: string;
  healthScore: number;
  healthScoreChange: number;
  diff: SchemaDiff | null;
  narrative: string;
  /** Whether this schema has enough history for a trend (>= 2 snapshots) */
  hasHistory: boolean;
}

function buildNarrative(
  schemaName: string,
  diff: SchemaDiff | null,
  healthScore: number,
  healthScoreChange: number,
): string {
  if (!diff) {
    // No history — just describe current state
    if (healthScore >= 90) return `${schemaName} is healthy at ${healthScore}%. No historical data yet — trends will appear after the next analysis.`;
    if (healthScore >= 70) return `${schemaName} is at ${healthScore}% — needs attention. No historical data yet — trends will appear after the next analysis.`;
    return `${schemaName} is critical at ${healthScore}%. No historical data yet — trends will appear after the next analysis.`;
  }

  const parts: string[] = [];

  // Health score change
  if (healthScoreChange > 0) {
    parts.push(`Health improved by ${healthScoreChange} points`);
  } else if (healthScoreChange < 0) {
    parts.push(`Health dropped ${Math.abs(healthScoreChange)} points`);
  } else {
    parts.push(`Health held steady at ${healthScore}%`);
  }

  // New failures
  if (diff.newFailures.length > 0) {
    const names = diff.newFailures.slice(0, 3).join(", ");
    parts.push(`${diff.newFailures.length} new test failure${diff.newFailures.length > 1 ? "s" : ""} (${names})`);
  }

  // Resolved failures
  if (diff.resolvedFailures.length > 0) {
    parts.push(`${diff.resolvedFailures.length} failure${diff.resolvedFailures.length > 1 ? "s" : ""} resolved`);
  }

  // New/removed tables
  if (diff.newTables.length > 0) {
    parts.push(`${diff.newTables.length} new table${diff.newTables.length > 1 ? "s" : ""} added`);
  }
  if (diff.removedTables.length > 0) {
    parts.push(`${diff.removedTables.length} table${diff.removedTables.length > 1 ? "s" : ""} removed`);
  }

  // Test coverage change
  if (diff.testCoverageChange !== 0) {
    parts.push(`test coverage ${diff.testCoverageChange > 0 ? "up" : "down"} ${Math.abs(diff.testCoverageChange)}%`);
  }

  // Add causal context
  let narrative = parts.join(", ") + ".";

  // Add "why it matters" context
  if (healthScoreChange < -5) {
    narrative += ` This is a significant drop — investigate recent deploys or pipeline changes.`;
  } else if (diff.newFailures.length > 2) {
    narrative += ` Multiple new failures suggest a breaking change — check the latest deploy.`;
  } else if (healthScoreChange > 5) {
    narrative += ` Good progress — keep it up.`;
  } else if (diff.resolvedFailures.length > 0 && diff.newFailures.length === 0) {
    narrative += ` Net positive — issues being resolved without new ones appearing.`;
  }

  return narrative;
}

export async function GET() {
  try {
    const snapshots = listSnapshots();
    const narratives: TrendNarrative[] = [];

    for (const snap of snapshots) {
      const history = getSnapshotHistory(snap.schemaFqn);
      const hasHistory = history.length >= 2;

      // Find snapshot from ~7 days ago
      const now = new Date(snap.recordedAt);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const prevSnap = history
        .filter((h) => new Date(h.recordedAt) <= weekAgo)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]
        ?? history
          .filter((h) => h.recordedAt !== snap.recordedAt)
          .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];

      let diff: SchemaDiff | null = null;
      let healthScoreChange = 0;

      if (prevSnap) {
        diff = diffInsights(
          prevSnap.insights,
          snap.insights,
          prevSnap.tableNames,
          snap.tableNames,
        );
        healthScoreChange = diff.healthScoreChange;
      }

      narratives.push({
        schemaFqn: snap.schemaFqn,
        schemaName: snap.schemaName,
        healthScore: snap.insights.healthScore,
        healthScoreChange,
        diff,
        narrative: buildNarrative(snap.schemaName, diff, snap.insights.healthScore, healthScoreChange),
        hasHistory,
      });
    }

    // Sort: biggest drops first, then by schema name
    narratives.sort((a, b) => {
      if (a.healthScoreChange !== b.healthScoreChange) return a.healthScoreChange - b.healthScoreChange;
      return a.schemaName.localeCompare(b.schemaName);
    });

    return NextResponse.json({ ok: true, narratives });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
