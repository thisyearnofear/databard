/**
 * Probe Attestation — writes a verdict hash to X Layer as an on-chain record.
 *
 * Uses a simple zero-value transaction whose `data` field carries the
 * keccak256 hash of the JSON-serialised verdict. This creates an immutable,
 * timestamped proof that DataBard Probe evaluated a set of services at a
 * given time.
 *
 * Requires env:
 *   PROBE_ATTESTATION_PK  — private key of the wallet that signs the tx
 *   PROBE_RPC_URL         — X Layer RPC (defaults to https://xlayerrpc.okx.com)
 */

import { createHash } from "crypto";

const XLAYER_RPC = process.env.PROBE_RPC_URL || "https://xlayerrpc.okx.com";

export interface AttestationResult {
  txHash: string;
  blockNumber?: number;
  attestedAt: string;
}

/**
 * Hash a verdict object into a 32-byte hex digest suitable for on-chain data.
 */
export function hashVerdict(verdict: unknown): string {
  const json = JSON.stringify(verdict);
  return "0x" + createHash("sha256").update(json).digest("hex");
}

/**
 * Write the verdict hash on-chain as a zero-value transaction to self.
 * Returns the tx hash once broadcast.
 *
 * This uses viem (already in the project deps) for signing + sending.
 */
export async function attestVerdict(
  verdict: unknown
): Promise<AttestationResult> {
  const pk = process.env.PROBE_ATTESTATION_PK;
  if (!pk) {
    throw new Error(
      "PROBE_ATTESTATION_PK not set — cannot write attestation to X Layer."
    );
  }

  // Dynamic import to keep the module light when attestation isn't needed
  const { createWalletClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { xLayer } = await import("viem/chains");

  const account = privateKeyToAccount(pk as `0x${string}`);
  const client = createWalletClient({
    account,
    chain: xLayer,
    transport: http(XLAYER_RPC),
  });

  const data = hashVerdict(verdict) as `0x${string}`;

  const txHash = await client.sendTransaction({
    to: account.address, // self-send: cheapest way to anchor data on-chain
    value: BigInt(0),
    data,
  });

  return {
    txHash,
    attestedAt: new Date().toISOString(),
  };
}
