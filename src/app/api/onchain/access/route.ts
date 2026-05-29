/**
 * GET /api/onchain/access?walletAddress=...&episodeId=...
 * Returns whether a wallet holds a mint for the given episode (gated access check).
 * Also accepts ?txSignature=... to look up by transaction signature directly.
 * If only episodeId is provided (no wallet), checks if episode has been minted at all (public verification).
 */
import { NextRequest, NextResponse } from "next/server";
import { walletHoldsMint, getMintByTx, episodeHasMint } from "@/lib/mint-stats";

export async function GET(req: NextRequest) {
  try {
    const txSignature = req.nextUrl.searchParams.get("txSignature");
    if (txSignature) {
      const mint = await getMintByTx(txSignature);
      return NextResponse.json({ ok: true, hasAccess: !!mint, mint: mint ?? null });
    }

    const walletAddress = req.nextUrl.searchParams.get("walletAddress");
    const episodeId = req.nextUrl.searchParams.get("episodeId");

    if (!episodeId) {
      return NextResponse.json(
        { ok: false, error: "episodeId (or txSignature) is required" },
        { status: 400 },
      );
    }

    // Public verification: is this episode minted by anyone?
    if (!walletAddress) {
      const mint = await episodeHasMint(episodeId);
      return NextResponse.json({ ok: true, hasAccess: false, isMintedAtAll: !!mint, mint: mint ?? null });
    }

    const mint = await walletHoldsMint(walletAddress, episodeId);
    return NextResponse.json({ ok: true, hasAccess: !!mint, mint: mint ?? null });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
