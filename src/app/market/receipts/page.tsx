"use client";
/**
 * /market/receipts — public ledger of every settled Deal.
 *
 * Every row is a full settlement receipt: buyer + seller (persona), price, manifest hash,
 * every explorer link (deposit / commit / release / mint). Auto-polls every 6 seconds.
 * This is the "you can verify every settlement outside DataBard" story — no cache required.
 */
import { useEffect, useState } from "react";
import type { Deal } from "@/lib/types";

export default function ReceiptsPage() {
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
    <main className="min-h-screen max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">📜 Settlement receipts</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Every deal DataBard's marketplace has closed on-chain, newest first. Each row's
          Explorer links let you verify the whole lifecycle outside this app — no cache
          required. Live-refreshing every 6s.
        </p>
        <div className="flex items-center gap-4 text-xs">
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
          <span className="text-[var(--text-muted)]">·</span>
          <a href="/market" className="text-[var(--accent)] hover:underline">
            /market →
          </a>
          <a href="/loop" className="text-[var(--accent)] hover:underline">
            /loop →
          </a>
          <span className="text-xs text-[var(--text-muted)] ml-auto">
            last poll {new Date(now).toLocaleTimeString()}
          </span>
        </div>
      </header>

      {deals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center text-[var(--text-muted)]">
          No settled deals yet — start one at <a href="/market" className="text-[var(--accent)] hover:underline">/market</a>.
        </div>
      ) : (
        <section className="space-y-3">
          {deals.map((d) => (
            <ReceiptCard key={d.wantId} deal={d} />
          ))}
        </section>
      )}
    </main>
  );
}

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
        ? "text-yellow-400"
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
        {deal.explorer.deposit && (
          <a
            href={deal.explorer.deposit}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-2.5 rounded border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/60 hover:text-[var(--accent)]"
          >
            deposit ↗
          </a>
        )}
        {deal.explorer.commit && (
          <a
            href={deal.explorer.commit}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-2.5 rounded border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/60 hover:text-[var(--accent)]"
          >
            commit ↗
          </a>
        )}
        {deal.explorer.release && (
          <a
            href={deal.explorer.release}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-2.5 rounded border border-[var(--success)]/40 bg-[var(--success)]/5 hover:border-[var(--success)]/70 text-[var(--success)]"
          >
            release ↗
          </a>
        )}
        {deal.explorer.mint && (
          <a
            href={deal.explorer.mint}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-2.5 rounded border border-purple-500/40 bg-purple-500/5 hover:border-purple-500/70 text-purple-400"
          >
            mint ↗
          </a>
        )}
        {deal.explorer.refund && (
          <a
            href={deal.explorer.refund}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-2.5 rounded border border-yellow-500/40 bg-yellow-500/5 hover:border-yellow-500/70 text-yellow-400"
          >
            refund ↗
          </a>
        )}
      </div>

      <footer className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>updated {new Date(deal.updatedAt).toLocaleString()}</span>
        <span className="font-mono">deal:{deal.wantId}</span>
      </footer>
    </article>
  );
}
