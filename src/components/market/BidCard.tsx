"use client";
import type { Bid } from "@/lib/types";

const PERSONA_STYLE: Record<string, { color: string; badge: string; tagline: string }> = {
  signal:   { color: "border-[var(--accent-vivid)]", badge: "bg-[var(--accent-vivid)]/20 text-[var(--accent-vivid)]", tagline: "Executive brief" },
  cascade:  { color: "border-[var(--warning)]",  badge: "bg-[var(--warning)]/20 text-[var(--warning)]",   tagline: "Deep-dive"      },
  newsroom: { color: "border-[var(--accent-light)]",   badge: "bg-[var(--accent-light)]/20 text-[var(--accent-light)]",     tagline: "Breaking flash"  },
};

export function BidCard({
  bid,
  isWinner,
  isRunnerUp,
  dimmed,
}: {
  bid: Bid;
  isWinner?: boolean;
  isRunnerUp?: boolean;
  dimmed?: boolean;
}) {
  const style = PERSONA_STYLE[bid.personaId] ?? { color: "border-[var(--border)]", badge: "bg-[var(--border)] text-[var(--text-muted)]", tagline: "" };
  const priceSol = (bid.priceLamports / 1e9).toFixed(4);

  return (
    <div
      className={[
        "rounded-lg border-2 p-4 space-y-2 transition",
        style.color,
        isWinner ? "bg-[var(--surface)] scale-[1.02] shadow-lg" : "bg-[var(--surface)]",
        dimmed && !isWinner ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--text)]">{bid.seller.label ?? bid.personaId}</span>
            {isWinner && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--success)]/20 text-[var(--success)] font-medium">
                ★ AWARDED
              </span>
            )}
            {isRunnerUp && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--text-muted)]">
                runner-up
              </span>
            )}
          </div>
          <div className={`text-xs mt-0.5 inline-block px-1.5 py-0.5 rounded ${style.badge}`}>
            {style.tagline}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg text-[var(--text)]">{priceSol}</div>
          <div className="text-xs text-[var(--text-muted)]">SOL</div>
        </div>
      </div>
      <div className="text-sm text-[var(--text-muted)] italic">"{bid.reasoning}"</div>
      <div className="text-xs text-[var(--text-muted)]">ETA {bid.etaSec}s</div>
    </div>
  );
}
