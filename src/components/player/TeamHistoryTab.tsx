"use client";

import { useState, useEffect } from "react";

export function TeamHistoryTab({ schemaName }: { schemaName: string }) {
  const [history, setHistory] = useState<Array<{
    walletAddress: string; healthScore: number; episodeId: string;
    txSignature: string; createdAt: string; teamId?: string; network: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/onchain/team-history?schemaName=${encodeURIComponent(schemaName)}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setHistory(d.history); else setError(d.error); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [schemaName]);

  if (loading) return <div className="p-6 text-center text-xs text-[var(--text-muted)]">Loading team history…</div>;
  if (error) return <div className="p-4 text-xs text-[var(--danger)]">{error}</div>;
  if (history.length === 0) return (
    <div className="p-6 text-center text-xs text-[var(--text-muted)]">
      <p className="mb-1">No mints yet for <strong>{schemaName}</strong>.</p>
      <p>Mint this episode on Solana to start building shared accountability history.</p>
    </div>
  );

  return (
    <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
      <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3">
        {history.length} mint{history.length !== 1 ? "s" : ""} across {new Set(history.map((m) => m.walletAddress)).size} wallet{new Set(history.map((m) => m.walletAddress)).size !== 1 ? "s" : ""}
      </p>
      {history.map((m) => {
        const health = m.healthScore;
        const color = health >= 80 ? "var(--success)" : health >= 50 ? "#f5c842" : "var(--danger)";
        const net = m.network === "mainnet-beta" ? "" : `?cluster=${m.network}`;
        return (
          <div key={m.txSignature} className="bg-[var(--bg)] rounded-lg p-3 border border-[var(--border)] flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono text-[var(--text-muted)] truncate">{m.walletAddress.slice(0, 8)}…{m.walletAddress.slice(-4)}</span>
                {m.teamId && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)]">{m.teamId}</span>}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">{new Date(m.createdAt).toLocaleString()}</div>
            </div>
            <span style={{ color, fontWeight: 700, fontSize: 13 }}>{health}%</span>
            <a
              href={`https://explorer.solana.com/tx/${m.txSignature}${net}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[var(--accent)] hover:underline shrink-0"
            >
              ↗ tx
            </a>
          </div>
        );
      })}
    </div>
  );
}
