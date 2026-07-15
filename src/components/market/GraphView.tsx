"use client";
/**
 * GraphView — visualization of the reseller pattern.
 *
 * Shows the two-layer market: Consumer → Digest (parent escrow) and Digest → Newsroom×N (sub
 * escrows). Cash flow both directions. This is the "pair → graph" beat.
 */
import type { Deal } from "@/lib/types";
import { HashFingerprint } from "./HashFingerprint";

export function GraphView({
  parentDeal,
  subDeals,
}: {
  parentDeal: Deal | null;
  subDeals: Deal[];
}) {
  if (!parentDeal) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-muted)]">
        No digest cycle active. The graph appears when Consumer posts a WANT and Digest fulfils it by buying downstream.
      </div>
    );
  }

  const parentPrice = (parentDeal.priceLamports / 1e9).toFixed(4);
  const subTotal = subDeals.reduce((n, d) => n + d.priceLamports, 0);
  const margin = parentDeal.priceLamports - subTotal;
  const marginSol = (margin / 1e9).toFixed(4);
  const subTotalSol = (subTotal / 1e9).toFixed(4);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Reseller graph — Consumer → Digest → Newsroom×{subDeals.length || "?"}
        </h2>
        {parentDeal.state === "released" && (
          <span className="text-xs text-[var(--success)] px-2 py-0.5 rounded bg-[var(--success)]/10 border border-[var(--success)]/30">
            settled
          </span>
        )}
      </div>

      {/* Top row: parent escrow */}
      <div className="rounded-lg border-2 border-purple-500/70 bg-[var(--bg)] p-3">
        <div className="flex items-center justify-between text-sm">
          <span>
            <span className="text-[var(--text-muted)]">{parentDeal.want.buyer.label ?? "Consumer"}</span>
            <span className="mx-2 text-purple-400 font-bold">→</span>
            <span className="font-semibold text-[var(--text)]">Digest</span>
          </span>
          <span className="font-mono text-[var(--text)]">{parentPrice} SOL</span>
        </div>
        <div className="mt-1 text-xs text-[var(--text-muted)]">
          parent escrow — kept margin: <span className="font-mono text-[var(--text)]">{marginSol} SOL</span>
        </div>
        {parentDeal.explorer.release && (
          <a
            href={parentDeal.explorer.release}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--accent)] hover:underline"
          >
            parent release ↗
          </a>
        )}
      </div>

      {/* Vertical connector */}
      <div className="pl-6 relative">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-[var(--border)]" />
        <div className="space-y-2">
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
            Digest's sub-market — spent {subTotalSol} SOL buying inventory
          </div>
          {subDeals.length === 0 && (
            <div className="text-xs text-[var(--text-muted)] italic">
              posting sub-WANTs to Newsroom for each schema…
            </div>
          )}
          {subDeals.map((sub) => {
            const subPrice = (sub.priceLamports / 1e9).toFixed(4);
            return (
              <div key={sub.wantId} className="rounded border border-cyan-500/50 bg-[var(--bg)] p-2 relative">
                <div className="absolute -left-3 top-1/2 w-3 h-px bg-[var(--border)]" />
                <div className="flex items-center justify-between text-xs">
                  <span>
                    <span className="text-[var(--text-muted)]">Digest</span>
                    <span className="mx-1 text-cyan-400 font-bold">→</span>
                    <span className="text-[var(--text)]">{sub.winningBid.seller.label ?? sub.personaId}</span>
                    <span className="mx-2 text-[var(--text-muted)]">·</span>
                    <span className="font-mono">{sub.want.schemaFqn}</span>
                  </span>
                  <span className="font-mono text-[var(--text)]">{subPrice} SOL</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <HashFingerprint hashHex={sub.manifestHash ?? null} size={4} />
                  {sub.explorer.release && (
                    <a
                      href={sub.explorer.release}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      release ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
