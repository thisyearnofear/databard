/**
 * GET /api/onchain/team-history?schemaName=...&teamId=...
 * Returns all mints for a schema across all wallets (team accountability view).
 */
import { NextRequest, NextResponse } from "next/server";
import { getTeamHistory } from "@/lib/mint-stats";

export async function GET(req: NextRequest) {
  try {
    const schemaName = req.nextUrl.searchParams.get("schemaName");
    const teamId = req.nextUrl.searchParams.get("teamId") ?? undefined;
    if (!schemaName) {
      return NextResponse.json({ ok: false, error: "schemaName is required" }, { status: 400 });
    }
    const history = await getTeamHistory(schemaName, teamId);
    return NextResponse.json({ ok: true, schemaName, history });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
