/**
 * Story composers — deterministic L0/L1 sentences from existing analysis data.
 *
 * Pure and isomorphic (no imports): safe in server routes and client
 * components. These compose structure, not content — every function returns
 * null when its inputs are absent, and callers must render a fallback or
 * nothing, never placeholder text. No LLM calls, no new fetching.
 */
import type { InsightSummary } from "@/app/api/insights/route";
import type { TrendNarrative } from "@/app/api/insights/trends/route";
import type { SourceCard } from "@/components/briefing/types";
import type { Episode } from "@/lib/types";
import { costLine } from "@/lib/cost-framing";

function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? `${one}s`);
}

/** One-sentence finding for a source card or hero: most-severe-first cost line. */
export function findingSentence(insight: InsightSummary | undefined): string | null {
  if (!insight) return null;
  const line = costLine({
    failingTests: insight.failingTests,
    downstreamAtRisk: insight.criticalTables.reduce((s, t) => s + t.downstreamCount, 0),
    staleTables: insight.staleCount,
    undocumentedTables: insight.undocumentedCount,
    untestedTables: insight.untestedCount,
  });
  if (line) return line;
  if (insight.ownerlessCount > 0) {
    return `${insight.ownerlessCount} ${plural(insight.ownerlessCount, "table")} with no owner — assign someone before treating this as settled.`;
  }
  return null;
}

/** Consequence clause for a trend item: why the change matters. Null when quiet. */
export function consequenceSentence(trend: TrendNarrative): string | null {
  const diff = trend.diff;
  if (!diff) {
    return trend.hasHistory ? null : "First snapshot — trends appear after the next analysis.";
  }
  if (diff.newFailures.length > 0) {
    const names = diff.newFailures.slice(0, 2).join(", ");
    return `${diff.newFailures.length} new test ${plural(diff.newFailures.length, "failure")} (${names}${diff.newFailures.length > 2 ? ", …" : ""}) — check the latest deploy.`;
  }
  if (trend.healthScoreChange <= -5) {
    return "A significant drop — investigate recent deploys or pipeline changes.";
  }
  if (diff.resolvedFailures.length > 0 && trend.healthScoreChange >= 0) {
    return "Net positive — issues resolving without new ones appearing.";
  }
  if (diff.removedTables.length > 0) {
    return `${diff.removedTables.length} ${plural(diff.removedTables.length, "table")} removed — confirm the removal was intentional.`;
  }
  return null;
}

/** Calm confirmation when nothing needs attention; null when there is work to do. */
export function calmConfirmation(cards: SourceCard[], avgHealth: number): string | null {
  if (cards.length === 0) return null;
  const failing = cards.reduce((s, c) => s + (c.insight?.failingTests ?? 0), 0);
  const stale = cards.reduce((s, c) => s + (c.insight?.staleCount ?? 0), 0);
  const untested = cards.reduce((s, c) => s + (c.insight?.untestedCount ?? 0), 0);
  if (failing > 0 || stale > 0 || untested > 0) return null;
  return `No material issues. Estate health ${avgHealth}% across ${cards.length} ${plural(cards.length, "source")}.`;
}

/** One-line caption for the fleet chart: largest mover, divergence, or quiet week. */
export function chartCaption(cards: SourceCard[]): string {
  const withHistory = cards.filter((c) => c.healthHistory.length >= 2);
  if (withHistory.length === 0) return "Not enough history yet — check back after the next snapshot.";
  let mover: SourceCard | null = null;
  let moverDelta = 0;
  for (const card of withHistory) {
    const h = card.healthHistory;
    const delta = h[h.length - 1] - h[h.length - 2];
    if (Math.abs(delta) > Math.abs(moverDelta)) {
      mover = card;
      moverDelta = delta;
    }
  }
  if (mover && Math.abs(moverDelta) >= 5) {
    const dir = moverDelta > 0 ? "up" : "down";
    return `Largest move: ${mover.displayName} ${dir} ${Math.abs(moverDelta)} points.`;
  }
  if (mover && Math.abs(moverDelta) >= 1) {
    return `${mover.displayName} moved most (${moverDelta > 0 ? "+" : ""}${moverDelta}) — otherwise a quiet week.`;
  }
  return "No source moved more than a point — a quiet week.";
}

/** Player header bottom line: top action, calm confirmation, or null. */
export function bottomLine(episode: Episode): string | null {
  const failing = episode.qualitySummary.failed;
  if (failing > 0) {
    return `${failing} failing ${plural(failing, "test")} in ${episode.schemaName} — listen for what broke and what to fix first.`;
  }
  if (typeof episode.healthScore === "number" && episode.healthScore >= 80) {
    return `${episode.schemaName} is healthy at ${episode.healthScore}% — no material issues.`;
  }
  return null;
}
