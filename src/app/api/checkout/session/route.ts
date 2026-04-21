import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "session_id required" }, { status: 400 });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "Stripe not configured" }, { status: 503 });
  }

  try {
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

    if (!customerId) {
      return NextResponse.json({ ok: false, error: "No customer found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, customerId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
