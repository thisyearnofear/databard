/**
 * POST /api/onchain/alerts — register a health alert subscription
 * GET  /api/onchain/alerts — list all subscriptions
 *
 * Body: { schemaName, threshold, webhook, email?, walletAddress? }
 * At least one of email or walletAddress is required.
 * Onchain attestation is optional — only used if walletAddress is provided.
 */
import { NextRequest, NextResponse } from "next/server";
import { registerAlert, getAlerts } from "@/lib/mint-stats";

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, email, schemaName, threshold, webhook } = await req.json();
    if (!schemaName || threshold == null || !webhook) {
      return NextResponse.json(
        { ok: false, error: "schemaName, threshold, and webhook are required" },
        { status: 400 },
      );
    }
    if (!walletAddress && !email) {
      return NextResponse.json(
        { ok: false, error: "Either email or walletAddress is required" },
        { status: 400 },
      );
    }
    if (typeof threshold !== "number" || threshold < 0 || threshold > 100) {
      return NextResponse.json({ ok: false, error: "threshold must be 0–100" }, { status: 400 });
    }
    await registerAlert({ walletAddress, email, schemaName, threshold, webhook, createdAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, message: `Alert registered: notify ${webhook} when ${schemaName} drops below ${threshold}%` });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const alerts = await getAlerts();
    return NextResponse.json({ ok: true, alerts });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
