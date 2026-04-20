/**
 * Schema analysis — computes narrative-ready insights from raw SchemaMeta.
 * Sits between metadata fetch and script generation.
 * Both the LLM prompt and template fallback consume these insights.
 */
import type { SchemaMeta, TableMeta } from "./types";

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
