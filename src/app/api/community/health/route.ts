import { NextRequest, NextResponse } from "next/server";
import { parseCsv, analyzeCommunityData } from "@/lib/community-health";
import { rateLimit, STRICT_RATE_LIMIT } from "@/lib/rate-limit";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";

const MAX_CHARS = 512_000;   // ~a few thousand rows — this is a health check, not an ETL
const MAX_ROWS = 5_000;

/**
 * POST /api/community/health — { csv: "name,email,...\n..." }
 * Deterministic member-list health report. No LLM, no keys, nothing stored —
 * the CSV never leaves the request.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(ip, STRICT_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many checks — try again in a minute." }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as { csv?: string } | null;
  const csv = body?.csv;
  if (typeof csv !== "string" || csv.trim().length === 0) {
    return NextResponse.json({ error: "Send { csv: \"...\" } with your member list as CSV text." }, { status: 400 });
  }
  if (csv.length > MAX_CHARS) {
    return NextResponse.json({ error: `That's a big list — the free check handles up to ~${MAX_CHARS.toLocaleString("en-US")} characters. Trim it or export a subset.` }, { status: 413 });
  }

  const { header, rows } = parseCsv(csv);
  if (header.length === 0 || rows.length === 0) {
    return NextResponse.json({ error: "Couldn't find a header row plus at least one data row in that CSV." }, { status: 400 });
  }
  const capped = rows.slice(0, MAX_ROWS);

  const report = analyzeCommunityData(header, capped);
  void recordEvent("community_health_run", {
    rows: String(capped.length),
    cols: String(header.length),
    score: String(report.score),
    label: report.label,
  });
  return NextResponse.json({ ...report, rowCount: capped.length });
}
