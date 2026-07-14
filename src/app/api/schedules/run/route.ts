/**
 * POST /api/schedules/run — execute due digest schedules.
 *
 * This is the missing scheduler half of the Pro digest feature: schedules are
 * created with a nextRunAt, and this endpoint (hit hourly by the server cron)
 * finds the due ones and regenerates each via /api/regenerate — which handles
 * the pipeline, share storage, RSS feed, webhook, and email delivery.
 *
 * Auth: requires the x-cron-secret header to match CRON_SECRET. Deliberately
 * separate from DATABARD_API_SECRET — that guard sits on browser-called routes
 * (synthesize/regenerate), so enabling it globally would break the UI. This
 * endpoint fails closed: no CRON_SECRET configured → 503.
 *
 * Cron example (hourly, on the box):
 *   0 * * * * . /opt/databard/.env && curl -s -X POST \
 *     -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:42100/api/schedules/run
 *
 * ?dryRun=1 lists what would run without executing — for ops verification.
 */
import { NextRequest, NextResponse } from "next/server";
import { findDueSchedules, markScheduleRun } from "@/lib/schedules";

/** Cap per invocation — each run synthesizes audio (30–90s, real TTS spend).
    Anything beyond the cap stays due and is picked up next hour. */
const MAX_RUNS_PER_INVOCATION = 5;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: "Schedule runner not configured — set CRON_SECRET" },
      { status: 503 },
    );
  }
  if (req.headers.get("x-cron-secret") !== cronSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const due = findDueSchedules();
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      due: due.map(({ customerId, schedule }) => ({
        customerId: `${customerId.slice(0, 6)}…`,
        scheduleId: schedule.id,
        schemaFqn: schedule.schemaFqn,
        source: schedule.source,
        frequency: schedule.frequency,
        nextRunAt: schedule.nextRunAt ?? null,
      })),
    });
  }

  const toRun = due.slice(0, MAX_RUNS_PER_INVOCATION);
  const ran: Array<{ scheduleId: string; schemaFqn: string; shareId: string }> = [];
  const failed: Array<{ scheduleId: string; schemaFqn: string; error: string }> = [];

  // The app serves this same process — call regenerate over loopback so the
  // pipeline, share storage, feed, webhook, and email logic stay in one place.
  const selfBase = `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  const apiSecret = process.env.DATABARD_API_SECRET;

  for (const { customerId, schedule } of toRun) {
    try {
      const res = await fetch(`${selfBase}/api/regenerate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiSecret ? { "x-api-secret": apiSecret } : {}),
        },
        body: JSON.stringify({
          schemaFqn: schedule.schemaFqn,
          source: schedule.source,
          shareId: schedule.shareId,
          outputFormat: schedule.outputFormat,
          emailRecipients: schedule.emailRecipients,
          dune: schedule.dune,
          coral: schedule.coral,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        // Leave nextRunAt untouched — the schedule stays due and retries next hour
        failed.push({
          scheduleId: schedule.id,
          schemaFqn: schedule.schemaFqn,
          error: typeof data?.error === "string" ? data.error : `HTTP ${res.status}`,
        });
        continue;
      }
      markScheduleRun(customerId, schedule.id, data.id);
      ran.push({ scheduleId: schedule.id, schemaFqn: schedule.schemaFqn, shareId: data.id });
    } catch (e: unknown) {
      failed.push({
        scheduleId: schedule.id,
        schemaFqn: schedule.schemaFqn,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    due: due.length,
    ran,
    failed,
    deferred: Math.max(0, due.length - toRun.length),
  });
}
