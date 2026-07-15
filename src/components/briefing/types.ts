import type { MintRecord } from "@/lib/mint-stats";
import type { InsightSummary } from "@/app/api/insights/route";

/** Dashboard-facing projection of one analyzed source. */
export interface SourceCard {
  name: string;
  displayName: string;
  source: "the-graph" | "dune" | "unknown";
  latestHealth: number;
  trend: "up" | "down" | "stable";
  mintCount: number;
  wallets: number;
  lastActivity: string;
  recentMints: MintRecord[];
  healthHistory: number[];
  insight?: InsightSummary;
}

export interface BriefingEpisodeMeta {
  schemaName: string;
  tableCount: number;
  testsFailed: number;
  testsTotal: number;
  segments: number;
}
