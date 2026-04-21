import { NextRequest, NextResponse } from "next/server";
import { proAccounts, type ScheduleConfig } from "@/lib/store";
import { getSessionConfig } from "@/lib/session";

/**
 * Schedule management for Pro accounts.
 *
 * GET  /api/schedules?customerId=xxx — list schedules
 * POST /api/schedules — create/update a schedule
 * DELETE /api/schedules?id=xxx&customerId=xxx — remove a schedule
 */

function getAccount(customerId: string) {
  const account = proAccounts.get(customerId);
  if (!account) return null;
  return account;
}

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ ok: false, error: "customerId required" }, { status: 400 });

  const account = getAccount(customerId);
  if (!account) return NextResponse.json({ ok: false, error: "Pro account not found" }, { status: 404 });

  return NextResponse.json({ ok: true, schedules: account.schedules, feedToken: account.feedToken });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { customerId, schedule } = body as { customerId: string; schedule: Omit<ScheduleConfig, "id"> };

  if (!customerId || !schedule) {
    return NextResponse.json({ ok: false, error: "customerId and schedule required" }, { status: 400 });
  }

  const account = getAccount(customerId);
  if (!account) return NextResponse.json({ ok: false, error: "Pro account not found" }, { status: 404 });

  // Validate schedule
  if (!schedule.schemaFqn) return NextResponse.json({ ok: false, error: "schemaFqn required" }, { status: 400 });
  if (!["daily", "weekly"].includes(schedule.frequency)) {
    return NextResponse.json({ ok: false, error: "frequency must be daily or weekly" }, { status: 400 });
  }

  const id = Math.random().toString(36).substring(2, 10);
  const newSchedule: ScheduleConfig = {
    ...schedule,
    id,
    nextRunAt: computeNextRun(schedule),
  };

  const schedules = [...account.schedules.filter((s) => s.schemaFqn !== schedule.schemaFqn), newSchedule];
  proAccounts.update(customerId, { schedules });

  return NextResponse.json({ ok: true, schedule: newSchedule });
}

export async function DELETE(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customerId");
  const scheduleId = req.nextUrl.searchParams.get("id");

  if (!customerId || !scheduleId) {
    return NextResponse.json({ ok: false, error: "customerId and id required" }, { status: 400 });
  }

  const account = getAccount(customerId);
  if (!account) return NextResponse.json({ ok: false, error: "Pro account not found" }, { status: 404 });

  const schedules = account.schedules.filter((s) => s.id !== scheduleId);
  proAccounts.update(customerId, { schedules });

  return NextResponse.json({ ok: true });
}

function computeNextRun(schedule: Omit<ScheduleConfig, "id">): string {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(schedule.hour ?? 9, 0, 0, 0);

  if (schedule.frequency === "daily") {
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  } else {
    // weekly — find next occurrence of dayOfWeek
    const targetDay = schedule.dayOfWeek ?? 1; // default Monday
    const daysUntil = (targetDay - now.getUTCDay() + 7) % 7 || 7;
    next.setUTCDate(now.getUTCDate() + daysUntil);
  }

  return next.toISOString();
}
