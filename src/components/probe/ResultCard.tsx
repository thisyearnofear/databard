"use client";

import { scoreColor, scoreTextClass } from "@/lib/product/score-tone";

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
}: ProbeResultCardProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{name}</h3>
          <p className="font-mono text-[11px] text-[var(--text-muted)] truncate max-w-[200px]" title={endpoint}>
            {endpoint}
          </p>
        </div>
        <div className="text-right">
          <span
            className={`text-2xl font-bold font-display ${
              reachable ? scoreTextClass(score) : "text-[var(--text-muted)]"
            }`}
          >
            {score}
          </span>
          <span className="text-xs text-[var(--text-muted)]"> / 100</span>
          <p className="text-xs text-[var(--text-muted)]">{label}</p>
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
              <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, value))}%`,
                    backgroundColor: scoreColor(value),
                  }}
                />
              </div>
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
