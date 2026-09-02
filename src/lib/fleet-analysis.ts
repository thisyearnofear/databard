/**
 * Fleet analysis — the "town hall."
 *
 * Reads the FULL DataHub context graph and reasons over lineage to compute
 * cascade impact across every dataset: transitive blast radius (how many other
 * datasets a broken table silently drags down), per-table risk, fleet health
 * distribution, hotspots, and a deterministic two-host narration script.
 *
 * Pure + unit-testable — no I/O. This is the "agent that reasons about the org,
 * not just one schema" layer.
 */
import type { DataHubDatasetMeta } from "./datahub-adapter";
import { scoreLabel } from "./product/score-tone";

export type FleetHealthLabel = "healthy" | "at-risk" | "critical";

export interface FleetSegment {
  speaker: "Alex" | "Morgan";
  topic: string;
  text: string;
}

export interface FleetTable {
  urn: string;
  name: string;
  owner?: string;
  columnCount: number;
  totalTests: number;
  failingTests: number;
  stale: boolean;
  healthScore: number;
  healthLabel: FleetHealthLabel;
  /** Transitive downstream count (blast radius over the fleet graph). */
  downstream: number;
  risk: number;
  issues: string[];
}

export interface FleetHotspot {
  name: string;
  downstream: number;
}

export interface FleetReport {
  totalTables: number;
  ownerless: number;
  untested: number;
  undocumented: number;
  stale: number;
  totalTests: number;
  failingTests: number;
  fleetScore: number;
  health: { healthy: number; atRisk: number; critical: number };
  topRisks: FleetTable[];
  hotspots: FleetHotspot[];
  townHall: FleetSegment[];
}

function isStale(freshness?: string, hours = 72): boolean {
  if (!freshness) return false;
  return Date.now() - new Date(freshness).getTime() > hours * 3600 * 1000;
}

function tableHealth(d: DataHubDatasetMeta): { score: number; label: FleetHealthLabel } {
  const failing = d.qualityTests.filter((q) => q.status === "Failed").length;
  let score = 100;
  if (d.qualityTests.length > 0) score -= Math.min(40, 15 * failing);
  if (!d.owner) score -= 8;
  if (d.qualityTests.length === 0) score -= 10;
  if (!d.description) score -= 6;
  if (isStale(d.freshness)) score -= 10;
  score = Math.max(0, Math.min(100, score));
  const label: FleetHealthLabel = scoreLabel(score);
  return { score, label };
}

/** Transitive downstream count per dataset URN (blast radius over the fleet graph). */
export function downstreamCounts(datasets: DataHubDatasetMeta[]): Map<string, number> {
  const byUrn = new Map(datasets.map((d) => [d.urn, d]));
  const adj = new Map<string, string[]>();
  for (const d of datasets) adj.set(d.urn, (d.downstream ?? []).filter((u) => byUrn.has(u)));

  const counts = new Map<string, number>();
  for (const d of datasets) {
    const seen = new Set<string>([d.urn]);
    const queue = [...(adj.get(d.urn) ?? [])];
    while (queue.length) {
      const u = queue.shift() as string;
      if (seen.has(u)) continue;
      seen.add(u);
      for (const v of adj.get(u) ?? []) if (!seen.has(v)) queue.push(v);
    }
    counts.set(d.urn, seen.size - 1);
  }
  return counts;
}

