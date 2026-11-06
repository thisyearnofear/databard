import { NextRequest, NextResponse } from "next/server";
import { getAuditOrder } from "@/lib/audit-orders";

/** Public order status — session id is the bearer secret, same as the Stripe receipt link. */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "session_id required" }, { status: 400 });
  }
  const order = await getAuditOrder(sessionId);
  if (!order) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    status: order.status,
    sku: order.sku,
    reportUrl: order.status === "delivered" && order.report ? `/audit/report/${order.sessionId}` : null,
  });
}
