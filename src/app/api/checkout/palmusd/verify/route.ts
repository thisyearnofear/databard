/**
 * POST /api/checkout/palmusd/verify
 * Verifies a Palm USD payment and activates Pro access.
 *
 * Body: { walletAddress, txSignature }
 * Returns: { ok, message } or { ok: false, error }
 */
import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { proAccounts } from "@/lib/store";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? `https://api.${NETWORK}.solana.com`;
const RECIPIENT_WALLET = process.env.PALM_USD_RECIPIENT ?? "DATABARDtreasury11111111111111111111111111111";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, txSignature } = body;

    if (!walletAddress || !txSignature) {
      return NextResponse.json({ ok: false, error: "walletAddress and txSignature required" }, { status: 400 });
    }

    // Verify the transaction on-chain
    const connection = new Connection(RPC_URL, "confirmed");
    const tx = await connection.getTransaction(txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || tx.meta?.err) {
      return NextResponse.json(
        { ok: false, error: "Transaction not found or failed on-chain" },
        { status: 400 },
      );
    }

    // Verify the transaction involved our recipient wallet
    const recipientKey = new PublicKey(RECIPIENT_WALLET);
    const accountKeys = tx.transaction.message.getAccountKeys().keySegments().flat();
    const involved = accountKeys.some((key) => key.equals(recipientKey));

    if (!involved) {
      return NextResponse.json(
        { ok: false, error: "Transaction does not involve the DataBard treasury" },
        { status: 400 },
      );
    }

    // Activate Pro for this wallet
    const customerId = walletAddress;
    const existing = proAccounts.get(customerId);

    if (existing) {
      // Extend existing subscription
      proAccounts.update(customerId, {
        plan: "team",
        stripeSubscriptionId: `palmusd_${txSignature.slice(0, 16)}`,
      });
    } else {
      // Create new Pro account
      proAccounts.set(customerId, {
        stripeCustomerId: "",
        stripeSubscriptionId: `palmusd_${txSignature.slice(0, 16)}`,
        plan: "team",
        activatedAt: new Date().toISOString(),
        schedules: [],
        feedToken: Math.random().toString(36).substring(2, 15),
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Pro access activated via Palm USD payment",
      txSignature,
      explorerUrl:
        NETWORK === "mainnet-beta"
          ? `https://explorer.solana.com/tx/${txSignature}`
          : `https://explorer.solana.com/tx/${txSignature}?cluster=${NETWORK}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
