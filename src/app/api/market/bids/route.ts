/**
 * GET /api/market/bids?wantId=xxx — list bids for a WANT.
 *
 * Dashboard uses this to render the live auction. If ?stream=1 is set, returns SSE (future).
 */
import { NextRequest, NextResponse } from "next/server";
import { getWant, listBidsForWant } from "@/lib/market/protocol";

export async function GET(req: NextRequest) {
  const wantId = req.nextUrl.searchParams.get("wantId");
  if (!wantId) return NextResponse.json({ ok: false, error: "wantId required" }, { status: 400 });

  const want = getWant(wantId);
  if (!want) return NextResponse.json({ ok: false, error: "want not found" }, { status: 404 });

  const bids = listBidsForWant(wantId);
  return NextResponse.json({ ok: true, want, bids });
}
