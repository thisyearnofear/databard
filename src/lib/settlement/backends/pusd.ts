/**
 * Palm USD settlement backend — SPL token transfer to treasury, verified on-chain.
 *
 * Extracted from api/checkout/palmusd/verify/route.ts so the same verification code path
 * is reachable from Pro checkout AND the market (if a WANT is denominated in PUSD instead
 * of SOL). Today the market uses SOL escrow; PUSD remains the human-subscription path.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { proAccounts } from "../../store";
import { explorerUrl, type SettlementBackend, type VerifyRequest, type VerifyResult } from "../verifier";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? `https://api.${NETWORK}.solana.com`;

function treasury(): PublicKey {
  return new PublicKey(process.env.PALM_USD_RECIPIENT ?? "11111111111111111111111111111111");
}

export const pusdBackend: SettlementBackend = {
  id: "pusd",

  async verify(req: VerifyRequest): Promise<VerifyResult> {
    const connection = new Connection(RPC_URL, "confirmed");
    const tx = await connection.getTransaction(req.reference, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { status: "not-found", detail: "Transaction not found on-chain" };
    }
    if (tx.meta?.err) {
      return { status: "mismatched", detail: `On-chain error: ${JSON.stringify(tx.meta.err)}` };
    }

    const expected = req.expectedRecipient ? new PublicKey(req.expectedRecipient) : treasury();
    const accountKeys = tx.transaction.message.getAccountKeys().keySegments().flat();
    const involved = accountKeys.some((k) => k.equals(expected));
    if (!involved) {
      return { status: "mismatched", detail: "Transaction does not involve the expected recipient" };
    }

    return {
      status: "verified",
      explorerUrl: explorerUrl("tx", req.reference),
    };
  },

  async activate(customerId: string, req: VerifyRequest): Promise<void> {
    const existing = proAccounts.get(customerId);
    const subscriptionId = `palmusd_${req.reference.slice(0, 16)}`;
    if (existing) {
      proAccounts.update(customerId, { plan: "team", stripeSubscriptionId: subscriptionId });
      return;
    }
    proAccounts.set(customerId, {
      stripeCustomerId: "",
      stripeSubscriptionId: subscriptionId,
      plan: "team",
      activatedAt: new Date().toISOString(),
      schedules: [],
      feedToken: Math.random().toString(36).substring(2, 15),
    });
  },
};
