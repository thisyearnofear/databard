/**
 * Schedule discovery + bookkeeping for Pro weekly/daily digests.
 *
 * Schedules are created via /api/schedules and stored on ProAccount records.
 * Nothing runs them by itself — /api/schedules/run (hit by the server cron)
 * uses findDueSchedules/markScheduleRun to execute due ones via /api/regenerate.
 */
import { store, proAccounts, type ProAccount, type ScheduleConfig } from "./store";

export interface DueSchedule {
  customerId: string;
  schedule: ScheduleConfig;
}

export function computeNextRun(schedule: Pick<ScheduleConfig, "frequency" | "dayOfWeek" | "hour">): string {
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

/** All schedules across all Pro accounts whose nextRunAt has passed.
    A schedule without nextRunAt (legacy record) counts as due. */
export function findDueSchedules(now: Date = new Date()): DueSchedule[] {
  const due: DueSchedule[] = [];
  for (const key of store.keys("pro:")) {
    const account = store.get<ProAccount>(key);
    if (!account?.schedules?.length) continue;
    const customerId = key.slice("pro:".length);
    for (const schedule of account.schedules) {
      if (!schedule.nextRunAt || new Date(schedule.nextRunAt) <= now) {
        due.push({ customerId, schedule });
      }
    }
  }
  return due;
}

/** Record a successful run: stamp lastRunAt, advance nextRunAt, link the episode. */
export function markScheduleRun(customerId: string, scheduleId: string, shareId?: string): void {
  const account = proAccounts.get(customerId);
  if (!account) return;
  const schedules = account.schedules.map((s) =>
    s.id === scheduleId
      ? {
          ...s,
          lastRunAt: new Date().toISOString(),
          nextRunAt: computeNextRun(s),
          ...(shareId ? { shareId } : {}),
        }
      : s
  );
  proAccounts.update(customerId, { schedules });
}
