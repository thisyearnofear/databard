import { PublicKey, Transaction, type Connection } from "@solana/web3.js";
import { verifyEvidenceReceipt, type EvidenceReceipt } from "../evidence-receipt";
import { createSolanaAttestationAdapter, solanaReceiptMemo, verifySolanaReceipt, type SolanaReceiptRpc } from "./solana";

export type AttestationRpc = SolanaReceiptRpc & Pick<Connection, "getLatestBlockhash" | "sendRawTransaction">;
export class AttestationHttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = (message: string): never => { throw new AttestationHttpError(400, message); };
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const CLUSTERS: Record<string, string> = {
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d": "mainnet-beta",
  EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG: "devnet",
  "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY": "testnet",
};
export function explorerUrlFor(chain: string, transactionId: string): string | null {
  const cluster = CLUSTERS[chain.replace(/^solana:/, "")];
  if (!cluster) return null;
  return `https://explorer.solana.com/tx/${encodeURIComponent(transactionId)}?cluster=${cluster}`;
}
function issuerFrom(body: Record<string, unknown>): string {
  if (typeof body.issuer !== "string") return fail("issuer wallet is required");
  try { return new PublicKey(body.issuer).toBase58(); }
  catch { return fail("issuer must be a Solana public key"); }
}
function chainFrom(body: Record<string, unknown>): string {
  if (typeof body.chain !== "string" || !/^solana:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.chain)) {
    return fail("chain must be solana:<full genesis hash>");
  }
  return body.chain;
}
function finalityFrom(body: Record<string, unknown>): "confirmed" | "finalized" {
  if (body.finality === undefined) return "confirmed";
  if (body.finality !== "confirmed" && body.finality !== "finalized") return fail("Invalid finality");
  return body.finality;
}
function receiptFrom(body: Record<string, unknown>): EvidenceReceipt {
  if (!verifyEvidenceReceipt(body.receipt)) return fail("Invalid evidence receipt");
  return body.receipt;
}
function requireConsent(body: Record<string, unknown>) {
  if (body.consent !== true) fail("consent:true is required: the hash becomes public; hashes are not encryption");
}
const TRUST_NOTE = "Integrity is not truth. issuerAuthenticated means the expected wallet signed the matching Memo, not DataBard authorship. Inclusion trusts the configured RPC. A missing transaction is not proof of pending status.";

export async function handlePrepare(body: Record<string, unknown>, rpc: AttestationRpc) {
  requireConsent(body);
  const receipt = receiptFrom(body);
  const issuer = issuerFrom(body);
  const chain = chainFrom(body);
  const finality = finalityFrom(body);
  if (`solana:${await rpc.getGenesisHash()}` !== chain) throw new AttestationHttpError(409, "Configured RPC network does not match chain");
  const prepared = await createSolanaAttestationAdapter(rpc, finality).prepare(receipt, issuer);
  if (prepared.chain !== chain) throw new AttestationHttpError(409, "RPC network changed during preparation");
  return { ok: true, prepared, note: "Unsigned hash-only Memo. Review, sign and pay the network fee with your wallet. No server signing or broadcast.", trustNote: TRUST_NOTE };
}

export async function handleVerify(body: Record<string, unknown>, rpc: AttestationRpc) {
  if (!Object.hasOwn(body, "receipt")) return fail("receipt is required");
  const issuer = issuerFrom(body);
  const chain = chainFrom(body);
  const finality = finalityFrom(body);
  if (typeof body.transactionId !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(body.transactionId)) return fail("Invalid transactionId");
  const reference = { issuer, chain, transactionId: body.transactionId };
  const verification = await verifySolanaReceipt(body.receipt, reference, rpc, finality);
  const resultIntegrity = Object.hasOwn(body, "result")
    ? (verifyEvidenceReceipt(body.receipt, { result: body.result }) ? "valid" : "invalid") : "not-checked";
  return { ok: true, reference, verification, resultIntegrity,
    explorerUrl: explorerUrlFor(chain, reference.transactionId), trustNote: TRUST_NOTE };
}

/** Broadcast only a caller-signed, single Memo; never sign caller data as DataBard. */
export async function handleAnchor(body: Record<string, unknown>, rpc: AttestationRpc) {
  requireConsent(body);
  const receipt = receiptFrom(body);
  const issuer = new PublicKey(issuerFrom(body));
  const chain = chainFrom(body);
  const encoded = body.signedTransactionBase64;
  if (typeof encoded !== "string" || encoded.length > 1644 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return fail("Invalid signedTransactionBase64");
  let tx: Transaction;
  let raw: Buffer;
  try {
    raw = Buffer.from(encoded, "base64");
    if (raw.length > 1232 || raw.toString("base64") !== encoded) return fail("Invalid transaction encoding");
    tx = Transaction.from(raw);
    if (!tx.verifySignatures() || !tx.serialize().equals(raw)) return fail("Invalid transaction signatures or encoding");
  } catch { return fail("Invalid signed transaction"); }
  const ix = tx.instructions[0];
  if (tx.instructions.length !== 1 || !ix.programId.equals(MEMO) ||
      !ix.data.equals(Buffer.from(solanaReceiptMemo(receipt))) ||
      ix.keys.length !== 1 || !ix.keys[0].pubkey.equals(issuer) || !ix.keys[0].isSigner ||
      !tx.feePayer?.equals(issuer) || tx.signatures.length !== 1 || !tx.signatures[0].publicKey.equals(issuer)) {
    return fail("Transaction must contain only the receipt Memo signed and paid by issuer");
  }
  if (`solana:${await rpc.getGenesisHash()}` !== chain) throw new AttestationHttpError(409, "Configured RPC network does not match chain");
  // Derive the reference before sending so a transport timeout never loses it.
  const bytes = tx.signatures[0].signature!;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = BigInt(`0x${bytes.toString("hex")}`);
  let transactionId = "";
  while (value > BigInt(0)) { transactionId = alphabet[Number(value % BigInt(58))] + transactionId; value /= BigInt(58); }
  for (const byte of bytes) { if (byte !== 0) break; transactionId = "1" + transactionId; }
  const reference = { chain, issuer: issuer.toBase58(), transactionId };
  let submission: "submitted" | "unknown" = "unknown";
  try {
    const returned = await rpc.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 0 });
    if (returned === transactionId) submission = "submitted";
  } catch { /* May have reached the node: return the locally derived signature. */ }
  return { ok: true, submission, reference, inclusion: "not-checked",
    explorerUrl: explorerUrlFor(chain, transactionId), trustNote: TRUST_NOTE,
    retryNote: "Verify this reference first. Retry identical signed bytes while the blockhash is valid; do not automatically prepare a new transaction. Submission is not confirmation." };
}

