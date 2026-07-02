"use client";
/**
 * ActivityFeed — recent settled Deals across all agents.
 *
 * Polls /api/market/deal every few seconds. Shows a scrollable timeline: buyer → seller,
 * amount, elapsed time, explorer link. Makes the market feel like a live economy.
 */
import { useEffect, useState } from "react";
import type { Deal } from "@/lib/types";

export function ActivityFeed() {
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/market/deal");
        const json = await res.json();
        if (!cancelled && json.ok) setDeals(json.deals ?? []);
      } catch {
        /* ignore */
      }
    }
    poll();
    const iv = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  return (
    <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3 sticky top-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Live activity
        </h3>
        <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
          <div className="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse" />
          <span>on devnet</span>
        </div>
      </div>
      <div className="space-y-2 max-h-[520px] overflow-y-auto">
        {deals.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)] italic p-2">
            no settlements yet — the first WANT will land here
          </div>
        ) : (
          deals.map((d) => <ActivityRow key={d.wantId} deal={d} />)
        )}
      </div>
    </aside>
  );
}

function ActivityRow({ deal }: { deal: Deal }) {
  const priceSol = (deal.priceLamports / 1e9).toFixed(4);
  const buyerLabel = deal.want.buyer.label ?? "buyer";
  const sellerLabel = deal.winningBid.seller.label ?? deal.personaId;

  return (
    <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-2 text-xs space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[var(--text)]">
          <span className="text-[var(--text-muted)]">{buyerLabel}</span>
          <span className="mx-1 text-[var(--accent)]">→</span>
          <span className="font-medium">{sellerLabel}</span>
        </span>
        <span className="font-mono text-[var(--text-muted)]">{priceSol} SOL</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--text-muted)]">
          {stateLabel(deal.state)} · {timeAgo(deal.updatedAt)}
        </span>
        {deal.explorer.release && (
          <a
            href={deal.explorer.release}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[var(--accent)] hover:underline"
          >
            explorer ↗
          </a>
        )}
      </div>
    </div>
  );
}

function stateLabel(state: string): string {
  switch (state) {
    case "deposited": return "deposited";
    case "delivered": return "delivered";
    case "released": return "settled";
    case "refunded": return "refunded";
    default: return state;
  }
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
