/**
 * Market orchestrator — composes protocol + sellers + buyer + settlement into the WANT
 * lifecycle. Routes call these helpers; they never touch escrow directly.
 *
 * State machine:
 *   post()      creates WANT, auto-bids from internal personas → returns { want, bids }
 *   award()     buyer picks a bid, deposits into escrow → returns Deal (state=deposited)
 *   deliver()   seller runs pipeline, hashes manifest, commits on-chain → Deal.state=delivered
 *   release()   buyer confirms delivery → Deal.state=released
 *
 * For the machine-buyer (Watchdog) path, award/release run automatically with the server-side
 * Watchdog keypair. External buyers get a partial-transaction that their wallet signs.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import type { Bid, Deal, Want } from "../types";
import { getPersona } from "../voice-config";
import { pickBid } from "./buyer";
import {
  autoBidInternal,
  generateReference,
  getSellerKeypair,
} from "./sellers";
import { getConsumerKeypair, getDigestBuyerKeypair } from "./reseller";
import {
  createDeal,
  createWant,
  getDeal,
  getWant,
  listBidsForWant,
  transitionWant,
  updateDeal,
  type CreateWantInput,
} from "./protocol";
import {
  commitDelivery,
  deposit,
  fetchEscrowState,
  getWatchdogKeypair,
  release,
  sha256,
} from "../settlement/backends/escrow";

/**
 * Resolve the server-side keypair for a given buyer pubkey.
 * The market supports three server-side actors: Watchdog, Consumer, and Digest (sub-buyer).
 */
function getBuyerKeypair(buyerPubkey: string): Keypair {
  const wd = getWatchdogKeypair();
  if (wd.publicKey.toBase58() === buyerPubkey) return wd;
  const consumer = getConsumerKeypair();
  if (consumer.publicKey.toBase58() === buyerPubkey) return consumer;
  const digest = getDigestBuyerKeypair();
  if (digest.publicKey.toBase58() === buyerPubkey) return digest;
  throw new Error(`No server-side keypair known for buyer ${buyerPubkey}`);
}
import { explorerUrl } from "../settlement/verifier";
import { recordWin } from "./reputation";
import { mintOnSettle } from "./mint-on-settle";

/* ---------- 1) POST WANT ---------- */

export interface PostWantResult {
  want: Want;
  bids: Bid[];
}

/** Post a WANT and auto-bid internal personas. */
export function post(input: CreateWantInput): PostWantResult {
  const want = createWant(input);
  const bids = autoBidInternal(want);
  return { want, bids };
}

/* ---------- 2) AWARD ---------- */

export interface AwardResult {
  deal: Deal;
  depositTxSig: string;
}

/**
 * Buyer picks a bid and deposits into escrow. For the machine (Watchdog) path, uses the
 * server-side buyer keypair. External buyers should route through a wallet-signed variant
 * (not implemented for the demo — Watchdog is the canonical machine buyer).
 */
