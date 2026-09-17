import {
  PublicKey, Transaction, TransactionInstruction,
  type Connection, type VersionedMessage, type LoadedAddresses,
} from "@solana/web3.js";
import { verifyEvidenceReceipt } from "../evidence-receipt";
import type { EvidenceReceipt } from "../evidence-receipt";
import type { AttestationAdapter, AttestationReference, AttestationVerification } from "./types";

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/** Exact domain-separated commitment. No report content or private metadata goes on-chain. */
export function solanaReceiptMemo(receipt: EvidenceReceipt): string {
  if (!verifyEvidenceReceipt(receipt)) throw new Error("Invalid evidence receipt");
  return `databard:evidence-receipt:v1:sha256:${receipt.payloadHash}`;
}

interface ReceiptTransaction {
  slot: number;
  meta: { err: unknown; loadedAddresses?: LoadedAddresses | null } | null;
  transaction: { message: VersionedMessage; signatures: string[] };
}

/** Structural RPC boundary allows offline tests and real web3.js Connection instances. */
export interface SolanaReceiptRpc {
  getGenesisHash(): Promise<string>;
  getTransaction(signature: string, options: {
    commitment: "confirmed" | "finalized";
    maxSupportedTransactionVersion: 0;
  }): Promise<ReceiptTransaction | null>;
}

/**
 * RPC-backed inclusion, not a light-client proof. Requires the expected signer on the
 * matching Memo instruction, not merely somewhere else in the transaction.
 * A missing confirmed transaction is unknown/not-found, NOT proof of pending status.
 */
export async function verifySolanaReceipt(
  receipt: unknown,
  reference: AttestationReference,
  rpc: SolanaReceiptRpc,
  finality: "confirmed" | "finalized" = "confirmed",
): Promise<AttestationVerification> {
  const result: AttestationVerification = {
    integrity: verifyEvidenceReceipt(receipt) ? "valid" : "invalid",
    inclusion: "not-checked",
    issuerAuthenticated: false,
  };
  if (result.integrity === "invalid") return result;
  let issuer: PublicKey;
  try {
    issuer = new PublicKey(reference.issuer);
    if (!reference.chain.startsWith("solana:") || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(reference.transactionId)) {
      return { ...result, inclusion: "mismatch" };
    }
  } catch {
    return { ...result, inclusion: "mismatch" };
  }
  try {
    if (reference.chain !== `solana:${await rpc.getGenesisHash()}`) return { ...result, inclusion: "mismatch" };
    const tx = await rpc.getTransaction(reference.transactionId, {
      commitment: finality, maxSupportedTransactionVersion: 0,
    });
    if (!tx) return { ...result, inclusion: "not-found" };
    if (tx.transaction.signatures[0] !== reference.transactionId) return { ...result, inclusion: "mismatch" };
    if (!tx.meta) return { ...result, inclusion: "not-checked" };
    if (tx.meta.err !== null) return { ...result, inclusion: "failed" };
    const message = tx.transaction.message;
    const keys = message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses ?? undefined });
    const expectedMemo = Buffer.from(solanaReceiptMemo(receipt as EvidenceReceipt), "utf8");
    const matching = message.compiledInstructions.some((ix) => {
      if (!keys.get(ix.programIdIndex)?.equals(MEMO_PROGRAM)) return false;
      if (!Buffer.from(ix.data).equals(expectedMemo)) return false;
      return ix.accountKeyIndexes.some((index) =>
        message.isAccountSigner(index) && keys.get(index)?.equals(issuer),
      );
    });
    if (!matching) return { ...result, inclusion: "mismatch" };
    return { ...result, inclusion: finality, issuerAuthenticated: true, slot: tx.slot };
  } catch {
    // Do not turn RPC outages, unavailable lookup addresses or malformed RPC data into success.
    return { ...result, inclusion: "rpc-error" };
  }
}

export function createSolanaAttestationAdapter(
  rpc: SolanaReceiptRpc & Pick<Connection, "getLatestBlockhash">,
  finality: "confirmed" | "finalized" = "confirmed",
): AttestationAdapter {
  return {
    async prepare(receipt, issuer) {
      const memo = solanaReceiptMemo(receipt);
      const payer = new PublicKey(issuer);
      const [genesis, latest] = await Promise.all([
        rpc.getGenesisHash(), rpc.getLatestBlockhash(finality),
      ]);
      const tx = new Transaction({ feePayer: payer, ...latest }).add(new TransactionInstruction({
        programId: MEMO_PROGRAM,
        keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
        data: Buffer.from(memo, "utf8"),
      }));
      return {
        chain: `solana:${genesis}`, issuer: payer.toBase58(), payloadHash: receipt.payloadHash,
        unsignedTransactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
        ...latest,
      };
    },
    verify: (receipt, reference) => verifySolanaReceipt(receipt, reference, rpc, finality),
  };
}
