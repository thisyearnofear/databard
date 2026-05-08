/**
 * GET /api/onchain/leaderboard
 * Returns top protocols by latest health score, aggregated from the mint ledger.
 * Query params: ?limit=20
 */
import { NextRequest, NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/mint-stats";

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);
    const entries = await getLeaderboard(limit);
    return NextResponse.json({ ok: true, entries });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
