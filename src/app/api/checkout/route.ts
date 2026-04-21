import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key);
}

/**
 * Stripe checkout for DataBard Pro.
 * POST /api/checkout — creates a checkout session, returns URL
 */
export async function POST(req: NextRequest) {
  try {
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return NextResponse.json({ ok: false, error: "Stripe not configured" }, { status: 503 });
    }

    const stripe = getStripe();
    const origin = req.nextUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/pro?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}?checkout=cancelled`,
      // Collect email so we can identify the customer in webhooks
      billing_address_collection: "auto",
      metadata: { plan: "team" },
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
