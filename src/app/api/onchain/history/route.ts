/**
 * GET /api/onchain/history?wallet=<address>
 * Returns all mint records for a given wallet address, including Grove CIDs
 * so the client can retrieve past episodes from IPFS.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMints, MintRecord } from "@/lib/mint-stats";
import { groveUriToUrl } from "@/lib/grove-storage";

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet) {
      return NextResponse.json({ ok: false, error: "wallet query param required" }, { status: 400 });
    }

    const all = await getMints();
    const records = all
      .filter((m: MintRecord) => m.walletAddress.toLowerCase() === wallet.toLowerCase())
      .sort((a: MintRecord, b: MintRecord) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((m: MintRecord) => ({
        schemaName: m.schemaName,
        healthScore: m.healthScore,
        episodeId: m.episodeId,
        txSignature: m.txSignature,
        network: m.network,
        createdAt: m.createdAt,
        groveCid: m.groveCid || null,
        groveMetadataUrl: m.groveCid ? groveUriToUrl(m.groveCid) : null,
        groveAudioUrl: m.groveAudioUrl || null,
        solDomain: (m as unknown as Record<string, unknown>).solDomain as string | null ?? null,
      }));

    return NextResponse.json({ ok: true, records, total: records.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
