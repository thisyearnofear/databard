import { NextRequest, NextResponse } from "next/server";
import { sendWeeklyBenchmarks } from "@/lib/benchmark-digest";

/**
 * POST /api/audit/benchmarks/send — cron-guarded weekly benchmark send.
 * Fire Monday 9am with x-cron-secret (same pattern as schedules/verdicts).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  const result = await sendWeeklyBenchmarks();
  return NextResponse.json({ ok: true, ...result });
}
