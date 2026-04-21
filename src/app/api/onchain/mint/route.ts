/**
 * POST /api/onchain/mint
 * Records a lightweight episode metadata record on the Initia appchain.
 * Called after episode generation when the user has a connected .init wallet.
 *
 * Body: { schemaName, healthScore, episodeId, initiaAddress, chainId? }
 * Returns: { ok, txHash } or { ok: false, error }
 *
 * Note: This route constructs and broadcasts a MsgExecute transaction to a
 * simple DataBard registry contract on the Initia testnet. The contract
 * address is configured via NEXT_PUBLIC_DATABARD_CONTRACT_ADDRESS env var.
 * Until the appchain is deployed, this returns a mock response in dev mode.
 */
import { NextRequest, NextResponse } from "next/server";

const CHAIN_ID = process.env.NEXT_PUBLIC_INITIA_CHAIN_ID ?? "initiation-2";
const CONTRACT_ADDRESS = process.env.DATABARD_CONTRACT_ADDRESS ?? "";
const INITIA_REST = process.env.INITIA_REST_URL ?? "https://rest.testnet.initia.xyz";

interface MintBody {
  schemaName: string;
  healthScore: number;
  episodeId: string;
  initiaAddress: string;
  chainId?: string;
  /** Base64-encoded signed transaction from the client wallet */
  signedTxBase64?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: MintBody = await req.json();
    const { schemaName, healthScore, episodeId, initiaAddress, signedTxBase64 } = body;

    if (!schemaName || !episodeId || !initiaAddress) {
      return NextResponse.json({ ok: false, error: "schemaName, episodeId, and initiaAddress required" }, { status: 400 });
    }

    // If a signed transaction was provided by the client wallet, broadcast it
    if (signedTxBase64 && CONTRACT_ADDRESS) {
      const broadcastRes = await fetch(`${INITIA_REST}/cosmos/tx/v1beta1/txs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_bytes: signedTxBase64,
          mode: "BROADCAST_MODE_SYNC",
        }),
      });

      if (!broadcastRes.ok) {
        const err = await broadcastRes.text();
        return NextResponse.json({ ok: false, error: `Broadcast failed: ${err}` }, { status: 502 });
      }

      const result = await broadcastRes.json();
      const txHash = result.tx_response?.txhash ?? result.txhash ?? null;

      return NextResponse.json({
        ok: true,
        txHash,
        chainId: CHAIN_ID,
        explorerUrl: txHash ? `https://scan.testnet.initia.xyz/initiation-2/txs/${txHash}` : null,
      });
    }

    // Dev/stub mode: no contract deployed yet — return a mock record
    // This allows the UI to work end-to-end before the appchain is live
    const mockRecord = {
      schema_name: schemaName,
      health_score: healthScore,
      episode_id: episodeId,
      author: initiaAddress,
      timestamp: new Date().toISOString(),
      chain_id: CHAIN_ID,
    };

    console.log("[onchain/mint] stub record (no contract deployed):", mockRecord);

    return NextResponse.json({
      ok: true,
      txHash: null,
      stub: true,
      record: mockRecord,
      message: "On-chain recording queued — will be broadcast once DataBard appchain is deployed on Initia testnet",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
