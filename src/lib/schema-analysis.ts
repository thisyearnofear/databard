/**
 * Schema analysis — computes narrative-ready insights from raw SchemaMeta.
 * Sits between metadata fetch and script generation.
 * Both the LLM prompt and template fallback consume these insights.
 */
import type { SchemaMeta, TableMeta } from "./types";

export type ActionPriority = "critical" | "high" | "medium" | "low";
export type ActionCategory = "test" | "documentation" | "ownership" | "governance" | "freshness";

export interface ActionItem {
  id: string;
  priority: ActionPriority;
  category: ActionCategory;
  title: string;
  description: string;
  table?: string;
  effort: "5min" | "30min" | "1hr" | "half-day";
}

export interface SchemaInsights {
  healthScore: number;
  healthLabel: "healthy" | "at-risk" | "critical";

  criticalTables: { table: TableMeta; failingTests: number; downstreamCount: number; risk: string }[];
  untestedTables: string[];
  undocumentedTables: string[];
  docCoverage: number;
  testCoverage: number;

  lineageHotspots: { name: string; connections: number }[];
  externalDeps: { fromTable: string; toTable: string }[];

  totalTests: number;
  passingTests: number;
  failingTests: number;
  queuedTests: number;

  /** OpenMetadata-enriched insights (populated when data is available) */
  owners: { name: string; tables: string[] }[];
  piiTables: { name: string; columns: string[] }[];
  glossaryTerms: string[];
  staleTables: { name: string; freshness: string; hoursAgo: number }[];
  largestTables: { name: string; rowCount: number }[];
  ownerlessTables: string[];
}

