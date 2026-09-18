/**
 * POST /api/checkout/palmusd
 * Creates a payment transaction — Pro subscription or commissioned edition —
 * in the caller's chosen method: PUSD, USDC, or native SOL.
 * Returns an unsigned transaction for the client to sign with their Solana wallet.
 *
 * Body: { walletAddress, purpose?: "pro" | "edition", editionId?, method?: "pusd" | "usdc" | "sol" }
 * Returns: { ok, unsignedTxBase64, amount, token, recipient, method, quoteId?, lamports?, solUsd? }
 *
 * The server always sets the amount — the client signs only. For SOL the price
 * is locked server-side as a quote (10 min TTL); verify resolves the expected
 * lamports from `quoteId`, never from the client. After signing and submitting,
 * the client calls /api/checkout/palmusd/verify to activate the purchase.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  buildSolTransfer,
  buildSplTransfer,
  priceFor,
  pusdMint,
  pusdTreasury,
  usdcMint,
  type PaymentMethod,
} from "@/lib/pusd";
import { getIntent } from "@/lib/editions";

const METHODS: PaymentMethod[] = ["pusd", "usdc", "sol"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, purpose = "pro", editionId, method = "pusd" } = body;

    if (!walletAddress) {
      return NextResponse.json({ ok: false, error: "walletAddress required" }, { status: 400 });
    }
    if (purpose !== "pro" && purpose !== "edition") {
      return NextResponse.json({ ok: false, error: "purpose must be 'pro' or 'edition'" }, { status: 400 });
    }
    if (!METHODS.includes(method)) {
      return NextResponse.json(
        { ok: false, error: "method must be 'pusd', 'usdc' or 'sol'" },
        { status: 400 },
      );
    }
    if (!pusdTreasury()) {
      return NextResponse.json(
        { ok: false, error: "Payments are not configured yet" },
        { status: 503 },
      );
    }

    // An edition payment must name a live intent — the amount is server-side,
    // and the intent is what the verify step publishes.
    const intent = purpose === "edition" ? (editionId ? getIntent(editionId) : null) : null;
    if (purpose === "edition" && !intent) {
      return NextResponse.json({ ok: false, error: "Unknown or expired edition intent" }, { status: 400 });
    }
    const usdAmount = intent ? intent.pricePusd : priceFor("pro");

    if (method === "sol") {
      const built = await buildSolTransfer(walletAddress, usdAmount, {
        purpose,
        intentId: intent?.id ?? null,
      });
      return NextResponse.json({ ok: true, method, ...built });
    }

    const mint = method === "usdc" ? usdcMint() : pusdMint();
    const built = await buildSplTransfer(walletAddress, mint, method.toUpperCase(), usdAmount);
    return NextResponse.json({ ok: true, method, ...built });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const clientSafe =
      msg.includes("Insufficient") || msg.includes("token account") || msg.includes("not configured")
        || msg.includes("SOL price feed");
    return NextResponse.json({ ok: false, error: clientSafe ? msg : "Failed to prepare payment" }, { status: 500 });
  }
}
