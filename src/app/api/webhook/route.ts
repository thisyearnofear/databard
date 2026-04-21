import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { proAccounts, type ProAccount } from "@/lib/store";

/**
 * Stripe webhook handler.
 * Handles subscription lifecycle: created, updated, deleted.
 *
 * Set STRIPE_WEBHOOK_SECRET from: stripe listen --forward-to localhost:3000/api/webhook
 * Or from the Stripe dashboard → Webhooks → Signing secret
 */
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ ok: false, error: "STRIPE_WEBHOOK_SECRET not configured" }, { status: 503 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ ok: false, error: "STRIPE_SECRET_KEY not configured" }, { status: 503 });
  }

  const stripe = new Stripe(stripeKey);
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ ok: false, error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Webhook signature verification failed";
    console.error("[Webhook] Signature error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  console.log(`[Webhook] Event: ${event.type}`);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.customer && session.subscription) {
        const customerId = typeof session.customer === "string" ? session.customer : session.customer.id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const feedToken = Math.random().toString(36).substring(2, 18);

        const account: ProAccount = {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          plan: "team",
          activatedAt: new Date().toISOString(),
          schedules: [],
          feedToken,
        };

        proAccounts.set(customerId, account);
        console.log(`[Webhook] Pro account activated: ${customerId}`);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const account = proAccounts.get(customerId);
      if (account) {
        proAccounts.update(customerId, { schedules: [] });
        console.log(`[Webhook] Subscription cancelled: ${customerId}`);
      }
      break;
    }

    case "customer.subscription.updated": {
      // Handle plan changes if needed in future
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
