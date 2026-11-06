import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

/**
 * Stripe Checkout for the one-off audit ladder (Shipyard SKU).
 * POST /api/checkout/audit { sku: "snapshot" | "plus" | "operator" }
 * → { ok, url } — price resolved server-side, never from the client.
 */
const SKUS = {
  snapshot: { env: "STRIPE_PRICE_HEALTH_SNAPSHOT", plan: "health_snapshot" },
  plus: { env: "STRIPE_PRICE_HEALTH_PLUS", plan: "health_plus" },
  operator: { env: "STRIPE_PRICE_HEALTH_OPERATOR", plan: "health_operator" },
} as const;

export type AuditSku = keyof typeof SKUS;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { sku?: string };
    const sku = SKUS[body.sku as AuditSku];
    if (!sku) {
      return NextResponse.json(
        { ok: false, error: `unknown sku — expected one of ${Object.keys(SKUS).join(", ")}` },
        { status: 400 },
      );
    }

    const priceId = process.env[sku.env];
    if (!priceId) {
      return NextResponse.json(
        { ok: false, error: `Audit SKU ${body.sku} not configured (${sku.env} unset)` },
        { status: 503 },
      );
    }

    const stripe = getStripe();
    const origin = req.nextUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/audit/${body.sku}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/roast?checkout=cancelled`,
      billing_address_collection: "auto",
      metadata: { plan: sku.plan, sku: body.sku! },
      payment_intent_data: { metadata: { plan: sku.plan, sku: body.sku! } },
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
