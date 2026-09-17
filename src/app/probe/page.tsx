"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ResultCard, type ProbeResultCardProps } from "@/components/probe/ResultCard";

interface ProbeCost {
  priceUsd: string;
  outboundSpentUsd: number;
  outboundCapUsd: number;
  cachedCount: number;
  paidCount: number;
}

interface ProbeAttestation {
  requested: boolean;
  txHash: string | null;
  error: string | null;
}

interface ProbeResponse {
  ok: boolean;
  tool: string;
  preview?: boolean;
  generatedAt: string;
  question?: string;
  summary: string;
  cost?: ProbeCost;
  attestation?: ProbeAttestation;
  ranked: ProbeResultCardProps[];
}

type RunMode = "idle" | "preview" | "paid-check";

export default function ProbePage() {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<RunMode>("idle");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProbeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentRequired, setPaymentRequired] = useState<string | null>(null);
  const [show402, setShow402] = useState(false);

  const runPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setPaymentRequired(null);
    setShow402(false);
    setMode("preview");
    try {
      const res = await fetch("/api/probe/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(question ? { question } : {}),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Preview failed");
      } else {
        setResult(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
      setMode("idle");
    }
  }, [question]);

  const checkPaidEndpoint = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setPaymentRequired(null);
    setShow402(false);
    setMode("paid-check");
    try {
      const res = await fetch("/api/agent/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(question ? { question } : {}),
      });
      if (res.status === 402) {
        const challenge = res.headers.get("payment-required");
        if (challenge) {
          try {
            const decoded = JSON.parse(atob(challenge));
            setPaymentRequired(
              JSON.stringify(decoded, null, 2)
            );
          } catch {
            setPaymentRequired(challenge.slice(0, 300));
          }
        }
        setShow402(true);
      } else {
        const json = await res.json();
        if (!json.ok) setError(json.error ?? "Probe failed");
        else setResult(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
      setMode("idle");
    }
  }, [question]);

  const loadingText =
    mode === "preview" ? "Probing free candidates…" : "Checking paid endpoint…";

  return (
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 gap-8 max-w-4xl mx-auto">
      <div className="w-full">
        <Link
          href="/"
          className="inline-flex items-center py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          ← Back to DataBard
        </Link>
      </div>

      {/* Hero */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight font-display">
          DataBard Probe
        </h1>
        <p className="text-[var(--text-muted)] max-w-2xl mx-auto text-lg">
          Before an agent pays another agent, ask DataBard. We probe A2MCP
          services, score their quality, and can anchor the verdict on-chain.
        </p>
      </div>

      {/* How it works */}
      <section className="w-full grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="font-semibold">1. Ask</p>
          <p className="mt-1 text-[var(--text-muted)]">
            An agent sends a question and optional candidate endpoints.
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="font-semibold">2. Probe</p>
          <p className="mt-1 text-[var(--text-muted)]">
            DataBard calls each service, pays x402 fees when needed (capped at
            $0.50), and measures schema, latency, freshness, price-value,
            reliability, and credentials.
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="font-semibold">3. Verdict</p>
          <p className="mt-1 text-[var(--text-muted)]">
            You get a ranked verdict. Optionally, the hash is written to X
            Layer as an attestation.
          </p>
        </div>
      </section>

      {/* Input */}
      <div className="w-full max-w-2xl space-y-4">
        <label
          htmlFor="probe-question"
          className="block text-sm font-medium text-[var(--text-muted)]"
        >
          What are you trying to do?
        </label>
        <input
          id="probe-question"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. I need a reliable on-chain token-price feed"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={runPreview}
            disabled={loading}
            className="flex-1 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50 hover:opacity-90"
          >
            {loading && mode === "preview" ? loadingText : "Run free preview"}
          </button>
          <button
            onClick={checkPaidEndpoint}
            disabled={loading}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-3 text-sm font-semibold text-[var(--text)] transition-opacity disabled:opacity-50 hover:bg-[var(--bg)]"
          >
            {loading && mode === "paid-check"
              ? loadingText
              : "Check paid agent endpoint"}
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Free preview probes only the default candidate set without paying any
          outbound fees. The full paid endpoint costs $1.00 via x402 and is
          designed for agent-to-agent calls.
        </p>
      </div>

      {/* 402 explanation */}
      {show402 && (
        <section className="w-full max-w-2xl rounded-lg border border-[var(--warning, #eab308)] bg-[var(--surface)] p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--warning, #eab308)]">
            402 Payment Required — this is working as designed
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            The endpoint is live and gated by x402. An agent would read the
            PAYMENT-REQUIRED header, sign a USDT0 payment on X Layer, and retry
            with the PAYMENT-SIGNATURE header. Browsers can&apos;t sign that
            payment automatically, so this page offers the free preview above.
          </p>
          {paymentRequired && (
            <details className="text-xs">
              <summary className="cursor-pointer text-[var(--text-muted)]">
                View decoded challenge
              </summary>
              <pre className="mt-2 overflow-x-auto rounded border border-[var(--border)] bg-[var(--bg)] p-3 text-[10px] leading-relaxed">
                {paymentRequired}
              </pre>
            </details>
          )}
        </section>
      )}

      {/* Error */}
      {error && (
        <div className="w-full max-w-2xl rounded-lg border border-[var(--danger)] bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <section className="w-full space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2">
            <p className="text-sm text-[var(--text)]">{result.summary}</p>
            {result.cost && (
              <p className="text-xs text-[var(--text-muted)]">
                Cost: {result.cost.priceUsd} · outbound spent $
                {result.cost.outboundSpentUsd.toFixed(4)} / cap $
                {result.cost.outboundCapUsd.toFixed(2)} · paid:{" "}
                {result.cost.paidCount} · cached: {result.cost.cachedCount}
              </p>
            )}
            {result.attestation?.txHash && (
              <a
                href={`https://www.oklink.com/xlayer/tx/${result.attestation.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-mono text-[11px] text-[var(--accent)] underline underline-offset-2"
              >
                Attestation on X Layer → {result.attestation.txHash.slice(0, 14)}…
              </a>
            )}
            {result.attestation?.error && (
              <p className="text-xs text-[var(--danger)]">
                Attestation: {result.attestation.error}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {result.ranked.map((r) => (
              <ResultCard key={r.endpoint} {...r} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
