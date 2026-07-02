/**
 * Auto-mint on settle — the seller's server-side keypair signs a memo transaction attesting
 * to the settled Deal. This lands a public, verifiable record of the sale on-chain (no
 * DataBard cache required to verify — anyone can query the memo program for a persona's
 * public key and see their sales history).
 *
 * Why it matters: turns persona reputation from an in-app number into a cryptographic
 * primitive. Buyers who don't trust our leaderboard can trust the chain.
 *
 * Failure mode is silent — a failed mint MUST NOT stop the release. The release already
 * paid the seller; the mint is post-hoc attestation.
 */
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { Deal } from "../types";
import { getSellerKeypair } from "./sellers";
import { recordMint } from "../mint-stats";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";
const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? `https://api.${NETWORK}.solana.com`;
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function explorerUrl(kind: "tx" | "account", value: string): string {
  const suffix = NETWORK === "mainnet-beta" ? "" : `?cluster=${NETWORK}`;
  return `https://explorer.solana.com/${kind}/${value}${suffix}`;
}

export interface MintOnSettleResult {
  ok: boolean;
  txSignature?: string;
  explorerUrl?: string;
  reason?: string;
}

export async function mintOnSettle(deal: Deal): Promise<MintOnSettleResult> {
  try {
    const seller = getSellerKeypair(deal.personaId);
    const connection = new Connection(RPC_URL, "confirmed");

    // Memo payload — compact; the on-chain record is the source of truth.
    const memo = JSON.stringify({
      kind: "databard-market-settlement",
      version: 1,
      wantId: deal.wantId,
      personaId: deal.personaId,
      buyer: deal.buyer,
      priceLamports: deal.priceLamports,
      manifestHash: deal.manifestHash ?? null,
      settledAt: deal.updatedAt,
    });

    const ix = new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: seller.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from(memo, "utf-8"),
    });

    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [seller], {
      commitment: "confirmed",
    });

    // Feed the existing recent-mints ledger so the leaderboard picks it up.
    // schemaName here is the deal's schema for consistency with existing consumers.
    await recordMint({
      schemaName: deal.want.schemaFqn,
      healthScore: 0,                  // not applicable; reputation is orthogonal
      episodeId: deal.wantId,
      walletAddress: seller.publicKey.toBase58(),
      reportHash: deal.manifestHash ?? "",
      txSignature: sig,
      network: NETWORK,
      createdAt: new Date().toISOString(),
      teamId: `persona:${deal.personaId}`, // groups by persona in the existing team-history feed
    });

    return { ok: true, txSignature: sig, explorerUrl: explorerUrl("tx", sig) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[mint-on-settle] failed for ${deal.wantId}:`, msg.slice(0, 200));
    return { ok: false, reason: msg.slice(0, 200) };
  }
}
