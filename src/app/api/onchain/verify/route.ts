/**
 * GET /api/onchain/verify?tx=<signature>
 *
 * Trustless-ish verification of a DataBard attestation:
 * 1. Fetch the transaction from Solana RPC.
 * 2. Decode the SPL Memo payload (the attestation JSON).
 * 3. If the shared episode is still available locally, recompute
 *    SHA-256(JSON.stringify(episode.script)) and compare to the on-chain hash.
 *
 * Response shape:
 * {
 *   ok: true,
 *   network, explorerUrl,
 *   memo: { schemaName, healthScore, episodeId, reportHash, author, timestamp },
 *   blockTime: number | null,
 *   episodeAvailable: boolean,
 *   recomputedHash: string | null,
 *   match: boolean | null,   // null when the episode is unavailable
 *   mintRecord: MintRecord | null
 * }
 * Non-attestation memos return { ok: true, verifiable: false, rawMemo, note }.
 * Errors return { ok: false, error } with 400/404/502.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { Connection, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { shares } from "@/lib/store";
import { getMintByTx, episodeHasMint, type MintRecord } from "@/lib/mint-stats";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? `https://api.${NETWORK}.solana.com`;
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/** Attestation payload written by /api/onchain/mint-solana */
interface AttestationMemo {
  schema_name?: string;
  health_score?: number;
  episode_id?: string;
  report_hash?: string;
  author?: string;
  sol_domain?: string;
  grove_cid?: string;
  timestamp?: string;
  network?: string;
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Minimal base58 decode (no new dependency). Used only for the
 * `partiallyDecoded` fallback — parsed transactions normally hand us the memo
 * string directly via `.parsed`.
 */
function base58Decode(input: string): Buffer | null {
  try {
    const bytes: number[] = [0];
    for (const char of input) {
      const value = BASE58_ALPHABET.indexOf(char);
      if (value === -1) return null;
      let carry = value;
      for (let i = 0; i < bytes.length; i++) {
        carry += bytes[i] * 58;
        bytes[i] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    // Leading '1's encode leading zero bytes
    for (const char of input) {
      if (char !== "1") break;
      bytes.push(0);
    }
    return Buffer.from(bytes.reverse());
  } catch {
    return null;
  }
}

/** Pull the memo string out of a parsed transaction, if any. */
function extractMemo(tx: ParsedTransactionWithMeta): string | null {
  const instructions = tx.transaction.message.instructions ?? [];
  for (const ix of instructions) {
    // Fully parsed path — spl-memo instructions carry the memo text in `.parsed`
    if ("parsed" in ix && ix.program === "spl-memo") {
      if (typeof ix.parsed === "string") return ix.parsed;
      // Defensive: some RPCs nest it
      if (ix.parsed && typeof ix.parsed === "object") {
        const maybe = (ix.parsed as Record<string, unknown>).memo;
        if (typeof maybe === "string") return maybe;
      }
    }
    // partiallyDecoded path — match the memo program id and base58-decode data
    if (!("parsed" in ix) && ix.programId?.toBase58() === MEMO_PROGRAM_ID) {
      const decoded = base58Decode(ix.data);
      if (decoded) return decoded.toString("utf-8");
    }
  }
  return null;
}

function explorerUrlFor(signature: string): string {
  return NETWORK === "mainnet-beta"
    ? `https://explorer.solana.com/tx/${signature}`
    : `https://explorer.solana.com/tx/${signature}?cluster=${NETWORK}`;
}

export async function GET(req: NextRequest) {
  const signature = req.nextUrl.searchParams.get("tx")?.trim();
  if (!signature) {
    return NextResponse.json(
      { ok: false, error: "Missing tx parameter — pass a Solana transaction signature." },
      { status: 400 },
    );
  }

  // Cheap sanity check so obviously malformed input doesn't hit RPC
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) {
    return NextResponse.json(
      { ok: false, error: "That doesn't look like a Solana transaction signature (base58, ~88 chars)." },
      { status: 400 },
    );
  }

  let tx: ParsedTransactionWithMeta | null;
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "RPC request failed";
    return NextResponse.json({ ok: false, error: `Solana RPC error: ${msg}` }, { status: 502 });
  }

  if (!tx) {
    return NextResponse.json(
      { ok: false, error: `Transaction not found on ${NETWORK}. Check the signature and network.` },
      { status: 404 },
    );
  }

  const memoString = extractMemo(tx);
  if (!memoString) {
    return NextResponse.json(
      { ok: false, error: "Transaction found, but it contains no SPL Memo instruction — not a DataBard attestation." },
      { status: 404 },
    );
  }

  // Parse the memo as an attestation payload
  let memo: AttestationMemo | null = null;
  try {
    const parsed = JSON.parse(memoString);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      memo = parsed as AttestationMemo;
    }
  } catch {
    memo = null;
  }

