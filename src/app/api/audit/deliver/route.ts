import { NextRequest, NextResponse } from "next/server";
import { listAuditOrders, markAuditDelivered } from "@/lib/audit-orders";
import { generateAuditReport } from "@/lib/audit-report";

/**
 * Operator delivery endpoint (Shipyard MVP).
 * POST /api/audit/deliver  — headers: x-admin-secret (or ?key=)
 * Body: { sessionId, category?, internal? } → generates the report for one
 * paid order and marks it delivered. GET (same auth) lists the queue.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return req.headers.get("x-admin-secret") === secret || req.nextUrl.searchParams.get("key") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const orders = await listAuditOrders();
  return NextResponse.json({ ok: true, orders });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    category?: string;
    internal?: { score?: number; findings?: string[] };
  };
  if (!body.sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 });
  }

  const order = (await listAuditOrders("paid")).find((o) => o.sessionId === body.sessionId);
  if (!order) {
    return NextResponse.json({ ok: false, error: "no paid order with that sessionId" }, { status: 404 });
  }

  const report = await generateAuditReport({
    order,
    category: body.category ?? null,
    internal: body.internal ?? null,
  });

  await markAuditDelivered(order.sessionId);
  return NextResponse.json({ ok: true, report });
}
