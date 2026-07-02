/**
 * Settlement verifier — one interface, three backends.
 *
 * Every DataBard payment (Stripe subscription, PUSD one-shot, on-chain escrow) implements the
 * same shape: authorize → verify → activate. This module owns the interface so the checkout
 * routes and market routes both consume settlement identically.
 *
 * Individual backends live in ./backends/*.ts.
 */
import type { PublicKey } from "@solana/web3.js";

export type SettlementBackendId = "escrow" | "pusd" | "stripe";

export interface VerifyRequest {
  /** Backend-specific reference: escrow reference Pubkey, Solana tx signature, Stripe session id. */
  reference: string;
  /** Amount in the backend's native unit (lamports for escrow/PUSD, cents for Stripe). */
  expectedAmount?: number;
  /** For escrow: expected recipient (seller) pubkey. For PUSD: expected treasury pubkey. */
  expectedRecipient?: string;
  /** For escrow: expected deliverable_hash (SHA-256 hex) after seller commit. */
  expectedManifestHash?: string;
}

export type VerifyStatus =
  | "pending"      // On-chain / API state exists but doesn't yet satisfy the request
  | "verified"    // Payment / deposit / release confirmed
  | "mismatched"  // Something on-chain / server-side doesn't match the request
  | "not-found";  // No corresponding record

export interface VerifyResult {
  status: VerifyStatus;
  /** Explorer URL if applicable. */
  explorerUrl?: string;
  /** Human-readable reason, especially for mismatched / not-found. */
  detail?: string;
}

export interface SettlementBackend {
  id: SettlementBackendId;
  verify(req: VerifyRequest): Promise<VerifyResult>;
  /** Called on verified state → grant Pro / release funds / etc. Optional per backend. */
  activate?(customerId: string, req: VerifyRequest): Promise<void>;
}

const registry = new Map<SettlementBackendId, SettlementBackend>();

export function registerBackend(backend: SettlementBackend): void {
  registry.set(backend.id, backend);
}

export function getBackend(id: SettlementBackendId): SettlementBackend {
  const backend = registry.get(id);
  if (!backend) throw new Error(`Settlement backend '${id}' not registered`);
  return backend;
}

/**
 * Explorer URL helper — used by backends and the market dashboard.
 * Kept here so the URL format is DRY across the app.
 */
export function explorerUrl(kind: "tx" | "account", value: string | PublicKey): string {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";
  const suffix = network === "mainnet-beta" ? "" : `?cluster=${network}`;
  const v = typeof value === "string" ? value : value.toBase58();
  return `https://explorer.solana.com/${kind}/${v}${suffix}`;
}
