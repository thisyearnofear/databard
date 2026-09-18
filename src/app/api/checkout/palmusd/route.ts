/**
 * POST /api/checkout/palmusd
 * Creates a Palm USD payment transaction — Pro subscription or commissioned edition.
 * Returns an unsigned transaction for the client to sign with their Solana wallet.
 *
 * Body: { walletAddress, purpose?: "pro" | "edition", editionId? }
 * Returns: { ok, unsignedTxBase64, amount, recipient } or { ok: false, error }
 *
 * Palm USD is a Solana stablecoin. Pro is 49 PUSD/mo; an edition is a one-off
 * EDITION_PRICE_PUSD. The server always sets the amount — the client signs only.
 * After the client signs and submits, they call /api/checkout/palmusd/verify
 * to confirm payment and activate whatever they paid for.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildPusdTransfer, priceFor, pusdTreasury } from "@/lib/pusd";
import { getIntent } from "@/lib/editions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, purpose = "pro", editionId } = body;

    if (!walletAddress) {
      return NextResponse.json({ ok: false, error: "walletAddress required" }, { status: 400 });
    }
    if (purpose !== "pro" && purpose !== "edition") {
      return NextResponse.json({ ok: false, error: "purpose must be 'pro' or 'edition'" }, { status: 400 });
    }
    if (!pusdTreasury()) {
      return NextResponse.json(
        { ok: false, error: "PUSD payments are not configured yet" },
        { status: 503 },
      );
    }

    // An edition payment must name a live intent — the amount is server-side,
    // and the intent is what the verify step publishes.
    if (purpose === "edition") {
      const intent = editionId ? getIntent(editionId) : null;
      if (!intent) {
        return NextResponse.json({ ok: false, error: "Unknown or expired edition intent" }, { status: 400 });
      }
      const built = await buildPusdTransfer(walletAddress, intent.pricePusd);
      return NextResponse.json({ ok: true, ...built });
    }

    const built = await buildPusdTransfer(walletAddress, priceFor("pro"));
    return NextResponse.json({ ok: true, ...built });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const clientSafe =
      msg.includes("Insufficient") || msg.includes("No Palm USD token account") || msg.includes("not configured");
    return NextResponse.json({ ok: false, error: clientSafe ? msg : "Failed to prepare payment" }, { status: 500 });
  }
}
