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
  /** Solana transaction signature — also used as episode access token */
  txSignature: string;
  /** "mainnet-beta" | "devnet" | "testnet" */
  network: string;
  /** ISO timestamp when the broadcast confirmed */
  createdAt: string;
  /** Optional team identifier for shared accountability grouping */
  teamId?: string;
  /** Health alert threshold (0–100); fire webhook when score drops below this */
  alertThreshold?: number;
  /** Webhook or Slack URL to notify when alert fires */
  alertWebhook?: string;
}

export interface AlertSubscription {
  walletAddress: string;
  schemaName: string;
  threshold: number;
  webhook: string;
  createdAt: string;
}

const ALERTS_FILE = path.join(process.cwd(), "data", "alerts.json");

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

/** Get all mints for a schema across all wallets (team history) */
export async function getTeamHistory(schemaName: string, teamId?: string): Promise<MintRecord[]> {
  const all = await readAll();
  return all
    .filter((m) => m.schemaName === schemaName && (!teamId || m.teamId === teamId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Check if a wallet holds a mint for a given episodeId (gated access) */
export async function walletHoldsMint(walletAddress: string, episodeId: string): Promise<MintRecord | null> {
  const all = await readAll();
  return all.find((m) => m.walletAddress === walletAddress && m.episodeId === episodeId) ?? null;
}

/** Get mint by txSignature (used as access token) */
export async function getMintByTx(txSignature: string): Promise<MintRecord | null> {
  const all = await readAll();
  return all.find((m) => m.txSignature === txSignature) ?? null;
}

export interface LeaderboardEntry {
  schemaName: string;
  latestHealthScore: number;
  mintCount: number;
  trend: "up" | "down" | "stable";
  lastMintedAt: string;
  wallets: string[];
}

/** Aggregate mints into a leaderboard sorted by latest health score */
export async function getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  const all = await readAll();
  const bySchema: Record<string, MintRecord[]> = {};
  for (const m of all) {
    if (!bySchema[m.schemaName]) bySchema[m.schemaName] = [];
    bySchema[m.schemaName].push(m);
  }
  const entries: LeaderboardEntry[] = Object.entries(bySchema).map(([schemaName, mints]) => {
    const sorted = [...mints].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = sorted[0].healthScore;
    const prev = sorted[1]?.healthScore ?? latest;
    const trend: "up" | "down" | "stable" = latest > prev ? "up" : latest < prev ? "down" : "stable";
    const wallets = [...new Set(mints.map((m) => m.walletAddress))];
    return { schemaName, latestHealthScore: latest, mintCount: mints.length, trend, lastMintedAt: sorted[0].createdAt, wallets };
  });
  return entries.sort((a, b) => b.latestHealthScore - a.latestHealthScore).slice(0, limit);
}

// ── Alert subscriptions ──────────────────────────────────────────────────────

async function readAlerts(): Promise<AlertSubscription[]> {
  try {
    await fs.mkdir(path.dirname(ALERTS_FILE), { recursive: true });
    try { await fs.access(ALERTS_FILE); } catch { await fs.writeFile(ALERTS_FILE, "[]", "utf-8"); }
    const raw = await fs.readFile(ALERTS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AlertSubscription[]) : [];
  } catch { return []; }
}

export async function registerAlert(sub: AlertSubscription): Promise<void> {
  const all = await readAlerts();
  // Upsert by wallet+schema
  const idx = all.findIndex((a) => a.walletAddress === sub.walletAddress && a.schemaName === sub.schemaName);
  if (idx >= 0) all[idx] = sub; else all.push(sub);
  await fs.writeFile(ALERTS_FILE, JSON.stringify(all, null, 2), "utf-8");
}

export async function getAlerts(): Promise<AlertSubscription[]> {
  return readAlerts();
}

/**
 * Check all alert subscriptions against the latest mint for each schema.
 * Fires registered webhooks when health drops below threshold.
 * Returns list of fired alert schema names.
 */
export async function checkAndFireAlerts(): Promise<string[]> {
  const [alerts, all] = await Promise.all([readAlerts(), readAll()]);
  const fired: string[] = [];
  for (const sub of alerts) {
    const mints = all
      .filter((m) => m.schemaName === sub.schemaName)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!mints.length) continue;
    const latest = mints[0].healthScore;
    if (latest < sub.threshold) {
      fired.push(sub.schemaName);
      try {
        await fetch(sub.webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `🚨 DataBard Alert: *${sub.schemaName}* health dropped to *${latest}%* (threshold: ${sub.threshold}%)`,
            schemaName: sub.schemaName,
            healthScore: latest,
            threshold: sub.threshold,
            episodeId: mints[0].episodeId,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (e) {
        console.warn(`[alerts] webhook failed for ${sub.schemaName}:`, e);
      }
    }
  }
  return fired;
}
