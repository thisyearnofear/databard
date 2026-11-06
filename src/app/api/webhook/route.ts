/**
 * Stripe webhook handler.
 * Subscription lifecycle events (created, updated, deleted).
 *
 * Activation / cancellation logic lives in settlement/backends/stripe.ts so it can be reused
 * (e.g., admin tools, tests). This route only handles signature verification + routing.
 *
 * Set STRIPE_WEBHOOK_SECRET from: `stripe listen --forward-to localhost:3000/api/webhook`
 * or from the Stripe dashboard → Webhooks → Signing secret.
 */
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { activateStripePro, cancelStripePro } from "@/lib/settlement/backends/stripe";
import { recordAuditOrder } from "@/lib/audit-orders";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!webhookSecret || !stripeKey) {
    return NextResponse.json({ ok: false, error: "Stripe not configured" }, { status: 503 });
  }

  const stripe = getStripe();
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ ok: false, error: "Missing stripe-signature" }, { status: 400 });

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
        activateStripePro({ customerId, subscriptionId });
        console.log(`[Webhook] Pro account activated: ${customerId}`);
      } else if (session.mode === "payment" && session.metadata?.plan?.startsWith("health_") && session.payment_status === "paid") {
        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
        await recordAuditOrder({
          sessionId: session.id,
          sku: session.metadata.sku ?? "unknown",
          plan: session.metadata.plan,
          email: session.customer_details?.email ?? null,
          amountTotal: session.amount_total,
          currency: session.currency,
          paymentIntentId,
          paidAt: new Date().toISOString(),
        });
        console.log(`[Webhook] Audit paid: ${session.metadata.plan} (${session.id})`);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      cancelStripePro(customerId);
      console.log(`[Webhook] Subscription cancelled: ${customerId}`);
      break;
    }
    case "customer.subscription.updated":
      break;
  }

  return NextResponse.json({ ok: true });
}
