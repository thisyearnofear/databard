"use client";
/**
 * Public ledger of every settled Deal — the "verify every settlement outside
 * DataBard" view. Each row is a full receipt: buyer + seller, price, manifest
 * hash and every explorer link (deposit / commit / release / mint / refund).
 */
import { useEffect, useState } from "react";
import type { Deal } from "@/lib/types";

export function ReceiptsLedger() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch("/api/market/deal");
        const json = await res.json();
        if (!cancelled && json.ok) {
          setDeals(json.deals ?? []);
          setNow(Date.now());
        }
      } catch { /* noop */ }
    }
    tick();
    const iv = setInterval(tick, 6000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const totals = deals.reduce(
    (acc, d) => {
      const sol = d.priceLamports / 1e9;
      acc.count += 1;
      acc.grossSol += sol;
      acc.personas[d.personaId] = (acc.personas[d.personaId] ?? 0) + 1;
      return acc;
    },
    { count: 0, grossSol: 0, personas: {} as Record<string, number> },
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-4 text-xs flex-wrap">
        <span className="text-[var(--text-muted)]">
          {totals.count} settled · {totals.grossSol.toFixed(4)} SOL total gross
        </span>
        <span className="text-[var(--text-muted)]">·</span>
        <span className="text-[var(--text)]">
          {Object.entries(totals.personas)
            .sort((a, b) => b[1] - a[1])
            .map(([p, n]) => `${p}: ${n}`)
            .join(" · ")}
        </span>
        <span className="text-xs text-[var(--text-muted)] ml-auto">
          last poll {new Date(now).toLocaleTimeString()}
        </span>
      </div>

      {deals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--text-muted)]">
          No settled deals yet — the Watchdog track writes them as auctions close.
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map((d) => (
            <ReceiptCard key={d.wantId} deal={d} />
          ))}
        </div>
      )}
    </section>
  );
}

const EXPLORER_LINKS: Array<{ key: keyof Deal["explorer"]; label: string; className: string }> = [
  { key: "deposit", label: "deposit ↗", className: "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/60 hover:text-[var(--accent)]" },
  { key: "commit", label: "commit ↗", className: "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/60 hover:text-[var(--accent)]" },
  { key: "release", label: "release ↗", className: "border-[var(--success)]/40 bg-[var(--success)]/5 hover:border-[var(--success)]/70 text-[var(--success)]" },
  { key: "mint", label: "mint ↗", className: "border-[var(--accent-vivid)]/40 bg-[var(--accent-vivid)]/5 hover:border-[var(--accent-vivid)]/70 text-[var(--accent-vivid)]" },
  { key: "refund", label: "refund ↗", className: "border-[var(--warning)]/40 bg-[var(--warning)]/5 hover:border-[var(--warning)]/70 text-[var(--warning)]" },
];

function ReceiptCard({ deal }: { deal: Deal }) {
  const price = (deal.priceLamports / 1e9).toFixed(4);
  const buyer = deal.want.buyer.label ?? "buyer";
  const seller = deal.winningBid.seller.label ?? deal.personaId;
  const state = deal.state;
  const stateCls = state === "released"
    ? "text-[var(--success)]"
    : state === "delivered"
      ? "text-[var(--accent)]"
      : state === "refunded"
        ? "text-[var(--warning)]"
        : "text-[var(--text-muted)]";

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--text-muted)]">{buyer}</span>
          <span className="text-[var(--accent)] font-bold">→</span>
          <span className="font-semibold">{seller}</span>
          <span className="text-[var(--text-muted)] font-mono ml-2">
            · {deal.want.schemaFqn}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="font-mono">{price} SOL</span>
          <span className={`uppercase tracking-wider ${stateCls}`}>{state}</span>
        </div>
      </header>

      {deal.manifestHash && (
        <div className="text-xs text-[var(--text-muted)] font-mono break-all">
          manifest: {deal.manifestHash}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {EXPLORER_LINKS.map(({ key, label, className }) => {
          const href = deal.explorer[key];
          if (!href) return null;
          return (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`px-2.5 py-2.5 rounded border ${className}`}
            >
              {label}
            </a>
          );
        })}
      </div>

      <footer className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>updated {new Date(deal.updatedAt).toLocaleString()}</span>
        <span className="font-mono">deal:{deal.wantId}</span>
      </footer>
    </article>
  );
}
