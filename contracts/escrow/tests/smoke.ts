/**
 * End-to-end smoke test for the forked DataBard escrow.
 *
 * Runs against devnet. Uses `~/.config/solana/id.json` as the buyer (must be funded — the
 * public devnet faucet is unreliable). Funds a fresh seller keypair for the tx-fee floor.
 *
 * Flow:
 *   1. deposit — buyer opens escrow with SOL locked to a fresh reference
 *   2. commit_delivery — seller commits a SHA-256 manifest hash (our fork's delta)
 *   3. release — buyer releases funds after verifying on-chain hash matches
 *
 * Run:
 *   npm run smoke   (from contracts/escrow)
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { deposit, commitDelivery, release, fetchEscrow, escrowPda } from "../client/escrow";

const NETWORK_URL = "https://api.devnet.solana.com";
const AMOUNT_SOL = 0.02;
const DEADLINE_SEC = 3600;
const SELLER_SEED_SOL = 0.005; // enough to pay commit_delivery tx fee (~5000 lamports)

function loadBuyer(): Keypair {
  const path = join(homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(readFileSync(path, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function fundFromBuyer(
  connection: Connection,
  buyer: Keypair,
  target: PublicKey,
  sol: number,
): Promise<void> {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: buyer.publicKey,
      toPubkey: target,
      lamports: Math.round(sol * LAMPORTS_PER_SOL),
    }),
  );
  await sendAndConfirmTransaction(connection, tx, [buyer], { commitment: "confirmed" });
}

async function main() {
  const connection = new Connection(NETWORK_URL, "confirmed");
  const buyer = loadBuyer();
  const seller = Keypair.generate();

  const buyerBalance = await connection.getBalance(buyer.publicKey);
  console.log("Buyer:  ", buyer.publicKey.toBase58(), `(${buyerBalance / LAMPORTS_PER_SOL} SOL)`);
  console.log("Seller: ", seller.publicKey.toBase58(), "(fresh)");

  if (buyerBalance < (AMOUNT_SOL + SELLER_SEED_SOL + 0.01) * LAMPORTS_PER_SOL) {
    throw new Error(
      `Buyer needs at least ${AMOUNT_SOL + SELLER_SEED_SOL + 0.01} SOL, has ${buyerBalance / LAMPORTS_PER_SOL}`,
    );
  }

  console.log("Seeding seller with tx-fee SOL...");
  await fundFromBuyer(connection, buyer, seller.publicKey, SELLER_SEED_SOL);

  const provider = new AnchorProvider(connection, new Wallet(buyer), { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = require("../target/idl/escrow.json");
  const program = new Program(idl, provider);

  const reference = Keypair.generate().publicKey;

  console.log("\n[1/3] Deposit");
  const depositSig = await deposit(program, buyer, seller.publicKey, reference, AMOUNT_SOL, DEADLINE_SEC);
  console.log("        ", depositSig);

  console.log("\n[2/3] Commit delivery (DataBard fork's new instruction)");
  const manifest = JSON.stringify({
    episodeId: "smoke_test_ep",
    schemaFqn: "smoke.warehouse",
    personaId: "cascade",
    audioSha256: "deadbeef",
    generatedAt: new Date().toISOString(),
  });
  const manifestHash = new Uint8Array(createHash("sha256").update(manifest).digest());
  const commitSig = await commitDelivery(program, seller, buyer.publicKey, reference, manifestHash);
  console.log("        ", commitSig);

  const stateAfterCommit = await fetchEscrow(program, buyer.publicKey, reference);
  if (!stateAfterCommit?.deliverableHash) {
    throw new Error("Expected deliverableHash to be set after commit_delivery");
  }
  const onChainHex = Buffer.from(stateAfterCommit.deliverableHash).toString("hex");
  const expectedHex = Buffer.from(manifestHash).toString("hex");
  if (onChainHex !== expectedHex) {
    throw new Error(`Manifest hash mismatch: ${onChainHex} vs ${expectedHex}`);
  }
  console.log("        on-chain hash:", onChainHex);

  console.log("\n[3/3] Release");
  const releaseSig = await release(program, buyer, seller.publicKey, reference);
  console.log("        ", releaseSig);

  const stateAfterRelease = await fetchEscrow(program, buyer.publicKey, reference);
  if (stateAfterRelease !== null) throw new Error("Expected escrow PDA to be closed after release");

  const sellerBalance = await connection.getBalance(seller.publicKey);
  console.log(`\nSeller balance: ${sellerBalance / LAMPORTS_PER_SOL} SOL (expected ~${AMOUNT_SOL + SELLER_SEED_SOL} minus commit tx fee)`);

  console.log("\n✓ Smoke test passed — DEPOSIT → COMMIT_DELIVERY (hash) → RELEASE end-to-end");
  console.log("\nExplorer links:");
  console.log("  deposit: https://explorer.solana.com/tx/" + depositSig + "?cluster=devnet");
  console.log("  commit:  https://explorer.solana.com/tx/" + commitSig + "?cluster=devnet");
  console.log("  release: https://explorer.solana.com/tx/" + releaseSig + "?cluster=devnet");
  console.log("  escrow:  https://explorer.solana.com/account/" + escrowPda(buyer.publicKey, reference).toBase58() + "?cluster=devnet");
}

main().catch((e) => {
  console.error("Smoke test failed:", e);
  process.exit(1);
});
