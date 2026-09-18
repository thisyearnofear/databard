/**
 * Palm USD (PUSD) — shared config, transaction building, and replay guard.
 *
 * One PUSD rail serves every paywall: Pro subscription (49/mo) and commissioned
 * editions (EDITION_PRICE_PUSD, one-off). The server always builds the unsigned
 * transfer — the client only signs — so amount and recipient can never be
 * manipulated from the browser.
 *
 * Treasury guard: when PALM_USD_RECIPIENT is unset the historical default was
 * the null address — payments would have been burned. `pusdTreasury()` returns
 * null instead of a key so callers can fail loudly (503) rather than take
 * money into a fire.
 */
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";
import { store } from "@/lib/store";

export const PUSD_DECIMALS = 6;
export const PRO_PRICE_PUSD = 49;

const NULL_ADDRESS = "11111111111111111111111111111111";

/** One-off price to publish a commissioned edition page. */
export function editionPricePusd(): number {
  const raw = process.env.EDITION_PRICE_PUSD;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 25;
}

export function pusdNetwork(): string {
  return process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";
}

export function pusdRpcUrl(): string {
  const network = pusdNetwork();
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? `https://api.${network}.solana.com`;
}

export function pusdMint(): PublicKey {
  return new PublicKey(
    process.env.NEXT_PUBLIC_PALM_USD_MINT ?? "CZzgUBvxaMLwMhVSLgqJn3npmxoTo6nzMNQPAnwtHF3s",
  );
}

/** Treasury wallet — `null` when unconfigured (never silently the burn address). */
export function pusdTreasury(): PublicKey | null {
  const raw = process.env.PALM_USD_RECIPIENT;
  if (!raw || raw === NULL_ADDRESS) return null;
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

/** Price in PUSD for a payment purpose. */
export function priceFor(purpose: "pro" | "edition"): number {
  return purpose === "edition" ? editionPricePusd() : PRO_PRICE_PUSD;
}

export interface BuiltPusdTx {
  unsignedTxBase64: string;
  amount: number;
  token: "PUSD";
  recipient: string;
  network: string;
}

/**
 * Build an unsigned SPL transfer of `amountPusd` from `walletAddress` to the
 * treasury. Throws with a client-safe message on insufficient balance or when
 * payments are not configured.
 */
export async function buildPusdTransfer(walletAddress: string, amountPusd: number): Promise<BuiltPusdTx> {
  const recipient = pusdTreasury();
  if (!recipient) {
    throw new Error("PUSD payments are not configured (PALM_USD_RECIPIENT unset)");
  }
  const mint = pusdMint();
  const connection = new Connection(pusdRpcUrl(), "confirmed");
  const payer = new PublicKey(walletAddress);

  const payerAta = await getAssociatedTokenAddress(mint, payer);
  const recipientAta = await getAssociatedTokenAddress(mint, recipient);

  try {
    const payerAccount = await getAccount(connection, payerAta);
    const balance = Number(payerAccount.amount) / 1e6;
    if (balance < amountPusd) {
      throw new Error(`Insufficient PUSD balance. Need ${amountPusd}, have ${balance.toFixed(2)}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Insufficient")) throw e;
    throw new Error("No Palm USD token account found. You need PUSD tokens to pay.");
  }

  const tx = new Transaction().add(
    createTransferInstruction(payerAta, recipientAta, payer, BigInt(Math.round(amountPusd * 1e6))),
  );
  tx.feePayer = payer;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  return {
    unsignedTxBase64: Buffer.from(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    ).toString("base64"),
    amount: amountPusd,
    token: "PUSD",
    recipient: recipient.toBase58(),
    network: pusdNetwork(),
  };
}

const SPENT_PREFIX = "pusd:spent:";
const SPENT_TTL_SECONDS = 86400 * 365;

/**
 * Replay guard — a verified tx signature can fund exactly one activation.
 * Claim AFTER on-chain verification succeeds; a second call for the same
 * signature returns `{ ok: false }` and the caller must refuse to grant.
 */
export function claimPusdSignature(
  txSignature: string,
  spentOn: { purpose: string; reference: string },
): { ok: true } | { ok: false; alreadySpentOn: { purpose: string; reference: string } } {
  const key = `${SPENT_PREFIX}${txSignature}`;
  const existing = store.get<{ purpose: string; reference: string }>(key);
  if (existing) return { ok: false, alreadySpentOn: existing };
  store.set(key, spentOn, SPENT_TTL_SECONDS);
  return { ok: true };
}

/**
 * Release a claimed signature. Only safe when the activation it guarded
 * provably did NOT happen (e.g. publishEdition threw after the claim) —
 * releasing after a successful grant would reopen the replay window.
 */
export function releasePusdSignature(txSignature: string): void {
  store.delete(`${SPENT_PREFIX}${txSignature}`);
}