export function analyzeSchema(schema: SchemaMeta): SchemaInsights {
  const { tables, lineage } = schema;

  // Test stats
  const totalTests = tables.reduce((n, t) => n + t.qualityTests.length, 0);
  const failingTests = tables.reduce((n, t) => n + t.qualityTests.filter((q) => q.status === "Failed").length, 0);
  const passingTests = tables.reduce((n, t) => n + t.qualityTests.filter((q) => q.status === "Success").length, 0);
  const queuedTests = totalTests - failingTests - passingTests;

  // Coverage
  const untestedTables = tables.filter((t) => t.qualityTests.length === 0).map((t) => t.name);
  const undocumentedTables = tables.filter((t) => !t.description).map((t) => t.name);
  const testCoverage = tables.length > 0 ? Math.round(((tables.length - untestedTables.length) / tables.length) * 100) : 0;
  const docCoverage = tables.length > 0 ? Math.round(((tables.length - undocumentedTables.length) / tables.length) * 100) : 0;

  // Lineage
  const connectionCount = new Map<string, number>();
  const downstreamCount = new Map<string, number>();
  for (const edge of lineage) {
    const from = edge.fromTable.split(".").pop()!;
    const to = edge.toTable.split(".").pop()!;
    connectionCount.set(from, (connectionCount.get(from) ?? 0) + 1);
    connectionCount.set(to, (connectionCount.get(to) ?? 0) + 1);
    downstreamCount.set(from, (downstreamCount.get(from) ?? 0) + 1);
  }

  const schemaTableFqns = new Set(tables.map((t) => t.fqn));
  const externalDeps = lineage.filter((e) => !schemaTableFqns.has(e.fromTable) || !schemaTableFqns.has(e.toTable));

  // Critical tables
  const criticalTables = tables
    .map((t) => {
      const failing = t.qualityTests.filter((q) => q.status === "Failed").length;
      const downstream = downstreamCount.get(t.name) ?? 0;
      const riskScore = failing * (1 + downstream);
      let risk = "low";
      if (failing > 0 && downstream > 2) risk = "critical";
      else if (failing > 0) risk = "high";
      else if (t.qualityTests.length === 0 && downstream > 0) risk = "medium";
      return { table: t, failingTests: failing, downstreamCount: downstream, risk, riskScore };
    })
    .filter((t) => t.risk !== "low")
    .sort((a, b) => b.riskScore - a.riskScore)
    .map(({ riskScore, ...rest }) => rest);

  const lineageHotspots = [...connectionCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, connections]) => ({ name, connections }));

  // ── OpenMetadata-enriched insights ──

  // Owners: group tables by owner
  const ownerMap = new Map<string, string[]>();
  const ownerlessTables: string[] = [];
  for (const t of tables) {
    if (t.owner) {
      if (!ownerMap.has(t.owner)) ownerMap.set(t.owner, []);
      ownerMap.get(t.owner)!.push(t.name);
    } else {
      ownerlessTables.push(t.name);
    }
  }
  const owners = [...ownerMap.entries()].map(([name, tbls]) => ({ name, tables: tbls }));

  // PII tables
  const piiTables = tables
    .filter((t) => t.piiColumns && t.piiColumns.length > 0)
    .map((t) => ({ name: t.name, columns: t.piiColumns! }));

  // Glossary terms across schema
  const glossaryTerms = [...new Set(tables.flatMap((t) => t.glossaryTerms ?? []))];

  // Stale tables (freshness > 24h)
  const now = Date.now();
  const staleTables = tables
    .filter((t) => t.freshness)
    .map((t) => {
      const hoursAgo = Math.round((now - new Date(t.freshness!).getTime()) / 3600000);
      return { name: t.name, freshness: t.freshness!, hoursAgo };
    })
    .filter((t) => t.hoursAgo > 24)
    .sort((a, b) => b.hoursAgo - a.hoursAgo);

  // Largest tables by row count
  const largestTables = tables
    .filter((t) => t.rowCount != null && t.rowCount > 0)
    .sort((a, b) => (b.rowCount ?? 0) - (a.rowCount ?? 0))
    .slice(0, 5)
    .map((t) => ({ name: t.name, rowCount: t.rowCount! }));

  // Health score
  let healthScore = 100;
  if (totalTests > 0) healthScore -= Math.round((failingTests / totalTests) * 40);
  if (tables.length > 0) {
    healthScore -= Math.round((untestedTables.length / tables.length) * 30);
    healthScore -= Math.round((undocumentedTables.length / tables.length) * 10);
    healthScore -= Math.round((ownerlessTables.length / tables.length) * 5);
  }
  if (lineage.length === 0 && tables.length > 1) healthScore -= 15;
  if (staleTables.length > 0) healthScore -= Math.min(10, staleTables.length * 3);
  healthScore = Math.max(0, Math.min(100, healthScore));

  const healthLabel = healthScore >= 70 ? "healthy" : healthScore >= 40 ? "at-risk" : "critical";

  return {
    healthScore, healthLabel,
    criticalTables, untestedTables, undocumentedTables, docCoverage, testCoverage,
    lineageHotspots, externalDeps,
    totalTests, passingTests, failingTests, queuedTests,
    owners, piiTables, glossaryTerms, staleTables, largestTables, ownerlessTables,
  };
}

