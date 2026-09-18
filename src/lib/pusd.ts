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
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";
import { store } from "@/lib/store";

export const PUSD_DECIMALS = 6;
export const PRO_PRICE_PUSD = 49;

/** Canonical mainnet USDC mint (verified via Jupiter token search). */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** Wrapped-SOL mint — used for price lookups, not SPL transfers. */
export const SOL_MINT = "So11111111111111111111111111111111111111112";

export type PaymentMethod = "pusd" | "usdc" | "sol";

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

export function usdcMint(): PublicKey {
  return new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT ?? USDC_MINT);
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
  token: string;
  recipient: string;
  network: string;
}

/**
 * Build an unsigned SPL transfer of `amount` tokens from `walletAddress` to the
 * treasury. Throws with a client-safe message on insufficient balance or when
 * payments are not configured. The recipient's ATA is created idempotently in
 * the same tx so a mint the treasury has never held can't strand the transfer.
 */
export async function buildSplTransfer(
  walletAddress: string,
  mint: PublicKey,
  symbol: string,
  amount: number,
): Promise<BuiltPusdTx> {
  const recipient = pusdTreasury();
  if (!recipient) {
    throw new Error("Payments are not configured (PALM_USD_RECIPIENT unset)");
  }
  const connection = new Connection(pusdRpcUrl(), "confirmed");
  const payer = new PublicKey(walletAddress);

  const payerAta = await getAssociatedTokenAddress(mint, payer);
  const recipientAta = await getAssociatedTokenAddress(mint, recipient);

  try {
    const payerAccount = await getAccount(connection, payerAta);
    const balance = Number(payerAccount.amount) / 1e6;
    if (balance < amount) {
      throw new Error(`Insufficient ${symbol} balance. Need ${amount}, have ${balance.toFixed(2)}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Insufficient")) throw e;
    throw new Error(`No ${symbol} token account found. You need ${symbol} to pay this way.`);
  }

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(payer, recipientAta, recipient, mint),
    createTransferInstruction(payerAta, recipientAta, payer, BigInt(Math.round(amount * 1e6))),
  );
  tx.feePayer = payer;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  return {
    unsignedTxBase64: Buffer.from(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    ).toString("base64"),
    amount,
    token: symbol,
    recipient: recipient.toBase58(),
    network: pusdNetwork(),
  };
}

export function buildPusdTransfer(walletAddress: string, amountPusd: number): Promise<BuiltPusdTx> {
  return buildSplTransfer(walletAddress, pusdMint(), "PUSD", amountPusd);
}

// ── SOL payments ────────────────────────────────────────────────────────────

const QUOTE_PREFIX = "pay:quote:";
/** A SOL quote is locked server-side at build time so the price can't drift
 *  between "prepare" and "verify". 10 minutes is enough to sign and confirm. */
const QUOTE_TTL_SECONDS = 600;
const QUOTE_RETENTION_SECONDS = 86400 * 7;

export interface SolQuote {
  id: string;
  walletAddress: string;
  purpose: "pro" | "edition";
  intentId: string | null;
  usdAmount: number;
  lamports: number;
  solUsd: number;
  createdAt: string;
  expiresAt?: string;
}

/** USD→lamports, rounded up so a verified payment never under-pays by dust. */
export function lamportsForUsd(usdAmount: number, solUsd: number): number {
  return Math.ceil((usdAmount / solUsd) * 1e9);
}

/** SOL/USD spot — Jupiter v3 primary, CoinGecko fallback. Throws if neither. */
export async function solUsdPrice(): Promise<number> {
  try {
    const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`, {
      signal: AbortSignal.timeout(8000),
    });
    const j = (await r.json()) as Record<string, { usdPrice?: number }>;
    const p = j?.[SOL_MINT]?.usdPrice;
    if (typeof p === "number" && p > 0) return p;
  } catch { /* fall through to coingecko */ }
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", {
    signal: AbortSignal.timeout(8000),
  });
  const j = (await r.json()) as { solana?: { usd?: number } };
  const p = j?.solana?.usd;
  if (typeof p === "number" && p > 0) return p;
  throw new Error("SOL price feed unavailable — try again in a moment");
}

export function getSolQuote(id: string): SolQuote | null {
  return store.get<SolQuote>(`${QUOTE_PREFIX}${id}`);
}

/** True when the stored quote belongs to this payer and purchase. */
export function quoteMatches(
  quote: SolQuote,
  expected: { walletAddress: string; purpose: string; intentId: string | null },
): boolean {
  return (
    quote.walletAddress === expected.walletAddress &&
    quote.purpose === expected.purpose &&
    quote.intentId === expected.intentId
  );
}

export interface BuiltSolTx extends BuiltPusdTx {
  lamports: number;
  solUsd: number;
  quoteId: string;
  expiresAt: string;
}

/**
 * Build an unsigned native-SOL transfer for `usdAmount` dollars, priced at the
 * moment of building. The quote is stored server-side; verify resolves the
 * expected lamports from the returned `quoteId`, never from the client.
 */
export async function buildSolTransfer(
  walletAddress: string,
  usdAmount: number,
  meta: { purpose: "pro" | "edition"; intentId: string | null },
): Promise<BuiltSolTx> {
  const recipient = pusdTreasury();
  if (!recipient) {
    throw new Error("Payments are not configured (PALM_USD_RECIPIENT unset)");
  }
  const solUsd = await solUsdPrice();
  const lamports = lamportsForUsd(usdAmount, solUsd);
  const connection = new Connection(pusdRpcUrl(), "confirmed");
  const payer = new PublicKey(walletAddress);

  const balance = await connection.getBalance(payer);
  // ~0.002 SOL covers fee + tx overhead; keep the error client-readable.
  if (balance < lamports + 2_000) {
    throw new Error(
      `Insufficient SOL. Need ~${(lamports / 1e9).toFixed(3)} SOL, have ${(balance / 1e9).toFixed(3)}`,
    );
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: payer, toPubkey: recipient, lamports }),
  );
  tx.feePayer = payer;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  const quote: SolQuote = {
    id: `q_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`,
    walletAddress,
    purpose: meta.purpose,
    intentId: meta.intentId,
    usdAmount,
    lamports,
    solUsd,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
  store.set(`${QUOTE_PREFIX}${quote.id}`, quote, QUOTE_RETENTION_SECONDS);

  return {
    unsignedTxBase64: Buffer.from(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    ).toString("base64"),
    amount: usdAmount,
    token: "SOL",
    recipient: recipient.toBase58(),
    network: pusdNetwork(),
    lamports,
    solUsd,
    quoteId: quote.id,
    expiresAt: quote.expiresAt!,
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
