"use client";

import { scoreDitherColor, scoreTextClass } from "@/lib/product/score-tone";
import { Gauge, Meter } from "@/components/dither-kit";

interface PaymentInfo {
  challengeReceived: boolean;
  paid: boolean;
  settlementTx?: string;
  amountUsd?: number;
  error?: string;
}

export interface ProbeResultCardProps {
  name: string;
  endpoint: string;
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
  payment?: PaymentInfo | null;
  fromCache?: boolean;
  /** DataBard's own service — shown for context, excluded from ranking. */
  reference?: boolean;
}

const breakdownLabels: Record<string, string> = {
  schemaCompleteness: "Schema",
  latency: "Latency",
  freshness: "Freshness",
  priceValue: "Price/Value",
  reliability: "Reliability",
  credentials: "Credentials",
};

export function ResultCard({
  name,
  endpoint,
  score,
  label,
  breakdown,
  flags,
  reachable,
  payment,
  fromCache,
  reference,
}: ProbeResultCardProps) {
  return (
    <div className={`rounded-lg border p-4 flex flex-col gap-3 ${reference ? "border-dashed border-[var(--border)] bg-[var(--bg)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
      {reference && (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          Reference — our own service, not ranked
        </p>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{name}</h3>
          <p className="font-mono text-[11px] text-[var(--text-muted)] truncate max-w-[200px]" title={endpoint}>
            {endpoint}
          </p>
        </div>
        <div className="text-right shrink-0">
          {reachable ? (
            <>
              <Gauge
                value={score}
                color={scoreDitherColor(score)}
                ticks={[50, 80]}
                bloom="low"
                bloomOnHover
                className="w-[88px]"
                valueClassName={scoreTextClass(score)}
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">{label}</p>
            </>
          ) : (
            <>
              <span className="text-2xl font-bold font-display text-[var(--text-muted)]">
                {score}
              </span>
              <span className="text-xs text-[var(--text-muted)]"> / 100</span>
              <p className="text-xs text-[var(--text-muted)]">{label}</p>
            </>
          )}
        </div>
      </div>

      {(payment || fromCache) && (
        <div className="flex flex-wrap gap-1.5">
          {payment?.paid && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]"
              title={payment.settlementTx ? `Settlement: ${payment.settlementTx}` : undefined}
            >
              Paid {payment.amountUsd != null ? `$${payment.amountUsd}` : ""} via x402
            </span>
          )}
          {payment?.challengeReceived && !payment?.paid && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]"
              title={payment.error}
            >
              402 challenge{payment.error ? ` · ${payment.error}` : ""}
            </span>
          )}
          {fromCache && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
              cached (1h)
            </span>
          )}
        </div>
      )}

      {reachable ? (
        <div className="space-y-2">
          {(Object.entries(breakdown) as [string, number][]).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--text-muted)] w-20 shrink-0">
                {breakdownLabels[key] ?? key}
              </span>
              <Meter
                value={Math.min(100, Math.max(0, value))}
                color={scoreDitherColor(value)}
                height={6}
                animate={false}
                className="flex-1"
              />
              <span className="text-[11px] font-medium w-8 text-right">
                {Math.round(value)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">Endpoint unreachable.</p>
      )}

      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((flag) => (
            <span
              key={flag}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--danger)]"
            >
              {flag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