/** Generate prioritized action items from schema insights */
export function generateActionItems(insights: SchemaInsights): ActionItem[] {
  const items: ActionItem[] = [];
  let idx = 0;

  // Critical: failing tests on high-downstream tables
  for (const ct of insights.criticalTables) {
    if (ct.failingTests > 0) {
      items.push({
        id: `action-${idx++}`,
        priority: ct.risk === "critical" ? "critical" : "high",
        category: "test",
        title: `Fix ${ct.failingTests} failing test${ct.failingTests > 1 ? "s" : ""} on ${ct.table.name}`,
        description: ct.downstreamCount > 0
          ? `${ct.downstreamCount} downstream table${ct.downstreamCount > 1 ? "s" : ""} depend on this — failures cascade.`
          : `Test${ct.failingTests > 1 ? "s are" : " is"} failing. Investigate and fix or update expectations.`,
        table: ct.table.name,
        effort: ct.failingTests > 3 ? "1hr" : "30min",
      });
    }
  }

  // High: untested tables with downstream dependents
  for (const name of insights.untestedTables.slice(0, 5)) {
    items.push({
      id: `action-${idx++}`,
      priority: "high",
      category: "test",
      title: `Add tests to ${name}`,
      description: "No quality tests configured. Add not_null, unique, or accepted_values checks.",
      table: name,
      effort: "30min",
    });
  }

  // Medium: undocumented tables
  if (insights.undocumentedTables.length > 0) {
    if (insights.undocumentedTables.length <= 3) {
      for (const name of insights.undocumentedTables) {
        items.push({
          id: `action-${idx++}`,
          priority: "medium",
          category: "documentation",
          title: `Document ${name}`,
          description: "No description set. Add a brief explanation of what this table contains and its purpose.",
          table: name,
          effort: "5min",
        });
      }
    } else {
      items.push({
        id: `action-${idx++}`,
        priority: "medium",
        category: "documentation",
        title: `Document ${insights.undocumentedTables.length} tables`,
        description: `Only ${insights.docCoverage}% documentation coverage. Tables: ${insights.undocumentedTables.slice(0, 5).join(", ")}${insights.undocumentedTables.length > 5 ? "…" : ""}`,
        effort: "1hr",
      });
    }
  }

  // Medium: ownerless tables
  if (insights.ownerlessTables.length > 0) {
    items.push({
      id: `action-${idx++}`,
      priority: "medium",
      category: "ownership",
      title: `Assign owners to ${insights.ownerlessTables.length} table${insights.ownerlessTables.length > 1 ? "s" : ""}`,
      description: `Tables without owners: ${insights.ownerlessTables.slice(0, 4).join(", ")}${insights.ownerlessTables.length > 4 ? "…" : ""}. Ownership ensures accountability when issues arise.`,
      effort: "5min",
    });
  }

  // Medium: PII governance
  for (const pii of insights.piiTables) {
    items.push({
      id: `action-${idx++}`,
      priority: "medium",
      category: "governance",
      title: `Review PII access on ${pii.name}`,
      description: `Contains PII columns: ${pii.columns.join(", ")}. Verify access policies and retention rules.`,
      table: pii.name,
      effort: "30min",
    });
  }

  // Low: stale tables
  for (const stale of insights.staleTables.slice(0, 3)) {
    items.push({
      id: `action-${idx++}`,
      priority: stale.hoursAgo > 72 ? "high" : "low",
      category: "freshness",
      title: `Investigate stale ${stale.name}`,
      description: `Last updated ${stale.hoursAgo}h ago. Check if the pipeline is running or if this table is deprecated.`,
      table: stale.name,
      effort: "30min",
    });
  }

  // Sort by priority
  const priorityOrder: Record<ActionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return items;
}

/** Diff between two schema analyses — what changed since last episode */
export interface SchemaDiff {
  newTables: string[];
  removedTables: string[];
  newFailures: string[];
  resolvedFailures: string[];
  healthScoreChange: number;
  testCoverageChange: number;
  summary: string;
}

export function diffInsights(prev: SchemaInsights, curr: SchemaInsights, prevTableNames: string[], currTableNames: string[]): SchemaDiff {
  const prevSet = new Set(prevTableNames);
  const currSet = new Set(currTableNames);

  const newTables = currTableNames.filter((t) => !prevSet.has(t));
  const removedTables = prevTableNames.filter((t) => !currSet.has(t));

  const prevFailNames = new Set(prev.criticalTables.map((c) => c.table.name));
  const currFailNames = curr.criticalTables.map((c) => c.table.name);

  const newFailures = currFailNames.filter((n) => !prevFailNames.has(n));
  const resolvedFailures = [...prevFailNames].filter((n) => !currFailNames.includes(n));

  const healthScoreChange = curr.healthScore - prev.healthScore;
  const testCoverageChange = curr.testCoverage - prev.testCoverage;

  // Build human-readable summary
  const parts: string[] = [];
  if (newTables.length > 0) parts.push(`${newTables.length} new table${newTables.length > 1 ? "s" : ""}`);
  if (removedTables.length > 0) parts.push(`${removedTables.length} removed`);
  if (newFailures.length > 0) parts.push(`${newFailures.length} new failure${newFailures.length > 1 ? "s" : ""}`);
  if (resolvedFailures.length > 0) parts.push(`${resolvedFailures.length} resolved`);
  if (healthScoreChange !== 0) parts.push(`health ${healthScoreChange > 0 ? "+" : ""}${healthScoreChange}`);

  return {
    newTables, removedTables, newFailures, resolvedFailures,
    healthScoreChange, testCoverageChange,
    summary: parts.length > 0 ? parts.join(", ") : "no changes",
  };
}
