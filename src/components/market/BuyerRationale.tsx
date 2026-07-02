"use client";
import type { Award } from "@/lib/types";

export function BuyerRationale({ award }: { award: Award }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
        <span>🤖 Buyer picks</span>
        <span className="px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--text-muted)]">
          Watchdog LLM
        </span>
      </div>
      <p className="text-sm text-[var(--text)]">{award.buyerRationale}</p>
    </div>
  );
}
