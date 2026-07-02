/**
 * Stripe settlement backend — subscription-based, webhook-driven activation.
 *
 * Stripe doesn't fit the pull-verify pattern (there's no meaningful "verify a session" call —
 * the webhook is the source of truth). This module exposes the shared activation helper so the
 * webhook route stays thin, and implements a minimal SettlementBackend for consistency.
 */
import { proAccounts, type ProAccount } from "../../store";
import type { SettlementBackend, VerifyRequest, VerifyResult } from "../verifier";

export interface ActivateStripeInput {
  customerId: string;
  subscriptionId: string;
}

/** Idempotent — safe to call from webhook retries. */
export function activateStripePro(input: ActivateStripeInput): ProAccount {
  const { customerId, subscriptionId } = input;
  const existing = proAccounts.get(customerId);
  if (existing) {
    proAccounts.update(customerId, { plan: "team", stripeSubscriptionId: subscriptionId });
    return { ...existing, plan: "team", stripeSubscriptionId: subscriptionId };
  }
  const account: ProAccount = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    plan: "team",
    activatedAt: new Date().toISOString(),
    schedules: [],
    feedToken: Math.random().toString(36).substring(2, 18),
  };
  proAccounts.set(customerId, account);
  return account;
}

export function cancelStripePro(customerId: string): void {
  const existing = proAccounts.get(customerId);
  if (!existing) return;
  proAccounts.update(customerId, { schedules: [] });
}

/**
 * Stripe verify is a no-op (webhook is authoritative). Kept for interface symmetry so
 * registerBackend(stripeBackend) works and market code can query any backend uniformly.
 */
export const stripeBackend: SettlementBackend = {
  id: "stripe",
  async verify(_req: VerifyRequest): Promise<VerifyResult> {
    return { status: "verified", detail: "Stripe uses webhook-driven activation" };
  },
};
