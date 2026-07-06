/**
 * Cost framing — turn health metrics into the quantified cost of the problem.
 * "Health 58" is a score; "3 tests failing silently, cascading to 8 downstream
 * tables" is a cost. One phrasing, used by the player, dashboard, and landing.
 * Pure and isomorphic (no imports) — safe in server routes and client components.
 */

export interface CostInput {
  failingTests: number;
  /** Sum of downstream dependents across critical tables */
  downstreamAtRisk?: number;
  staleTables?: number;
  undocumentedTables?: number;
  untestedTables?: number;
}

/** Ordered, most-severe-first phrases; empty when nothing is wrong. */
export function costHighlights(c: CostInput): string[] {
  const out: string[] = [];
  if (c.failingTests > 0) {
    const cascade = c.downstreamAtRisk && c.downstreamAtRisk > 0
      ? `, cascading to ${c.downstreamAtRisk} downstream table${c.downstreamAtRisk !== 1 ? "s" : ""}`
      : "";
    out.push(`${c.failingTests} test${c.failingTests !== 1 ? "s" : ""} failing silently${cascade}`);
  }
  if (c.staleTables && c.staleTables > 0) {
    out.push(`${c.staleTables} table${c.staleTables !== 1 ? "s" : ""} gone stale — are the pipelines running?`);
  }
  if (c.untestedTables && c.untestedTables > 0) {
    out.push(`${c.untestedTables} table${c.untestedTables !== 1 ? "s" : ""} with zero test coverage`);
  }
  if (c.undocumentedTables && c.undocumentedTables > 0) {
    out.push(`${c.undocumentedTables} undocumented table${c.undocumentedTables !== 1 ? "s" : ""} slowing every onboarding`);
  }
  return out;
}

/** Single-line summary — the top one or two costs, or null when healthy. */
export function costLine(c: CostInput): string | null {
  const highlights = costHighlights(c);
  if (highlights.length === 0) return null;
  return highlights.slice(0, 2).join(" · ");
}
