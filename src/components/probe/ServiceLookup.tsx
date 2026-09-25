"use client";

import Link from "next/link";
import { useState } from "react";
import { PixelIcon } from "@/components/dither-kit";
import { scoreTextClass } from "@/lib/product/score-tone";

type Verdict = "safe_to_pay" | "caution" | "avoid" | "unknown";

interface LookupMatch {
  serviceId?: string;
  agentId: string;
  agentName: string;
  serviceName: string;
  endpoint: string;
  feeUsd: number;
  score: number | null;
  status: string;
  flags: string[];
  pageUrl?: string;
}

interface LookupResult {
  ok: boolean;
  matches: LookupMatch[];
  verdict: Verdict;
  keyFindings: string[];
  nextStep: string;
  alternatives: LookupMatch[];
  indexGeneratedAt: string | null;
  error?: string;
}

const VERDICT_META: Record<Verdict, { label: string; color: string; icon: "check" | "warning" | "search" }> = {
  safe_to_pay: { label: "Safe to pay", color: "var(--success)", icon: "check" },
  caution: { label: "Caution", color: "var(--warning)", icon: "warning" },
  avoid: { label: "Avoid", color: "var(--danger)", icon: "warning" },
  unknown: { label: "Unknown", color: "var(--text-muted)", icon: "search" },
};

/** Free service lookup: "should my agent pay this service?" answered from the
    public marketplace health index. No wallet, no payment, never errors. */
export function ServiceLookup() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runLookup() {
    const q = input.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    // Route the input the way the API aliases work: URLs look up by
    // endpoint, bare numbers by agent id, everything else by keyword.
    const body = /^https?:\/\//i.test(q)
      ? { endpoint: q }
      : /^\d+$/.test(q)
        ? { agentId: q }
        : { query: q };
    try {
      const res = await fetch("/api/mcp/service-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429) {
        setError("Too many lookups — try again in a little while. The index below is always free to browse.");
        return;
      }
      const data = (await res.json()) as LookupResult;
      if (!data.ok) {
        setError("The lookup did not complete. Try again, or browse the index below.");
        return;
      }
      setResult(data);
    } catch {
      setError("The lookup did not complete. Try again, or browse the index below.");
    } finally {
      setLoading(false);
    }
  }

  const primary = result?.matches[0];
  const verdict = result ? VERDICT_META[result.verdict] : null;

  return (
    <section className="mt-8 border border-[var(--border)] bg-[var(--surface)] px-5 py-5" aria-labelledby="service-lookup">
      <h2 id="service-lookup" className="flex items-center gap-2 text-sm font-semibold">
        <PixelIcon name="search" size={14} className="text-[var(--accent)]" />
        Should your agent pay this service?
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
        Look up any OKX.AI listing by agent ID, service name, or keyword — free, from the same index below.
        To run fresh checks on the default set instead, <Link href="/probe" className="text-[var(--accent)] hover:underline">use the free probe</Link>.
      </p>
      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void runLookup();
        }}
      >
        <label htmlFor="service-lookup-input" className="sr-only">
          Agent ID, service name, or keyword
        </label>
        <input
          id="service-lookup-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Try "2023", "token security", or a service URL'
          spellCheck={false}
          autoComplete="off"
          className="min-h-11 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Looking up…" : "Look up"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {result && verdict && (
        <div className="mt-4 border-t border-[var(--border)] pt-4" aria-live="polite">
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: verdict.color }}>
            <PixelIcon name={verdict.icon} size={12} />
            {verdict.label}
          </p>
          {primary ? (
            <div className="mt-3">
              <p className="text-sm font-semibold">
                {primary.agentName} — {primary.serviceName}{" "}
                {primary.score !== null && (
                  <span className={`font-display tabular-nums ${scoreTextClass(primary.score)}`}>
                    {primary.score}/100
                  </span>
                )}
              </p>
              <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                {primary.status} · ${primary.feeUsd}/call · {primary.endpoint}
              </p>
              <ul className="mt-3 flex flex-col gap-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
                {result.keyFindings.map((f, i) => (
                  <li key={i}>— {f}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-[var(--text)]">{result.nextStep}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                {primary.pageUrl && (
                  <Link href={primary.pageUrl.replace(/^https?:\/\/[^/]+/, "")} className="text-[var(--accent)] hover:underline">
                    Open service page →
                  </Link>
                )}
                <Link href="/probe" className="text-[var(--accent)] hover:underline">
                  Run a free probe instead →
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
              {result.keyFindings.map((f, i) => (
                <p key={i}>— {f}</p>
              ))}
              <p className="mt-2 text-[var(--text)]">{result.nextStep}</p>
            </div>
          )}
          {result.alternatives.length > 0 && (
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Healthier alternatives</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-xs text-[var(--text-muted)]">
                {result.alternatives.slice(0, 3).map((a, i) => (
                  <li key={`${a.agentId}-${i}`}>
                    {a.serviceId ? (
                      <Link href={`/probe/marketplace/${a.serviceId}`} className="text-[var(--accent)] hover:underline">
                        {a.serviceName || a.agentName}
                      </Link>
                    ) : (
                      <span className="text-[var(--text)]">{a.serviceName || a.agentName}</span>
                    )}{" "}
                    {a.score !== null && a.score !== undefined ? `${a.score}/100` : "not scored"} · {a.status} · ${a.feeUsd}/call
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
