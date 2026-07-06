import { NextRequest, NextResponse } from "next/server";
import { recordEvent, getEventStats, EVENT_TYPES, type EventType } from "@/lib/events";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/events — record an anonymous usage event ({ type, meta? }).
 * GET  /api/events — aggregate stats (counts by type, listen completion rate).
 *
 * The behavioral substrate for product decisions: hypotheses get tested
 * against what users actually did, not what they said they'd do.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { allowed } = rateLimit(`events:${ip}`, { limit: 60, windowMs: 60_000 });
    if (!allowed) return NextResponse.json({ ok: false, error: "Rate limited" }, { status: 429 });

    const body = await req.json();
    const type = body?.type as EventType;
    if (!EVENT_TYPES.includes(type)) {
      return NextResponse.json({ ok: false, error: "Unknown event type" }, { status: 400 });
    }

    // Sanitize meta: string values only, capped count and length, no free-form blobs
    let meta: Record<string, string> | undefined;
    if (body.meta && typeof body.meta === "object") {
      meta = {};
      for (const [k, v] of Object.entries(body.meta).slice(0, 5)) {
        if (typeof v === "string") meta[k.slice(0, 40)] = v.slice(0, 120);
      }
    }

    await recordEvent(type, meta);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const stats = await getEventStats();
    return NextResponse.json({ ok: true, stats });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