export function buildFleetReport(datasets: DataHubDatasetMeta[]): FleetReport {
  const counts = downstreamCounts(datasets);

  const tables: FleetTable[] = datasets.map((d) => {
    const failing = d.qualityTests.filter((q) => q.status === "Failed").length;
    const down = counts.get(d.urn) ?? 0;
    const { score, label } = tableHealth(d);
    const issues: string[] = [];
    if (!d.owner) issues.push("no owner");
    if (d.qualityTests.length === 0) issues.push("untested");
    if (!d.description) issues.push("undocumented");
    if (isStale(d.freshness)) issues.push("stale");
    const risk =
      failing * (1 + down) +
      (issues.includes("untested") ? 3 : 0) +
      (issues.includes("no owner") ? 2 : 0) +
      (issues.includes("stale") ? 1 : 0);
    return {
      urn: d.urn,
      name: d.name,
      owner: d.owner,
      columnCount: (d.columns ?? []).length,
      totalTests: d.qualityTests.length,
      failingTests: failing,
      stale: isStale(d.freshness),
      healthScore: score,
      healthLabel: label,
      downstream: down,
      risk,
      issues,
    };
  });

  const health = { healthy: 0, atRisk: 0, critical: 0 };
  for (const t of tables) {
    if (t.healthLabel === "healthy") health.healthy++;
    else if (t.healthLabel === "at-risk") health.atRisk++;
    else health.critical++;
  }
  const ownerless = tables.filter((t) => !t.owner).length;
  const untested = tables.filter((t) => t.totalTests === 0).length;
  const undocumented = tables.filter((t) => t.issues.includes("undocumented")).length;
  const stale = tables.filter((t) => t.stale).length;
  const failingTests = tables.reduce((s, t) => s + t.failingTests, 0);
  const totalTests = tables.reduce((s, t) => s + t.totalTests, 0);
  const fleetScore = tables.length ? Math.round(tables.reduce((s, t) => s + t.healthScore, 0) / tables.length) : 0;

  const topRisks = [...tables].sort((a, b) => b.risk - a.risk).slice(0, 8);
  const hotspots = [...tables]
    .sort((a, b) => b.downstream - a.downstream)
    .slice(0, 6)
    .map((t) => ({ name: t.name, downstream: t.downstream }));

  const townHall = buildTownHall({
    totalTables: tables.length,
    fleetScore,
    failingTests,
    health,
    topRisks,
    hotspots,
  });

  return {
    totalTables: tables.length,
    ownerless,
    untested,
    undocumented,
    stale,
    totalTests,
    failingTests,
    fleetScore,
    health,
    topRisks,
    hotspots,
    townHall,
  };
}

function buildTownHall(input: {
  totalTables: number;
  fleetScore: number;
  failingTests: number;
  health: FleetReport["health"];
  topRisks: FleetTable[];
  hotspots: FleetHotspot[];
}): FleetSegment[] {
  const { totalTables, fleetScore, failingTests, health, topRisks, hotspots } = input;
  const top = topRisks[0];
  const segments: FleetSegment[] = [];

  segments.push({
    speaker: "Alex",
    topic: "Fleet overview",
    text: `Hello. Across ${totalTables} tables I've scored the whole estate at ${fleetScore}/100 — ${health.healthy} healthy, ${health.atRisk} at risk, ${health.critical} critical${failingTests > 0 ? `, with ${failingTests} failing test${failingTests === 1 ? "" : "s"}` : ""}. This is the view our team never gets as one picture.`,
  });

  if (top) {
    segments.push({
      speaker: "Morgan",
      topic: "Biggest risk",
      text: `The one to fix first is ${top.name}.${top.failingTests > 0 ? ` It has ${top.failingTests} failing test${top.failingTests === 1 ? "" : "s"}` : " It's left untested"} and sits upstream of ${top.downstream} downstream surface${top.downstream === 1 ? "" : "s"} — so one bad change here fans out across the estate.${top.issues.length ? ` Issues: ${top.issues.join(", ")}.` : ""}`,
    });
  } else {
    segments.push({ speaker: "Morgan", topic: "Biggest risk", text: "Good news — no high-impact risks on the fleet right now." });
  }

  if (hotspots.length) {
    segments.push({
      speaker: "Alex",
      topic: "Blast-radius hotspots",
      text: `Watch these tables — each drags many downstream surfaces: ${hotspots.slice(0, 4).map((h) => `${h.name} (${h.downstream})`).join(", ")}.`,
    });
  }

  segments.push({
    speaker: "Alex",
    topic: "What was written back",
    text: `DataBard has written findings back into the graph — documentation, ownership, and guardrails across the fleet — so the state the agent found is already recorded where the team works.`,
  });

  return segments;
}
