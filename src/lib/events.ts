/**
 * Behavioral event ledger — append-only JSON, same pattern as mint-stats.
 * Records what users actually do (listen, drill down, share, mint) so product
 * hypotheses can be tested against past behavior instead of opinion.
 * No PII: no emails, no wallets, no IPs — just anonymous usage signals.
 */
import { promises as fs } from "fs";
import path from "path";
import { getDataPath } from "./data-dir";

const EVENTS_FILE = getDataPath("events.json");
const MAX_EVENTS = 10_000; // rolling window — oldest dropped beyond this

/** Whitelisted event types — reject anything else at the API boundary */
export const EVENT_TYPES = [
  "demo_start",
  "connect_start",
  "listen_start",
  "listen_complete",
  "drilldown_open",
  "insights_view",
  "share",
  "mint_click",
  "feedback_yes",
  "feedback_no",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface UsageEvent {
  type: EventType;
  /** Coarse context — schema/source name, persona, tab, etc. */
  meta?: Record<string, string>;
  createdAt: string;
}

async function readAll(): Promise<UsageEvent[]> {
  try {
    await fs.mkdir(path.dirname(EVENTS_FILE), { recursive: true });
    try { await fs.access(EVENTS_FILE); } catch { await fs.writeFile(EVENTS_FILE, "[]", "utf-8"); }
    const raw = await fs.readFile(EVENTS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UsageEvent[]) : [];
  } catch {
    return [];
  }
}

export async function recordEvent(type: EventType, meta?: Record<string, string>): Promise<void> {
  const all = await readAll();
  all.push({ type, ...(meta ? { meta } : {}), createdAt: new Date().toISOString() });
  const trimmed = all.length > MAX_EVENTS ? all.slice(-MAX_EVENTS) : all;
  await fs.writeFile(EVENTS_FILE, JSON.stringify(trimmed), "utf-8");
}

export interface EventStats {
  total: number;
  byType: Record<string, number>;
  /** listen_complete / listen_start — the falsifiable "do people finish episodes" number */
  completionRate: number | null;
}

export async function getEventStats(): Promise<EventStats> {
  const all = await readAll();
  const byType: Record<string, number> = {};
  for (const e of all) byType[e.type] = (byType[e.type] ?? 0) + 1;
  const starts = byType["listen_start"] ?? 0;
  const completes = byType["listen_complete"] ?? 0;
  return {
    total: all.length,
    byType,
    completionRate: starts > 0 ? Math.round((completes / starts) * 100) : null,
  };
}
