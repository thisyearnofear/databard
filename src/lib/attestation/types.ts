import type { EvidenceReceipt } from "../evidence-receipt";

/** Network-qualified identity; Solana adapters use solana:<genesis hash>. */
export interface AttestationReference {
  chain: string;
  transactionId: string;
  /** Expected signer supplied by the verifier, NOT taken from receipt.payload.issuer. */
  issuer: string;
}

export interface AttestationVerification {
  integrity: "valid" | "invalid";
  inclusion: "not-checked" | "not-found" | "confirmed" | "finalized" | "failed" | "mismatch" | "rpc-error";
  /** True only for the expected wallet on the matching, successful commitment. */
  issuerAuthenticated: boolean;
  slot?: number;
}

export interface PreparedAttestation {
  chain: string;
  issuer: string;
  payloadHash: string;
  unsignedTransactionBase64: string;
  /** Included for expiry handling, never treated as inclusion evidence. */
  blockhash: string;
  lastValidBlockHeight: number;
}

/** Read/build capability only. Payments and transaction submission are deliberately separate. */
export interface AttestationAdapter {
  prepare(receipt: EvidenceReceipt, issuer: string): Promise<PreparedAttestation>;
  verify(receipt: unknown, reference: AttestationReference): Promise<AttestationVerification>;
}
