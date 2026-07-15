/**
 * Escrow settlement backend — wraps the forked Solana escrow program.
 *
 * Deposit / commit_delivery / release / refund, all through anchor.Program with our inlined IDL.
 * This is the operational counterpart to contracts/escrow/client/escrow.ts (which is used only
 * by anchor test scripts). The Next.js app talks to on-chain through THIS module.
 */
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

/**
 * Minimal Wallet implementation. `@coral-xyz/anchor`'s built-in `Wallet` export gets mangled
 * by Next.js webpack ESM interop, so we implement the same three-method interface locally.
 */
class KeypairWallet {
  constructor(readonly payer: Keypair) {}
  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) {
      tx.sign([this.payer]);
    } else {
      tx.partialSign(this.payer);
    }
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((t) => this.signTransaction(t)));
  }
}
import { createHash } from "crypto";
import { store } from "../../store";
import { explorerUrl, type SettlementBackend, type VerifyRequest, type VerifyResult } from "../verifier";
import { ESCROW_IDL } from "./escrow-idl";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? `https://api.${NETWORK}.solana.com`;

const KEYPAIR_TTL = 86400 * 365 * 10;

/** Program ID — from env, falling back to the upstream devnet deployment (must redeploy for our fork). */
function programId(): PublicKey {
  return new PublicKey(
    process.env.NEXT_PUBLIC_ESCROW_PROGRAM_ID ?? "ErwrNVN9DgGvPkHTm1KziXhHjWm6ehE2MUnsauYmfgdK",
  );
}

/** Watchdog's server-side buyer keypair. Persisted so escrow references survive restarts. */
export function getWatchdogKeypair(): Keypair {
  const key = "watchdog-buyer-key";
  const cached = store.get<string>(key);
  if (cached) return Keypair.fromSecretKey(Buffer.from(cached, "base64"));
  const kp = Keypair.generate();
  store.set(key, Buffer.from(kp.secretKey).toString("base64"), KEYPAIR_TTL);
  return kp;
}

function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

function getProgram(signer: Keypair): Program {
  const provider = new AnchorProvider(getConnection(), new KeypairWallet(signer), {
    commitment: "confirmed",
  });
  // The IDL is `as const` so the runtime shape needs a widening cast — the Program constructor
  // does its own validation at runtime.
  return new Program(ESCROW_IDL as unknown as Program["idl"], provider);
}

function escrowPda(buyer: PublicKey, reference: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), buyer.toBuffer(), reference.toBuffer()],
    programId(),
  )[0];
}

/** SHA-256 of an arbitrary Buffer / string, returned as { bytes, hex }. */
export function sha256(input: string | Uint8Array): { bytes: Uint8Array; hex: string } {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : Buffer.from(input);
  const digest = createHash("sha256").update(buf).digest();
  return { bytes: new Uint8Array(digest), hex: digest.toString("hex") };
}

export interface DepositInput {
  buyer: Keypair;
  seller: PublicKey;
  reference: PublicKey;
  amountLamports: number;
  deadlineSec: number;
}

export async function deposit(input: DepositInput): Promise<string> {
  const program = getProgram(input.buyer);
  const deadline = new BN(Math.floor(Date.now() / 1000) + input.deadlineSec);
  const sig = await program.methods
    .initialize(new BN(input.amountLamports), input.reference, deadline)
    .accounts({
      buyer: input.buyer.publicKey,
      seller: input.seller,
      escrow: escrowPda(input.buyer.publicKey, input.reference),
    })
    .signers([input.buyer])
    .rpc();
  return sig;
}

export interface CommitDeliveryInput {
  seller: Keypair;
  buyer: PublicKey;
  reference: PublicKey;
  manifestHash: Uint8Array;
}

export async function commitDelivery(input: CommitDeliveryInput): Promise<string> {
  if (input.manifestHash.length !== 32) throw new Error("manifestHash must be 32 bytes");
  const program = getProgram(input.seller);
  const sig = await program.methods
    .commitDelivery(Array.from(input.manifestHash))
    .accounts({
      seller: input.seller.publicKey,
      escrow: escrowPda(input.buyer, input.reference),
    })
    .signers([input.seller])
    .rpc();
  return sig;
}

export interface ReleaseInput {
  buyer: Keypair;
  seller: PublicKey;
  reference: PublicKey;
}

export async function release(input: ReleaseInput): Promise<string> {
  const program = getProgram(input.buyer);
  const sig = await program.methods
    .release()
    .accounts({
      buyer: input.buyer.publicKey,
      seller: input.seller,
      escrow: escrowPda(input.buyer.publicKey, input.reference),
    })
    .signers([input.buyer])
    .rpc();
  return sig;
}

export interface EscrowState {
  buyer: PublicKey;
  seller: PublicKey;
  amount: BN;
  reference: PublicKey;
  deadline: BN;
  deliverableHash: number[] | null;
  bump: number;
}

export async function fetchEscrowState(
  buyer: PublicKey,
  reference: PublicKey,
): Promise<EscrowState | null> {
  const program = getProgram(getWatchdogKeypair());
  const acct = await (program.account as any).escrow.fetchNullable(escrowPda(buyer, reference));
  return acct as EscrowState | null;
}

/**
 * SettlementBackend impl — verify checks that the escrow PDA exists, holds the expected amount
 * for the expected recipient, and (if requested) that the deliverable hash matches.
 */
export const escrowBackend: SettlementBackend = {
  id: "escrow",

  async verify(req: VerifyRequest): Promise<VerifyResult> {
    // reference = "<buyerPubkey>:<referencePubkey>" so we can look up the PDA.
    const [buyerStr, refStr] = req.reference.split(":");
    if (!buyerStr || !refStr) {
      return { status: "not-found", detail: "reference must be '<buyerPubkey>:<referencePubkey>'" };
    }
    const buyer = new PublicKey(buyerStr);
    const reference = new PublicKey(refStr);
    const acct = await fetchEscrowState(buyer, reference);
    if (!acct) return { status: "not-found", detail: "Escrow PDA does not exist" };

    if (req.expectedAmount != null && acct.amount.toNumber() < req.expectedAmount) {
      return {
        status: "mismatched",
        detail: `Escrow holds ${acct.amount.toNumber()} lamports, expected ≥ ${req.expectedAmount}`,
      };
    }
    if (req.expectedRecipient) {
      const expected = new PublicKey(req.expectedRecipient);
      if (!acct.seller.equals(expected)) {
        return { status: "mismatched", detail: "Seller on-chain does not match expected recipient" };
      }
    }
    if (req.expectedManifestHash) {
      if (!acct.deliverableHash) {
        return { status: "pending", detail: "Seller has not yet committed a delivery hash" };
      }
      const onChainHex = Buffer.from(acct.deliverableHash).toString("hex");
      if (onChainHex !== req.expectedManifestHash) {
        return {
          status: "mismatched",
          detail: `Manifest hash mismatch: on-chain ${onChainHex}, expected ${req.expectedManifestHash}`,
        };
      }
    }

    return {
      status: "verified",
      explorerUrl: explorerUrl("account", escrowPda(buyer, reference)),
    };
  },
};

export { escrowPda, LAMPORTS_PER_SOL };
