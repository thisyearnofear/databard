"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CountUp } from "@/components/CountUp";
import type { TrendNarrative } from "@/app/api/insights/trends/route";
import { workspaceHref, type Workspace } from "@/lib/product/workspaces";
import { scoreTextClass } from "@/lib/product/score-tone";

/**
 * Seeded Orca finding from the demo snapshots (83 → 68). Shown when the
 * engine has no live snapshots yet, so the homepage still leads with a
 * real protocol result instead of industry statistics.
 */
const FALLBACK_PROTOCOL_PROOF = {
  schemaName: "Orca Whirlpools",
  schemaFqn: "orca.whirlpools",
  healthScore: 68,
  healthScoreChange: -7,
  narrative:
    "Health dropped 7 points this week. Tick bounds failing. Swap quotes stale for 72 hours. Bad ticks mean bad quotes.",
};

const PROTOCOL_SOURCE = /orca|marinade|jupiter|raydium|dune|uniswap|subgraph|graph/i;

function pickProtocolTrend(narratives: TrendNarrative[]): TrendNarrative | null {
  const declining = narratives.filter((n) => n.healthScoreChange < 0);
  const protocolDeclining = declining.filter((n) =>
    PROTOCOL_SOURCE.test(`${n.schemaFqn} ${n.schemaName}`),
  );
  return protocolDeclining[0] ?? declining[0] ?? null;
}

export function LandingProof({
  workspace,
  onConnect,
}: {
  workspace: Workspace;
  onConnect: () => void;
}) {
  const [trend, setTrend] = useState<TrendNarrative | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (workspace === "teams") {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    fetch("/api/insights/trends")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d.ok) return;
        setTrend(pickProtocolTrend(d.narratives ?? []));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  if (workspace === "teams") {
    return (
      <section className="enter-up enter-delay-1 w-full max-w-2xl pb-10">
        <button
          type="button"
          onClick={onConnect}
          className="w-full text-left bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] rounded-2xl p-5 transition-colors"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">
            Fastest path
          </p>
          <h2 className="text-xl font-bold mt-2">Upload a dbt manifest</h2>
          <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
            A health score and a 2-minute roast in about 90 seconds. No catalog
            required — just the <span className="font-mono text-[var(--text)]">target/manifest.json</span> from a dbt build.
          </p>
          <p className="text-xs font-medium text-[var(--accent)] mt-3">Connect a manifest →</p>
        </button>
      </section>
    );
  }

  const proof = trend ?? (loaded ? FALLBACK_PROTOCOL_PROOF : null);
  if (!proof) {
    return <section className="w-full max-w-2xl pb-10 min-h-[8.5rem]" aria-hidden />;
  }

  const href = workspaceHref("/protocol", "protocols");

  return (
    <section className="enter-up enter-delay-1 w-full max-w-2xl pb-10">
      <Link
        href={href}
        className="block bg-[var(--surface)] border border-[var(--danger)]/30 hover:border-[var(--danger)]/60 rounded-2xl p-5 transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--danger)]">
              {trend ? "Live finding" : "Public subgraph"}
            </p>
            <h2 className="text-xl font-bold mt-2 truncate">{proof.schemaName}</h2>
            <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
              {proof.narrative}
            </p>
            <p className="text-xs font-medium text-[var(--accent)] mt-3">Open the briefing →</p>
          </div>
          <div className="shrink-0 text-right">
            <div className={`font-display text-4xl font-bold tabular-nums ${scoreTextClass(proof.healthScore)}`}>
              <CountUp value={proof.healthScore} />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-1">
              health
            </p>
          </div>
        </div>
      </Link>
    </section>
  );
}
