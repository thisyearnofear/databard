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
    const snapshots = listSnapshots();

    // Snapshot lookup by schema group — mint records key on schemaName, which
    // may be either the snapshot's fqn or its display name
    const snapshotByName = new Map(snapshots.flatMap((s) => [[s.schemaFqn, s] as const, [s.schemaName, s] as const]));

    // Verified tier: mints seeded by market settlements record healthScore 0 —
    // when the engine has scanned the same schema group, show its real score
    const verified: PublicLeaderboardEntry[] = minted.map((e) => {
      const snap = e.latestHealthScore === 0 ? snapshotByName.get(e.schemaName) : undefined;
      if (!snap) return { ...e, tier: "verified" as const };
      const history = getSnapshotHistory(snap.schemaFqn).map((h) => h.insights.healthScore);
      const latest = snap.insights.healthScore;
      const healthHistory = e.healthHistory.some((score) => score > 0)
        ? e.healthHistory
        : history.length > 0 ? history : [latest];
      const prev = healthHistory.length >= 2 ? healthHistory[healthHistory.length - 2] : latest;
      return {
        ...e,
        latestHealthScore: latest,
        healthHistory,
        trend: (latest > prev ? "up" : latest < prev ? "down" : "stable") as LeaderboardEntry["trend"],
        tier: "verified" as const,
      };
    });

    // Scanned tier: engine snapshots for sources nobody has minted (claimed) yet
    const scanned: PublicLeaderboardEntry[] = snapshots
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
      ...verified,
      ...scanned,
    ]
      .sort((a, b) => b.latestHealthScore - a.latestHealthScore)
      .slice(0, limit);

    return NextResponse.json({ ok: true, entries });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
