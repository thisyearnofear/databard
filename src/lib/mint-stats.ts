/**
 * Mint stats — append-only JSON ledger of on-chain mints.
 *
 * This is a deliberately lightweight store: a single JSON file in `data/` (same
 * pattern as `src/app/api/leads/route.ts`). The on-chain memo program remains
 * the source of truth; this cache exists to power UI counters and the recent
 * feed without round-tripping Solana RPC on every page load.
 *
 * If the file is lost or corrupted, callers should treat stats as zero rather
 * than failing — minting itself must never depend on this module.
 */
import { promises as fs } from "fs";
import path from "path";

const MINTS_FILE = path.join(process.cwd(), "data", "mints.json");

export interface MintRecord {
  /** Schema FQN or label that was minted (e.g. "uniswap.analytics") */
  schemaName: string;
  /** Health score at the time of minting (0–100) */
  healthScore: number;
  /** Internal episode share id */
  episodeId: string;
  /** SHA-256 hash of the script JSON */
  reportHash?: string;
  /** Solana wallet that signed the memo */
  walletAddress: string;
  /** Solana transaction signature */
  txSignature: string;
  /** "mainnet-beta" | "devnet" | "testnet" */
  network: string;
  /** ISO timestamp when the broadcast confirmed */
  createdAt: string;
}

export interface MintStats {
  total: number;
  /** Most recent mints, newest first, capped to `limit` (default 10) */
  recent: MintRecord[];
  /** Total mints per schemaName (for the "minted Nx" badge) */
  bySchema: Record<string, number>;
}

async function ensureFile(): Promise<void> {
  const dir = path.dirname(MINTS_FILE);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(MINTS_FILE);
  } catch {
    await fs.writeFile(MINTS_FILE, "[]", "utf-8");
  }
}

async function readAll(): Promise<MintRecord[]> {
  try {
    await ensureFile();
    const raw = await fs.readFile(MINTS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MintRecord[]) : [];
  } catch {
    return [];
  }
}

/**
 * Append a mint record. De-duplicates by `txSignature` so retries from the
 * client (or the existing route handler being called twice) don't double-count.
 */
export async function recordMint(record: MintRecord): Promise<void> {
  try {
    const all = await readAll();
    if (all.some((m) => m.txSignature === record.txSignature)) return;
    all.push(record);
    await fs.writeFile(MINTS_FILE, JSON.stringify(all, null, 2), "utf-8");
  } catch (e) {
    // Never fail the mint flow because of a stats write — just log.
    console.warn("[mint-stats] failed to record mint:", e);
  }
}

export async function getMintStats(limit = 10, schemaName?: string): Promise<MintStats> {
  let all = await readAll();
  if (schemaName) {
    all = all.filter((m) => m.schemaName === schemaName);
  }
  const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const bySchema: Record<string, number> = {};
  for (const m of all) {
    bySchema[m.schemaName] = (bySchema[m.schemaName] ?? 0) + 1;
  }
  return {
    total: all.length,
    recent: sorted.slice(0, limit),
    bySchema,
  };
}

export async function getMintCountForSchema(schemaName: string): Promise<number> {
  const all = await readAll();
  return all.filter((m) => m.schemaName === schemaName).length;
}
