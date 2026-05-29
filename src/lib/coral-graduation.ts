/**
 * Coral source graduation tracker — anonymous usage telemetry for the
 * "Bring Your Own Source" escape hatch.
 *
 * Extracts source names from Coral SQL queries (e.g., "github.issues" → "github")
 * and accumulates request counts in a JSON ledger. When a source crosses the
 * threshold, it's flagged for Tier 1 promotion consideration.
 *
 * This is anonymous — we store only the source name and timestamp, never the
 * full query or any user data. The ledger lives at data/coral-sources.json.
 */
import { promises as fs } from "fs";
import path from "path";

const SOURCES_FILE = path.join(process.cwd(), "data", "coral-sources.json");
const GRADUATION_THRESHOLD = 10; // requests before flagging for Tier 1 promotion

export interface CoralSourceRecord {
  source: string;
  firstSeenAt: string;
  lastSeenAt: string;
  requestCount: number;
  flagged: boolean; // true when count >= GRADUATION_THRESHOLD
}

/**
 * Extract source names from a Coral SQL query by looking for
 * patterns like "FROM <source>.<table>" or "JOIN <source>.<table>".
 */
export function extractSources(query: string): string[] {
  const sources = new Set<string>();
  // Match FROM/JOIN <word>.<word> — Coral's canonical source.table syntax
  const re = /(?:FROM|JOIN)\s+(\w+)\.\w+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    sources.add(m[1].toLowerCase());
  }
  return [...sources];
}

async function readSources(): Promise<Record<string, CoralSourceRecord>> {
  try {
    await fs.mkdir(path.dirname(SOURCES_FILE), { recursive: true });
    try { await fs.access(SOURCES_FILE); } catch { await fs.writeFile(SOURCES_FILE, "{}", "utf-8"); }
    const raw = await fs.readFile(SOURCES_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeSources(data: Record<string, CoralSourceRecord>): Promise<void> {
  await fs.mkdir(path.dirname(SOURCES_FILE), { recursive: true });
  await fs.writeFile(SOURCES_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Record usage for sources found in a Coral SQL query.
 * Increments counters and flags if threshold crossed.
 */
export async function trackCoralUsage(query: string): Promise<void> {
  const extracted = extractSources(query);
  if (!extracted.length) {
    // Fallback: tag as "coral:unknown" so we can detect the pattern later
    extracted.push("unknown");
  }

  try {
    const data = await readSources();
    const now = new Date().toISOString();
    for (const source of extracted) {
      const existing = data[source];
      if (existing) {
        existing.requestCount++;
        existing.lastSeenAt = now;
        if (existing.requestCount >= GRADUATION_THRESHOLD && !existing.flagged) {
          existing.flagged = true;
        }
      } else {
        data[source] = {
          source,
          firstSeenAt: now,
          lastSeenAt: now,
          requestCount: 1,
          flagged: false,
        };
      }
    }
    await writeSources(data);
  } catch (e) {
    console.warn("[coral-graduation] failed to track usage:", e);
  }
}

/**
 * Get all tracked sources, sorted by request count descending.
 */
export async function getTrackedSources(): Promise<CoralSourceRecord[]> {
  const data = await readSources();
  return Object.values(data).sort((a, b) => b.requestCount - a.requestCount);
}

/**
 * Get sources that have crossed the graduation threshold and should be
 * considered for Tier 1 adapter development.
 */
export async function getGraduationCandidates(): Promise<CoralSourceRecord[]> {
  const data = await readSources();
  return Object.values(data)
    .filter((s) => s.requestCount >= GRADUATION_THRESHOLD)
    .sort((a, b) => b.requestCount - a.requestCount);
}

export { GRADUATION_THRESHOLD };
