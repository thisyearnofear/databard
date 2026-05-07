/**
 * POST /api/onchain/mint-solana
 * Records episode metadata on Solana via a memo transaction.
 * The client signs and submits the transaction; this route constructs it.
 *
 * Body: { schemaName, healthScore, episodeId, walletAddress, network? }
 * Returns: { ok, txSignature, explorerUrl } or { ok: false, error }
 */
import { NextRequest, NextResponse } from "next/server";
import { Connection, Transaction, PublicKey, SystemProgram } from "@solana/web3.js";
import { recordMint } from "@/lib/mint-stats";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? `https://api.${NETWORK}.solana.com`;

interface MintBody {
  schemaName: string;
  healthScore: number;
  episodeId: string;
  walletAddress: string;
  /** Base64-encoded signed transaction from the client */
  signedTxBase64?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: MintBody = await req.json();
    const { schemaName, healthScore, episodeId, walletAddress, signedTxBase64 } = body;

    if (!schemaName || !episodeId || !walletAddress) {
      return NextResponse.json(
        { ok: false, error: "schemaName, episodeId, and walletAddress required" },
        { status: 400 },
      );
    }

    // If client sent a signed transaction, broadcast it
    if (signedTxBase64) {
      const connection = new Connection(RPC_URL, "confirmed");
      const txBuffer = Buffer.from(signedTxBase64, "base64");
      const tx = Transaction.from(txBuffer);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      const explorerUrl =
        NETWORK === "mainnet-beta"
          ? `https://explorer.solana.com/tx/${signature}`
          : `https://explorer.solana.com/tx/${signature}?cluster=${NETWORK}`;

      // Record locally for the stats counter & recent feed. Never let this fail
      // the broadcast — `recordMint` swallows its own errors.
      await recordMint({
        schemaName,
        healthScore: typeof healthScore === "number" ? healthScore : 0,
        episodeId,
        walletAddress,
        txSignature: signature,
        network: NETWORK,
        createdAt: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true, txSignature: signature, explorerUrl, network: NETWORK });
    }

    // No signed tx provided — return the unsigned transaction for the client to sign
    const connection = new Connection(RPC_URL, "confirmed");
    const payer = new PublicKey(walletAddress);

    const record = JSON.stringify({
      schema_name: schemaName,
      health_score: healthScore,
      episode_id: episodeId,
      author: walletAddress,
      timestamp: new Date().toISOString(),
      network: NETWORK,
    });

    // Create a memo transaction — the memo program records arbitrary data on-chain
    const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    const memoInstruction = {
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from(record, "utf-8"),
    };

    const tx = new Transaction().add(memoInstruction);
    tx.feePayer = payer;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;

    // Serialize the unsigned transaction for the client to sign
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });

    return NextResponse.json({
      ok: true,
      unsignedTxBase64: Buffer.from(serialized).toString("base64"),
      network: NETWORK,
      record,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
