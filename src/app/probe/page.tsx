"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ResultCard, type ProbeResultCardProps } from "@/components/probe/ResultCard";
import { ProbeRun, type ProbeRunDone } from "@/components/probe/ProbeRun";
import { AttestedRunPanel } from "@/components/probe/AttestedRunPanel";

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

export default function ProbePage() {
  const [question, setQuestion] = useState("");
  const [runId, setRunId] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ProbeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentRequired, setPaymentRequired] = useState<string | null>(null);
  const [show402, setShow402] = useState(false);
  const [checking402, setChecking402] = useState(false);
  const request = useRef<AbortController | null>(null);
  const reduce = useReducedMotion();
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  function startPreview() {
    if (running) return;
    setError(null);
    setResult(null);
    setShow402(false);
    setRunning(true);
    setRunId((id) => id + 1);
  }

  function handleRunDone(payload: ProbeRunDone | null, failure: string | null) {
    setRunning(false);
    if (failure) {
      setError(failure);
      return;
    }
    if (payload) {
      setResult({
        ok: true,
        tool: "databard.probe",
        preview: true,
        generatedAt: payload.generatedAt,
        question: question.trim() || undefined,
        summary: payload.summary,
        cost: payload.cost,
        ranked: payload.ranked,
      });
    }
  }

  async function checkPaidEndpoint() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    setChecking402(true);
    setError(null);
    setShow402(false);
    setPaymentRequired(null);
    try {
      const response = await fetch("/api/agent/probe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(question.trim() ? { question: question.trim() } : {}),
        signal: controller.signal,
      });
      if (request.current !== controller) return;
      if (response.status === 402) {
        const challenge = response.headers.get("payment-required");
        if (challenge) {
          try { setPaymentRequired(JSON.stringify(JSON.parse(atob(challenge)), null, 2)); }
          catch { setPaymentRequired(challenge.slice(0, 300)); }
        }
        setShow402(true);
        return;
      }
      const data = await response.json();
      if (request.current !== controller) return;
      setError(data?.error ?? "The service check could not be completed. Try again; no payment was authorized.");
    } catch (failure) {
      if (request.current !== controller) return;
      setError(controller.signal.aborted ? "The service check timed out. Try again; no payment was authorized." : failure instanceof Error ? failure.message : "The service check could not be completed.");
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setChecking402(false); }
    }
  }

  return (
    <main className="report-surface min-h-screen bg-[var(--bg)] px-5 py-12 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <Link href="/agents" className="inline-flex min-h-11 items-center text-sm text-[var(--text-muted)] hover:text-[var(--text)]">← Agent tools</Link>

        {/* Hero */}
        <div className="mt-6 max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">DataBard Probe</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Check a service before you pay.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--text-muted)]">Compare response quality across our default service set. The free preview makes no payments and cannot inspect paid-only responses.</p>
          <p className="mt-4 text-sm">
            <Link href="/probe/marketplace" className="text-[var(--accent)] hover:underline">
              Browse the OKX.AI marketplace health index →
            </Link>
          </p>
        </div>

        {/* How it works */}
        <ol className="mt-10 grid gap-5 border-y border-[var(--border)] py-6 text-sm sm:grid-cols-3">
          <li><span className="font-mono text-xs text-[var(--accent)]">01</span><h2 className="mt-2 font-semibold">Check what responds</h2><p className="mt-2 leading-relaxed text-[var(--text-muted)]">Call the default services without authorizing payments.</p></li>
          <li><span className="font-mono text-xs text-[var(--accent)]">02</span><h2 className="mt-2 font-semibold">Compare the evidence</h2><p className="mt-2 leading-relaxed text-[var(--text-muted)]">Inspect quality scores, response flags, and pricing information.</p></li>
          <li><span className="font-mono text-xs text-[var(--accent)]">03</span><h2 className="mt-2 font-semibold">Decide with context</h2><p className="mt-2 leading-relaxed text-[var(--text-muted)]">Use the observations as a starting point—not a guarantee of suitability.</p></li>
        </ol>

        {/* Input */}
        <div className="dither-grain mt-10 max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
          <label htmlFor="probe-question" className="block text-sm font-medium">Question for your agent (optional)</label>
          <input id="probe-question" type="text" value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder="What would you like your agent to investigate?" aria-describedby="probe-scope" className="mt-3 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm placeholder:text-[var(--text-muted)]" />
          <p id="probe-scope" className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">This note travels with the result; the free preview runs fresh checks on the same default services. It does not select services or rank them for this question. For a cached verdict on any specific service instead, <Link href="/probe/marketplace" className="text-[var(--accent)] hover:underline">look it up in the index</Link>.</p>
          <button type="button" onClick={startPreview} disabled={running} className="mt-5 min-h-11 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50">{running ? "Comparing services…" : "Compare the example services"}</button>
          <p className="mt-3 text-xs text-[var(--text-muted)]">No wallet · no payment · default candidates only</p>
        </div>

        {/* 402 explanation */}
        <details className="mt-6 max-w-2xl border-y border-[var(--border)] py-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Use the paid agent endpoint</summary>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">Your agent can supply candidate endpoints and request paid responses with a spending cap. This button only checks the payment requirement; it does not authorize a payment.</p>
          <button type="button" onClick={checkPaidEndpoint} disabled={checking402} className="my-4 min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--accent)] disabled:opacity-50">{checking402 ? "Checking…" : "Check paid agent endpoint"}</button>
          {show402 && <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"><h2 className="text-sm font-semibold">This call needs payment authorization</h2><p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">An agent reads the x402 payment requirement, obtains authorization, and retries with a signed payment. The payment details specify USDT0 on X Layer. Nothing has been paid by this check.</p>{paymentRequired && <details className="mt-4"><summary className="cursor-pointer py-3 text-xs">Inspect the payment requirement</summary><pre className="max-h-72 overflow-auto rounded bg-[var(--bg)] p-3 text-xs">{paymentRequired}</pre></details>}</div>}
          <Link href="/api/mcp/tools" className="inline-flex min-h-11 items-center text-sm text-[var(--accent)] hover:underline">Read the input schema →</Link>
        </details>

        {/* Error */}
        {error && <p role="alert" className="mt-6 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4 text-sm text-[var(--danger)]">{error}</p>}

        {/* Live run — staged candidate cards driven by the real probe stream */}
        <ProbeRun question={question} runId={runId} onDone={handleRunDone} />

        {/* Summary — arrives with the stream's "done" event */}
        {result && <motion.section initial={{ opacity: 0.65, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0.08 : 0.24 }} className="mt-6" aria-label="Service comparison summary">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold">What the check found</h2>
            <p role="status" className="mt-3 text-sm leading-relaxed">{result.summary}</p>
            {result.preview && <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">Free preview: a payment challenge confirms reachability, not the quality of a paid response. Cached observations are labeled below.</p>}
            {result.cost && <p className="mt-3 text-xs text-[var(--text-muted)]">Cost: {result.cost.priceUsd} · outbound spent ${result.cost.outboundSpentUsd.toFixed(4)} / cap ${result.cost.outboundCapUsd.toFixed(2)} · paid: {result.cost.paidCount} · cached: {result.cost.cachedCount}</p>}
          </div>
        </motion.section>}

        {/* The recorded attested run — proof of the full money loop */}
        <AttestedRunPanel />
      </div>
    </main>
  );
}
