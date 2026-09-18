"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

interface HealthExample {
  ok: true;
  schemaName?: string;
  summary: string;
  keyFindings?: string[];
  nextStep?: string;
  health?: { score?: number };
  evidenceReceipt?: object;
}

export function AgentHealthDemo() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<HealthExample | null>(null);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "fallback">("idle");
  const [requestText, setRequestText] = useState("");
  const request = useRef<AbortController | null>(null);
  const reduce = useReducedMotion();
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  async function runExample() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setState("loading");
    setError("");
    try {
      const response = await fetch("/api/mcp/health-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demo: true }), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || data?.ok !== true || typeof data.summary !== "string") throw new Error("The example could not be loaded. Try again; no payment is required.");
      if (request.current !== controller) return;
      setResult(data);
      setState("success");
    } catch {
      if (request.current !== controller) return;
      setError(controller.signal.aborted ? "The example took too long. Try again; no payment was made." : "The example could not be loaded. Try again; no payment is required.");
      setState("error");
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) request.current = null;
    }
  }

  async function copyExample() {
    const text = `curl -X POST ${window.location.origin}/api/mcp/health-check -H 'content-type: application/json' -d '{"demo":true}'`;
    setRequestText(text);
    try { await navigator.clipboard.writeText(text); setCopyState("copied"); }
    catch { setCopyState("fallback"); }
  }

  return (
    <section id="try-health-check" aria-labelledby="health-example-title" className="scroll-mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">Try the actual tool</p>
      <h2 id="health-example-title" className="mt-3 text-2xl font-bold">From a check to a next step.</h2>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">Run a real health check on a sample dataset. See the answer your agent receives.</p>
      <p className="mt-4 text-xs text-[var(--text-muted)]">Sample data · no credentials · no payment</p>
      <button type="button" onClick={runExample} disabled={state === "loading"} className="mt-5 min-h-11 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50">
        {state === "loading" ? "Analyzing the sample…" : state === "success" ? "Run the example again" : state === "error" ? "Try the free example again" : "Run a free example"}
      </button>
      {state === "loading" && <p role="status" className="mt-3 text-sm text-[var(--text-muted)]">Waiting for the sample analysis. No paid tools are being called.</p>}
      {error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
      {result && state === "success" && (
        <motion.div initial={{ opacity: 0.65, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0.08 : 0.24 }} className="mt-6 border-t border-[var(--border)] pt-5">
          <p role="status" className="font-mono text-xs text-[var(--accent)]">Demo analysis ready</p>
          <div className="mt-3 flex items-start justify-between gap-4">
            <h3 className="text-base font-semibold">{typeof result.schemaName === "string" ? result.schemaName : "Sample dataset"}</h3>
            {typeof result.health?.score === "number" && Number.isFinite(result.health.score) && <span className="font-display text-2xl font-bold tabular-nums">{result.health.score}<span className="text-xs font-normal text-[var(--text-muted)]"> / 100</span></span>}
          </div>
          <p className="mt-3 text-sm leading-relaxed">{result.summary}</p>
          {Array.isArray(result.keyFindings) && <ul className="mt-4 space-y-2 text-sm text-[var(--text-muted)]">{result.keyFindings.filter((item) => typeof item === "string").map((item, index) => <li key={index}>{item}</li>)}</ul>}
          {typeof result.nextStep === "string" && <div className="mt-5 rounded-lg bg-[var(--accent)]/10 p-4"><p className="text-xs font-semibold text-[var(--accent)]">Recommended next step</p><p className="mt-2 text-sm leading-relaxed">{result.nextStep}</p></div>}
          {result.evidenceReceipt && <p className="mt-4 text-xs text-[var(--text-muted)]">Integrity receipt included. This is not a certification of source accuracy.</p>}
          <button type="button" onClick={copyExample} className="mt-3 min-h-11 text-sm font-medium text-[var(--accent)] hover:underline">{copyState === "copied" ? "Request copied" : "Copy example request"}</button>
          {copyState === "copied" && <span role="status" className="sr-only">Example request copied</span>}
          {copyState === "fallback" && <label className="mt-2 block text-xs text-[var(--text-muted)]">Copy this request manually<textarea readOnly value={requestText} className="mt-2 min-h-28 w-full rounded border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs" /></label>}
          <details className="mt-4 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium">Inspect the response</summary><pre className="max-h-72 overflow-auto rounded-lg bg-[var(--bg)] p-4 text-xs">{JSON.stringify(result, null, 2)}</pre></details>
        </motion.div>
      )}
    </section>
  );
}
