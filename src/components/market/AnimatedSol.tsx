"use client";
/**
 * AnimatedSol — a numeric SOL amount that "falls" from one visual location to another.
 *
 * Absolute-positioned in a container with two anchors (from/to). Uses CSS transforms to
 * animate the fall. Callers control when to trigger via the `trigger` counter.
 */
import { useEffect, useState } from "react";

export function AnimatedSol({
  amountSol,
  label,
  trigger,
  fromRight = false,
}: {
  amountSol: number;
  label: string;
  trigger: number;
  fromRight?: boolean;
}) {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (trigger === 0) return;
    setRunning(false);
    const start = requestAnimationFrame(() => setRunning(true));
    const timer = setTimeout(() => setRunning(false), 1400);
    return () => {
      cancelAnimationFrame(start);
      clearTimeout(timer);
    };
  }, [trigger]);

  return (
    <div
      className={[
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/40",
        "transition-all duration-1000 ease-in-out",
        running ? (fromRight ? "-translate-x-40" : "translate-x-40") : "translate-x-0",
        running ? "opacity-100" : "opacity-70",
      ].join(" ")}
    >
      <span className="text-xs font-mono text-[var(--accent)]">
        {amountSol.toFixed(4)} SOL
      </span>
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
    </div>
  );
}
