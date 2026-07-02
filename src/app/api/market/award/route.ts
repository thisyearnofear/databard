/**
 * POST /api/market/award — buyer picks a winning bid and deposits into escrow.
 *
 * Body: { wantId }
 * Returns: { ok, deal, depositTxSig, explorerUrl }
 *
 * For the demo, this uses the Watchdog server-side keypair. External buyers should route
 * through a partial-signed transaction flow (not implemented here).
 */
import { NextRequest, NextResponse } from "next/server";
import { award } from "@/lib/market/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const { wantId } = await req.json();
    if (!wantId) return NextResponse.json({ ok: false, error: "wantId required" }, { status: 400 });

    const { deal, depositTxSig } = await award(wantId);
    return NextResponse.json({
      ok: true,
      deal,
      depositTxSig,
      explorerUrl: deal.explorer.deposit,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
