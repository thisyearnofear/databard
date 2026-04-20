/**
 * Schema analysis — computes narrative-ready insights from raw SchemaMeta.
 * Sits between metadata fetch and script generation.
 * Both the LLM prompt and template fallback consume these insights.
 */
import type { SchemaMeta, TableMeta, LineageEdge } from "./types";

export interface SchemaInsights {
  /** Overall health: 0-100 */
  healthScore: number;
  healthLabel: "healthy" | "at-risk" | "critical";

  /** Tables sorted by risk (most failing tests + most downstream dependents first) */
  criticalTables: { table: TableMeta; failingTests: number; downstreamCount: number; risk: string }[];

  /** Tables with zero tests */
  untestedTables: string[];

  /** Tables with no description */
  undocumentedTables: string[];

  /** Documentation coverage percentage */
  docCoverage: number;

  /** Test coverage percentage (tables with ≥1 test) */
  testCoverage: number;

  /** Lineage hotspots — tables with most connections (upstream + downstream) */
  lineageHotspots: { name: string; connections: number }[];

  /** Cross-schema dependencies (lineage edges that leave this schema) */
  externalDeps: { fromTable: string; toTable: string }[];

  /** Summary stats */
  totalTests: number;
  passingTests: number;
  failingTests: number;
  queuedTests: number;
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

  // Lineage: count connections per table
  const connectionCount = new Map<string, number>();
  for (const edge of lineage) {
    const from = edge.fromTable.split(".").pop()!;
    const to = edge.toTable.split(".").pop()!;
    connectionCount.set(from, (connectionCount.get(from) ?? 0) + 1);
    connectionCount.set(to, (connectionCount.get(to) ?? 0) + 1);
  }

  // Downstream count per table (how many things depend on it)
  const downstreamCount = new Map<string, number>();
  for (const edge of lineage) {
    const from = edge.fromTable.split(".").pop()!;
    downstreamCount.set(from, (downstreamCount.get(from) ?? 0) + 1);
  }

  // External dependencies (edges where one side is outside this schema)
  const schemaTableFqns = new Set(tables.map((t) => t.fqn));
  const externalDeps = lineage.filter((e) => !schemaTableFqns.has(e.fromTable) || !schemaTableFqns.has(e.toTable));

  // Critical tables: sorted by risk = failing tests × (1 + downstream dependents)
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

  // Lineage hotspots
  const lineageHotspots = [...connectionCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, connections]) => ({ name, connections }));

  // Health score: 100 = all tests passing, good coverage. Penalize failures and gaps.
  let healthScore = 100;
  if (totalTests > 0) healthScore -= Math.round((failingTests / totalTests) * 40);
  if (tables.length > 0) {
    healthScore -= Math.round((untestedTables.length / tables.length) * 30);
    healthScore -= Math.round((undocumentedTables.length / tables.length) * 15);
  }
  if (lineage.length === 0 && tables.length > 1) healthScore -= 15;
  healthScore = Math.max(0, Math.min(100, healthScore));

  const healthLabel = healthScore >= 70 ? "healthy" : healthScore >= 40 ? "at-risk" : "critical";

  return {
    healthScore,
    healthLabel,
    criticalTables,
    untestedTables,
    undocumentedTables,
    docCoverage,
    testCoverage,
    lineageHotspots,
    externalDeps,
    totalTests,
    passingTests,
    failingTests,
    queuedTests,
  };
}
