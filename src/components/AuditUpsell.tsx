"use client";

import { useState } from "react";
import { track } from "@/lib/track";

const TIERS = [
  { sku: "snapshot", name: "Snapshot", price: "£29", line: "Score + top finding + one benchmark", featured: false },
  { sku: "plus", name: "Benchmark Audit", price: "£99", line: "Full report + benchmarks + 3-step plan", featured: true },
  { sku: "operator", name: "Operator Pack", price: "£249", line: "Audit + analyst call + 4 re-checks", featured: false },
] as const;

/** Three-tier one-off audit ladder (Shipyard) — decoy / target / anchor. */
export function AuditUpsell() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(sku: string) {
    setBusy(sku);
    setError(null);
    track("integration_cta_click", { surface: "roast_upsell", cta: `audit_${sku}` });
    try {
      const res = await fetch("/api/checkout/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Checkout unavailable");
    } catch {
      setError("Checkout unavailable — try again in a moment");
    }
    setBusy(null);
  }

  return (
    <section className="w-full space-y-3" aria-labelledby="audit-upsell">
      <h2 id="audit-upsell" className="text-sm font-semibold text-center">
        Or skip the roast and get the full audit
      </h2>
      <p className="text-xs text-[var(--text-muted)] text-center">
        A receipted, one-off data-health audit — benchmarks included, report by email.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {TIERS.map((t) => (
          <button
            key={t.sku}
            onClick={() => buy(t.sku)}
            disabled={busy !== null}
            className={`text-left rounded-xl border p-4 transition disabled:opacity-50 ${
              t.featured
                ? "border-[var(--accent)] bg-[var(--accent)]/10 hover:border-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/60"
            }`}
          >
            <span className="block font-display text-lg font-bold">{t.price}</span>
            <span className={`block text-sm font-semibold ${t.featured ? "text-[var(--accent)]" : ""}`}>
              {t.name}
            </span>
            <span className="mt-1 block text-[11px] leading-snug text-[var(--text-muted)]">{t.line}</span>
            <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {busy === t.sku ? "Redirecting…" : "Get it →"}
            </span>
          </button>
        ))}
      </div>
      {error && <p className="text-center text-xs text-[var(--danger)]">{error}</p>}
    </section>
  );
}
