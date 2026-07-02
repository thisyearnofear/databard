/**
 * TypeScript client for the DataBard escrow program.
 * Forked from solana_coralOS with one new instruction: commit_delivery(hash).
 *
 * Requires `anchor build` first (generates ../target/types/escrow.ts + the IDL).
 * Used by src/lib/settlement/backends/escrow.ts in the main app.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

/** Deployed to devnet. Run `anchor keys sync` after a fresh build to set your own. */
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_ESCROW_PROGRAM_ID ?? "DCq82m9wgkgQGVqokKmYsvjv9Ym8Lyz8usKvcSwUS3kY",
);

/** Derive the per-order escrow PDA: one per (buyer, reference). */
export function escrowPda(buyer: PublicKey, reference: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), buyer.toBuffer(), reference.toBuffer()],
    PROGRAM_ID,
  )[0];
}

/** Buyer deposits `amountSol` for `reference`, refundable `deadlineSecs` from now. */
export async function deposit(
  program: Program<any>,
  buyer: Keypair,
  seller: PublicKey,
  reference: PublicKey,
  amountSol: number,
  deadlineSecs: number,
): Promise<string> {
  const deadline = new BN(Math.floor(Date.now() / 1000) + deadlineSecs);
  return program.methods
    .initialize(new BN(Math.round(amountSol * LAMPORTS_PER_SOL)), reference, deadline)
    .accounts({ buyer: buyer.publicKey, seller, escrow: escrowPda(buyer.publicKey, reference) })
    .signers([buyer])
    .rpc();
}

/**
 * Seller commits the SHA-256 hash of the delivered episode manifest.
 * The buyer's client verifies its downloaded audio matches this hash before calling `release`.
 * This is DataBard's delta vs. the upstream escrow.
 */
export async function commitDelivery(
  program: Program<any>,
  seller: Keypair,
  buyer: PublicKey,
  reference: PublicKey,
  manifestHash: Uint8Array,
): Promise<string> {
  if (manifestHash.length !== 32) throw new Error("manifestHash must be 32 bytes (SHA-256)");
  return program.methods
    .commitDelivery(Array.from(manifestHash))
    .accounts({ seller: seller.publicKey, escrow: escrowPda(buyer, reference) })
    .signers([seller])
    .rpc();
}

/** Buyer confirms delivery → pay the seller and close the escrow. */
export async function release(
  program: Program<any>,
  buyer: Keypair,
  seller: PublicKey,
  reference: PublicKey,
): Promise<string> {
  return program.methods
    .release()
    .accounts({ buyer: buyer.publicKey, seller, escrow: escrowPda(buyer.publicKey, reference) })
    .signers([buyer])
    .rpc();
}

/**
 * Seller-side check: does a funded escrow exist for `(buyer, reference)` naming this seller,
 * holding at least `minAmountSol`? Returns the fetched account (or null) so callers can also read
 * `deliverable_hash` state without a second RPC.
 */
export async function fetchEscrow(
  program: Program<any>,
  buyer: PublicKey,
  reference: PublicKey,
): Promise<{
  buyer: PublicKey;
  seller: PublicKey;
  amount: BN;
  reference: PublicKey;
  deadline: BN;
  deliverableHash: number[] | null;
  bump: number;
} | null> {
  return program.account.escrow.fetchNullable(escrowPda(buyer, reference));
}

export async function isFunded(
  program: Program<any>,
  buyer: PublicKey,
  seller: PublicKey,
  reference: PublicKey,
  minAmountSol = 0,
): Promise<boolean> {
  const acct = await fetchEscrow(program, buyer, reference);
  if (!acct) return false;
  const partiesOk = acct.buyer.equals(buyer) && acct.seller.equals(seller);
  const amountOk = acct.amount.toNumber() >= Math.round(minAmountSol * LAMPORTS_PER_SOL);
  return partiesOk && amountOk;
}

/** Buyer reclaims the deposit after the deadline (seller never delivered). */
export async function refund(
  program: Program<any>,
  buyer: Keypair,
  reference: PublicKey,
): Promise<string> {
  return program.methods
    .refund()
    .accounts({ buyer: buyer.publicKey, escrow: escrowPda(buyer.publicKey, reference) })
    .signers([buyer])
    .rpc();
}
