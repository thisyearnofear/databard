/**
 * GET /api/onchain/leaderboard
 * Public index of data-source health, two trust tiers:
 *   - "verified" — the team minted the score on Solana (from the mint ledger)
 *   - "scanned"  — DataBard's engine analyzed the source (from snapshots), unclaimed
 * Query params: ?limit=20
 */
import { NextRequest, NextResponse } from "next/server";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/mint-stats";
import { listSnapshots, getSnapshotHistory } from "@/lib/schema-snapshots";

export type LeaderboardTier = "verified" | "scanned";

export interface PublicLeaderboardEntry extends LeaderboardEntry {
  tier: LeaderboardTier;
}

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);
    const minted = await getLeaderboard(limit);
    const mintedNames = new Set(minted.map((e) => e.schemaName));

    // Scanned tier: engine snapshots for sources nobody has minted (claimed) yet
    const scanned: PublicLeaderboardEntry[] = listSnapshots()
      .filter((s) => !mintedNames.has(s.schemaFqn) && !mintedNames.has(s.schemaName))
      .map((s) => {
        const history = getSnapshotHistory(s.schemaFqn).map((h) => h.insights.healthScore);
        const latest = s.insights.healthScore;
        const prev = history.length >= 2 ? history[history.length - 2] : latest;
        return {
          schemaName: s.schemaFqn,
          latestHealthScore: latest,
          mintCount: 0,
          trend: (latest > prev ? "up" : latest < prev ? "down" : "stable") as LeaderboardEntry["trend"],
          lastMintedAt: s.recordedAt,
          wallets: [],
          healthHistory: history.length > 0 ? history : [latest],
          tier: "scanned" as const,
        };
      });

    const entries: PublicLeaderboardEntry[] = [
      ...minted.map((e) => ({ ...e, tier: "verified" as const })),
      ...scanned,
    ]
      .sort((a, b) => b.latestHealthScore - a.latestHealthScore)
      .slice(0, limit);

    return NextResponse.json({ ok: true, entries });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
