/**
 * POST /api/checkout/palmusd/verify
 * Verifies a Palm USD payment and activates Pro access.
 *
 * Delegates verification + activation to settlement/backends/pusd.ts so this route stays thin
 * and the same logic serves both Pro checkout and (future) market-denominated PUSD payments.
 *
 * Body: { walletAddress, txSignature }
 */
import { NextRequest, NextResponse } from "next/server";
import { getBackend } from "@/lib/settlement";

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, txSignature } = await req.json();
    if (!walletAddress || !txSignature) {
      return NextResponse.json(
        { ok: false, error: "walletAddress and txSignature required" },
        { status: 400 },
      );
    }

    const backend = getBackend("pusd");
    const result = await backend.verify({ reference: txSignature });

    if (result.status !== "verified") {
      return NextResponse.json({ ok: false, error: result.detail ?? result.status }, { status: 400 });
    }

    await backend.activate?.(walletAddress, { reference: txSignature });

    return NextResponse.json({
      ok: true,
      message: "Pro access activated via Palm USD payment",
      txSignature,
      explorerUrl: result.explorerUrl,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