export async function award(wantId: string): Promise<AwardResult> {
  const want = getWant(wantId);
  if (!want) throw new Error(`Want ${wantId} not found`);
  const bids = listBidsForWant(wantId);
  const pick = await pickBid(want, bids);
  if (!pick) throw new Error(`No qualifying bid for ${wantId}`);

  const winningBid = bids.find((b) => b.id === pick.award.winningBidId);
  if (!winningBid) throw new Error("Winning bid disappeared");

  // Mint a fresh reference (32-byte pubkey) that seeds the escrow PDA.
  const reference = generateReference();
  const referencePk = new PublicKey(reference);

  const buyerKp = getBuyerKeypair(want.buyer.publicKey);
  const sellerKp = getSellerKeypair(winningBid.personaId);

  // WANT → awarded
  transitionWant(wantId, "awarded");

  // Deposit into escrow.
  const depositTxSig = await deposit({
    buyer: buyerKp,
    seller: sellerKp.publicKey,
    reference: referencePk,
    amountLamports: winningBid.priceLamports,
    deadlineSec: want.deadlineSec,
  });

  transitionWant(wantId, "deposited");

  const deal: Deal = {
    wantId,
    reference,
    buyer: buyerKp.publicKey.toBase58(),
    seller: sellerKp.publicKey.toBase58(),
    personaId: winningBid.personaId,
    priceLamports: winningBid.priceLamports,
    state: "deposited",
    explorer: { deposit: explorerUrl("tx", depositTxSig) },
    want,
    winningBid,
    award: pick.award,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  createDeal(deal);
  return { deal, depositTxSig };
}

/* ---------- 3) DELIVER ---------- */

export interface DeliverInput {
  wantId: string;
  /** Manifest identifying the deliverable — hashed to produce the on-chain commitment. */
  manifest: {
    episodeId: string;
    schemaFqn: string;
    personaId: string;
    audioUrl?: string;
    audioSha256?: string;
    generatedAt: string;
  };
}

export interface DeliverResult {
  deal: Deal;
  manifestHashHex: string;
  commitTxSig: string;
}

/**
 * Seller (persona) hashes the manifest, calls `commit_delivery` on-chain.
 * The seller is identified by the winning bid's personaId; the seller keypair signs.
 */
export async function deliver(input: DeliverInput): Promise<DeliverResult> {
  const deal = getDeal(input.wantId);
  if (!deal) throw new Error(`Deal ${input.wantId} not found`);
  if (deal.state !== "deposited") throw new Error(`Deal ${input.wantId} is ${deal.state}, expected deposited`);
  if (deal.personaId !== input.manifest.personaId) {
    throw new Error(`Manifest persona ${input.manifest.personaId} does not match awarded persona ${deal.personaId}`);
  }

  const manifestJson = JSON.stringify(input.manifest);
  const { bytes: manifestHashBytes, hex: manifestHashHex } = sha256(manifestJson);

  const sellerKp = getSellerKeypair(deal.personaId);
  const commitTxSig = await commitDelivery({
    seller: sellerKp,
    buyer: new PublicKey(deal.buyer),
    reference: new PublicKey(deal.reference),
    manifestHash: manifestHashBytes,
  });

  transitionWant(input.wantId, "delivered");
  const updated = updateDeal(input.wantId, {
    manifestHash: manifestHashHex,
    state: "delivered",
    explorer: { commit: explorerUrl("tx", commitTxSig) },
  });
  if (!updated) throw new Error(`Deal disappeared during deliver`);

  return { deal: updated, manifestHashHex, commitTxSig };
}

/* ---------- 4) RELEASE ---------- */

export interface ReleaseResult {
  deal: Deal;
  releaseTxSig: string;
}

/**
 * Buyer releases funds after verifying the on-chain manifest hash matches what they received.
 * For the Watchdog path, this runs server-side; external buyers sign a partial tx (future).
 */
export async function releaseDeal(wantId: string): Promise<ReleaseResult> {
  const deal = getDeal(wantId);
  if (!deal) throw new Error(`Deal ${wantId} not found`);
  if (deal.state !== "delivered") throw new Error(`Deal ${wantId} is ${deal.state}, expected delivered`);

  // Optional trust-but-verify: refetch the escrow state and compare hashes before releasing.
  const buyerPk = new PublicKey(deal.buyer);
  const referencePk = new PublicKey(deal.reference);
  const state = await fetchEscrowState(buyerPk, referencePk);
  if (!state?.deliverableHash) {
    throw new Error(`Escrow has no committed deliverable hash — cannot release`);
  }
  const onChainHex = Buffer.from(state.deliverableHash).toString("hex");
  if (onChainHex !== deal.manifestHash) {
    throw new Error(`Manifest hash mismatch: on-chain ${onChainHex}, local ${deal.manifestHash}`);
  }

  const buyerKp = getBuyerKeypair(deal.buyer);
  const sellerPersona = getPersona(deal.personaId);
  if (!sellerPersona) throw new Error(`Unknown persona ${deal.personaId}`);
  const sellerKp = getSellerKeypair(deal.personaId);

  const releaseTxSig = await release({
    buyer: buyerKp,
    seller: sellerKp.publicKey,
    reference: referencePk,
  });

  transitionWant(wantId, "released");
  const updated = updateDeal(wantId, {
    state: "released",
    explorer: { release: explorerUrl("tx", releaseTxSig) },
  });
  if (!updated) throw new Error(`Deal disappeared during release`);

  // Reputation flywheel — the seller just got paid; count the win.
  recordWin(deal.personaId, deal.priceLamports);

  // Auto-mint on-chain: seller signs a memo attesting to this settled deal. Verifiable
  // reputation outside DataBard's cache. Non-blocking — a failed mint doesn't invalidate
  // the release that already fired.
  let mintResult: Awaited<ReturnType<typeof mintOnSettle>> | undefined;
  try {
    mintResult = await mintOnSettle(updated);
    if (mintResult.ok && mintResult.txSignature) {
      const withMint = updateDeal(wantId, {
        explorer: { mint: mintResult.explorerUrl },
      });
      if (withMint) Object.assign(updated, withMint);
    }
  } catch (err) {
    console.warn("[Orchestrator] mint-on-settle threw (non-fatal):", err);
  }

  // If this was a reseller (Digest) deal, cascade the release to sub-escrows so its
  // downstream sellers get paid too. Import is dynamic to avoid a cycle.
  if (deal.personaId === "digest") {
    try {
      const { resellerReleaseAll } = await import("./reseller");
      await resellerReleaseAll(wantId);
    } catch (err) {
      console.warn("[Orchestrator] Reseller cascade release failed:", err);
    }
  }

  return { deal: updated, releaseTxSig };
}
