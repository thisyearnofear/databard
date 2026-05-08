/**
 * Solana Name Service (SNS) utilities.
 * Resolves .sol domains for connected wallets.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { performReverseLookup } from "@bonfida/spl-name-service";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  `https://api.${process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "mainnet-beta"}.solana.com`;

/**
 * Resolve a wallet address to its primary .sol domain.
 * Returns null if no domain is registered or on any error.
 */
export async function resolveSolDomain(walletAddress: string): Promise<string | null> {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const pubkey = new PublicKey(walletAddress);
    const domain = await performReverseLookup(connection, pubkey);
    return domain ? `${domain}.sol` : null;
  } catch {
    return null;
  }
}
