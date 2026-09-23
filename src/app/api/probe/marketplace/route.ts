import { NextResponse } from "next/server";
import { getLatestIndex } from "@/lib/marketplace-index";

export const runtime = "nodejs";

/**
 * GET /api/probe/marketplace — the latest OKX.AI marketplace health index.
 *
 * Public, unpaid. `index` is null (with `pending: true`) until the first
 * refresh run has completed — a caller should treat that as "not yet
 * measured", not as an error.
 */
export async function GET() {
  const index = await getLatestIndex();
  if (!index) {
    return NextResponse.json({ ok: true, index: null, pending: true });
  }
  return NextResponse.json(
    { ok: true, index },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
