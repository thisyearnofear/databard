/**
 * GET  /api/market/deal?wantId=xxx  — get a Deal record
 * POST /api/market/deal              — release funds (buyer confirms delivery)
 *
 * Release is the terminal happy-path transition. The orchestrator re-verifies the on-chain
 * manifest hash against the local Deal before signing.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDeal, listDeals } from "@/lib/market/protocol";
import { releaseDeal } from "@/lib/market/orchestrator";

export async function GET(req: NextRequest) {
  const wantId = req.nextUrl.searchParams.get("wantId");
  if (!wantId) {
    // No wantId → list recent deals for dashboard.
    return NextResponse.json({ ok: true, deals: listDeals() });
  }
  const deal = getDeal(wantId);
  if (!deal) return NextResponse.json({ ok: false, error: "deal not found" }, { status: 404 });
  return NextResponse.json({ ok: true, deal });
}

export async function POST(req: NextRequest) {
  try {
    const { wantId } = await req.json();
    if (!wantId) return NextResponse.json({ ok: false, error: "wantId required" }, { status: 400 });

    const { deal, releaseTxSig } = await releaseDeal(wantId);
    return NextResponse.json({ ok: true, deal, releaseTxSig, explorerUrl: deal.explorer.release });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
