/**
 * GET /api/onchain/check-alerts
 * Checks all registered alert subscriptions against the latest mint health
 * scores and fires webhooks for any that have dropped below threshold.
 * Designed to be called by a cron job or /api/schedules.
 */
import { NextResponse } from "next/server";
import { checkAndFireAlerts } from "@/lib/mint-stats";

export async function GET() {
  try {
    const fired = await checkAndFireAlerts();
    return NextResponse.json({ ok: true, fired, count: fired.length });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
