/**
 * Pageview denominator — the traffic half of the two-layer analytics split
 * (Plausible, when configured, is the rich external view; this is the
 * zero-dependency internal one we can query without an account).
 *
 * Kept in its OWN rolling file, separate from the funnel ledger in events.ts:
 * pageviews are high-volume, funnel events are low-volume and high-value, and
 * sharing one 10k window would let a single busy day evict the funnel history.
 *
 * No PII: path + coarse source code + timestamp. No IPs, no user agents, no ids.
 */
import { promises as fs } from "fs";
import path from "path";
import { getDataPath } from "./data-dir";
import { serial } from "./serial-queue";

const PAGEVIEWS_FILE = getDataPath("pageviews.json");
const MAX_PAGEVIEWS = 10_000; // rolling window — oldest dropped beyond this

export interface PageView {
  /** Route path only (no query string) — e.g. "/league", "/episode/demo" */
  path: string;
  /** First-touch source: utm_source, else referrer host, else "direct" */
  src?: string;
  createdAt: string;
}

async function readAll(): Promise<PageView[]> {
  try {
    await fs.mkdir(path.dirname(PAGEVIEWS_FILE), { recursive: true });
    try { await fs.access(PAGEVIEWS_FILE); } catch { await fs.writeFile(PAGEVIEWS_FILE, "[]", "utf-8"); }
    const raw = await fs.readFile(PAGEVIEWS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PageView[]) : [];
  } catch {
    return [];
  }
}

export async function recordPageView(meta?: Record<string, string>): Promise<void> {
  await serial("pageviews", async () => {
    const viewPath = (meta?.path ?? "/").slice(0, 120);
    const src = meta?.src?.slice(0, 60);
    const all = await readAll();
    all.push({ path: viewPath, ...(src ? { src } : {}), createdAt: new Date().toISOString() });
    const trimmed = all.length > MAX_PAGEVIEWS ? all.slice(-MAX_PAGEVIEWS) : all;
    await fs.writeFile(PAGEVIEWS_FILE, JSON.stringify(trimmed), "utf-8");
  });
}

export interface PageviewStats {
  total: number;
  /** Pageviews in the trailing 7 days — the weekly denominator for conversion rates */
  last7d: number;
  byPath: Record<string, number>;
  bySource: Record<string, number>;
}

export async function getPageviewStats(): Promise<PageviewStats> {
  const all = await serial("pageviews", readAll);
  const byPath: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let last7d = 0;
  for (const v of all) {
    byPath[v.path] = (byPath[v.path] ?? 0) + 1;
    const src = v.src || "direct";
    bySource[src] = (bySource[src] ?? 0) + 1;
    if (Date.parse(v.createdAt) >= cutoff) last7d++;
  }
  return { total: all.length, last7d, byPath, bySource };
}