  if (!memo || typeof memo.report_hash !== "string" || !memo.report_hash) {
    // DataBard writes a second memo kind: marketplace settlement receipts
    // (escrow deals commit a manifest hash on settle). Present those as what
    // they are instead of "not an attestation".
    const kind = (memo as { kind?: string } | null)?.kind;
    if (kind === "databard-market-settlement") {
      const m = memo as unknown as {
        wantId?: string; personaId?: string; buyer?: string;
        priceLamports?: number; manifestHash?: string; settledAt?: string;
      };
      return NextResponse.json({
        ok: true,
        verifiable: false,
        network: NETWORK,
        explorerUrl: explorerUrlFor(signature),
        blockTime: tx.blockTime ?? null,
        rawMemo: memoString,
        settlement: {
          wantId: m.wantId ?? "",
          personaId: m.personaId ?? "",
          buyer: m.buyer ?? "",
          priceLamports: typeof m.priceLamports === "number" ? m.priceLamports : null,
          manifestHash: m.manifestHash ?? "",
          settledAt: m.settledAt ?? null,
        },
        note: "This is a DataBard marketplace settlement receipt — the deliverable's manifest hash committed on-chain at settlement.",
      });
    }
    return NextResponse.json({
      ok: true,
      verifiable: false,
      network: NETWORK,
      explorerUrl: explorerUrlFor(signature),
      blockTime: tx.blockTime ?? null,
      rawMemo: memoString,
      note: "This memo is not a DataBard attestation — it has no report_hash to verify.",
    });
  }

  // Recompute the report hash from the shared episode, when still available
  const episodeId = typeof memo.episode_id === "string" ? memo.episode_id : "";
  let episodeAvailable = false;
  let recomputedHash: string | null = null;
  let match: boolean | null = null;

  if (episodeId) {
    try {
      const stored = shares.getMeta<{ script?: unknown }>(episodeId);
      if (stored?.data && stored.data.script !== undefined) {
        episodeAvailable = true;
        // Must mirror the client exactly: SHA-256(JSON.stringify(episode.script)), lowercase hex
        recomputedHash = createHash("sha256")
          .update(JSON.stringify(stored.data.script), "utf8")
          .digest("hex");
        match = recomputedHash === memo.report_hash.toLowerCase();
      }
    } catch {
      // Store failure is not a verification failure — report the episode as unavailable
      episodeAvailable = false;
    }
  }

  // Local mint ledger — extra metadata only, never required for verification
  let mintRecord: MintRecord | null = null;
  try {
    mintRecord = await getMintByTx(signature);
    if (!mintRecord && episodeId) mintRecord = await episodeHasMint(episodeId);
  } catch {
    mintRecord = null;
  }

  return NextResponse.json({
    ok: true,
    network: NETWORK,
    explorerUrl: explorerUrlFor(signature),
    memo: {
      schemaName: memo.schema_name ?? "",
      healthScore: typeof memo.health_score === "number" ? memo.health_score : null,
      episodeId,
      reportHash: memo.report_hash,
      author: memo.author ?? "",
      timestamp: memo.timestamp ?? null,
    },
    blockTime: tx.blockTime ?? null,
    episodeAvailable,
    recomputedHash,
    match,
    mintRecord,
  });
}
