import { NextRequest, NextResponse } from "next/server";
import { fetchFleetDatasets } from "@/lib/datahub-adapter";
import { buildFleetReport } from "@/lib/fleet-analysis";
import { getSession } from "@/lib/session";
import { ValidationError, rateLimit } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * POST /api/fleet — the "town hall." Reads the FULL DataHub context graph and
 * returns a lineage-aware fleet report: health distribution, transitive
 * blast-radius risk, hotspots, and a deterministic two-host narration.
 *
 * Accepts a `datahub` connection in the body (one-shot, MCP-able), or falls
 * back to the current wizard session.
 */
export async function POST(req: NextRequest) {
  try {
    rateLimit(req, { maxRequests: 30, windowMs: 3600000 });

    let conn: { serverUrl: string; token?: string } | undefined;
    try {
      const body = await req.json();
      conn = body?.datahub;
    } catch {
      /* no body */
    }

    if (!conn?.serverUrl) {
      const session = await getSession();
      if (session?.config.source === "datahub" && session.config.datahub?.serverUrl) {
        conn = session.config.datahub;
      }
    }
    if (!conn?.serverUrl) {
      throw new ValidationError(
        "DataHub connection required — pass datahub.serverUrl in the body or connect in the wizard."
      );
    }

    const datasets = await fetchFleetDatasets(conn);
    const report = buildFleetReport(datasets);
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
