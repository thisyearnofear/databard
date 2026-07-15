"use client";
/**
 * WatchdogMonitor — the autonomous-appearance card.
 *
 * Shows a countdown to the next Watchdog check and a delta meter filling toward the trigger
 * threshold. When the client fires an auction, this card gets a "detected" state.
 */
export type MonitorState = "idle" | "detected" | "in-cycle";

const THRESHOLD = 0.2;

export function WatchdogMonitor({
  countdownSec,
  deltaScore,
  state,
  cycleCount,
}: {
  countdownSec: number;
  deltaScore: number;
  state: MonitorState;
  cycleCount: number;
}) {
  const deltaPct = Math.min(100, Math.round(deltaScore * 100));
  const thresholdPct = THRESHOLD * 100;

  return (
    <div
      className={[
        "rounded-lg border-2 bg-[var(--surface)] p-5 space-y-4 transition-colors",
        state === "idle" ? "border-[var(--border)]" : "",
        state === "detected" ? "border-[var(--warning)] shadow-[0_0_20px_var(--warning)]" : "",
        state === "in-cycle" ? "border-[var(--accent)]" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🐕</span>
            <div>
              <div className="font-semibold text-[var(--text)]">Watchdog</div>
              <div className="text-xs text-[var(--text-muted)]">
                autonomous machine buyer · {cycleCount} cycle{cycleCount === 1 ? "" : "s"} today
              </div>
            </div>
          </div>
        </div>
        <div className="text-right">
          {state === "idle" && (
            <>
              <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">next check</div>
              <div className="font-mono text-lg text-[var(--text)]">{formatCountdown(countdownSec)}</div>
            </>
          )}
          {state === "detected" && (
            <div className="text-[var(--warning)] text-sm font-semibold animate-pulse">
              catalog drift detected
            </div>
          )}
          {state === "in-cycle" && (
            <div className="text-[var(--accent)] text-sm font-semibold">
              executing market cycle
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[var(--text-muted)]">catalog health delta</span>
          <span className="font-mono text-[var(--text)]">{(deltaScore * 100).toFixed(0)}%</span>
        </div>
        <div className="relative h-2 rounded-full bg-[var(--bg)] overflow-hidden">
          {/* Threshold marker */}
          <div
            className="absolute top-0 bottom-0 w-px bg-[var(--text-muted)]/60"
            style={{ left: `${thresholdPct}%` }}
            title={`trigger threshold: ${thresholdPct.toFixed(0)}%`}
          />
          {/* Filled portion */}
          <div
            className={[
              "absolute top-0 left-0 bottom-0 transition-[width,background-color] duration-1000",
              deltaScore >= THRESHOLD ? "bg-[var(--warning)]" : "bg-[var(--accent)]",
            ].join(" ")}
            style={{ width: `${deltaPct}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-[var(--text-muted)]">
          trigger at {thresholdPct.toFixed(0)}% — Watchdog posts a WANT when catalog drift exceeds the threshold
        </div>
      </div>
    </div>
  );
}

function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
