/**
 * GET /api/onchain/mints/stats
 *
 * Returns aggregate mint statistics:
 *   { ok: true, total, recent: MintRecord[], bySchema: { [name]: count } }
 *
 * Optional query: ?schema=<name>  → returns only `{ ok, schema, count }`.
 * Optional query: ?limit=<n>      → cap recent feed (default 10, max 50).
 *
 * This endpoint is intentionally cheap and unauthenticated so it can drive a
 * social-proof counter on the public landing page.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMintStats, getMintCountForSchema } from "@/lib/mint-stats";
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const schema = searchParams.get("schema");
    const limitRaw = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10;

    const stats = await getMintStats(limit, schema || undefined);

    if (schema && searchParams.get("countOnly") === "true") {
      return NextResponse.json(
        { ok: true, schema, count: stats.total },
        { headers: { "Cache-Control": "public, max-age=30" } },
      );
    }

    return NextResponse.json(
      { ok: true, ...stats },
      { headers: { "Cache-Control": "public, max-age=30" } },
    );
  } catch (e: unknown) {
...
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
