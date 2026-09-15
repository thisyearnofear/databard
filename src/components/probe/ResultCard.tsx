"use client";

/**
 * ResultCard — displays a single probed agent service with its composite
 * score, breakdown bars, and any flags. Used on /probe.
 */

interface BreakdownEntry {
  label: string;
  value: number;
  weight: string;
}

export interface ProbeResultCardProps {
  rank: number;
  name: string;
  endpoint: string;
  agentId?: string;
  score: number;
  label: string;
  breakdown: {
    schemaCompleteness: number;
    latency: number;
    freshness: number;
    priceValue: number;
    reliability: number;
    credentials: number;
  };
  flags: string[];
  reachable: boolean;
  knownPriceUsd: number | null;
  error?: string | null;
  attestationTx?: string | null;
}

function scoreColor(score: number): string {
  if (score >= 80) return "var(--success, #22c55e)";
  if (score >= 50) return "var(--warning, #eab308)";
  return "var(--danger, #ef4444)";
}

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <div className="h-2 flex-1 rounded-sm bg-[var(--border)]">
        <div
          className="h-2 rounded-sm transition-all"
          style={{ width: `${value}%`, backgroundColor: scoreColor(value) }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs tabular-nums text-[var(--text)]">
        {value}
      </span>
    </div>
  );
}

export function ResultCard({
  rank,
  name,
  endpoint,
  agentId,
  score,
  label,
  breakdown,
  flags,
  reachable,
  knownPriceUsd,
  error,
  attestationTx,
}: ProbeResultCardProps) {
  const bars: BreakdownEntry[] = [
    { label: "Schema", value: breakdown.schemaCompleteness, weight: "25%" },
    { label: "Latency", value: breakdown.latency, weight: "18%" },
    { label: "Freshness", value: breakdown.freshness, weight: "17%" },
    { label: "Price/Value", value: breakdown.priceValue, weight: "13%" },
    { label: "Reliability", value: breakdown.reliability, weight: "13%" },
    { label: "Credentials", value: breakdown.credentials, weight: "14%" },
  ];

  return (
    <article
      className="border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
      aria-label={`${name} — score ${score}/100`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[var(--text-muted)]">#{rank}</span>
            <h3 className="truncate text-lg font-bold tracking-tight text-[var(--text)]">
              {name}
            </h3>
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-muted)]">
            {endpoint}
          </p>
          {agentId && (
            <p className="font-mono text-[10px] text-[var(--text-muted)]">
              ASP #{agentId}
            </p>
          )}
        </div>

        {/* Score badge */}
        <div className="shrink-0 text-center">
          <p
            className="font-display text-4xl font-bold tabular-nums leading-none"
            style={{ color: reachable ? scoreColor(score) : "var(--text-muted)" }}
          >
            {reachable ? score : "—"}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
            {reachable ? label : "unreachable"}
          </p>
        </div>
      </div>

      {/* Price tag */}
      {knownPriceUsd !== null && (
        <p className="mt-2 inline-block border border-[var(--border)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-muted)]">
          {knownPriceUsd === 0 ? "Free" : `$${knownPriceUsd.toFixed(4)}/call`}
        </p>
      )}

      {/* Breakdown bars */}
      {reachable && (
        <div className="mt-4 space-y-2">
          {bars.map((b) => (
            <Bar key={b.label} value={b.value} label={b.label} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mt-3 text-xs text-[var(--danger)]">{error}</p>
      )}

      {/* Flags */}
      {flags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {flags.map((f, i) => (
            <li
              key={i}
              className="border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]"
            >
              {f}
            </li>
          ))}
        </ul>
      )}

      {/* Attestation link */}
      {attestationTx && (
        <a
          href={`https://www.oklink.com/xlayer/tx/${attestationTx}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block font-mono text-[11px] text-[var(--accent)] underline underline-offset-2"
        >
          View attestation → {attestationTx.slice(0, 10)}…
        </a>
      )}
    </article>
  );
}
