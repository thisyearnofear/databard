"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ResultCard, type ProbeResultCardProps } from "@/components/probe/ResultCard";

interface ProbeResponse {
  ok: boolean;
  tool: string;
  generatedAt: string;
  question?: string;
  summary: string;
  ranked: ProbeResultCardProps[];
}

export default function ProbePage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProbeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runProbe = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/agent/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(question ? { question } : {}),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Probe failed");
      } else {
        setResult(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [question]);

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
        <p className="text-[var(--text-muted)] max-w-xl mx-auto text-lg">
          Before an agent pays another agent, ask DataBard. We probe A2MCP
          services, score their quality, and attest the verdict on-chain.
        </p>
      </div>

      {/* Input */}
      <div className="w-full max-w-2xl space-y-4">
        <label htmlFor="probe-question" className="block text-sm font-medium text-[var(--text-muted)]">
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
        <button
          onClick={runProbe}
          disabled={loading}
          className="w-full rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50 hover:opacity-90"
        >
          {loading ? "Probing…" : "Run Probe"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="w-full max-w-2xl rounded-lg border border-[var(--danger)] bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <section className="w-full space-y-4">
          <p className="text-sm text-[var(--text-muted)]">{result.summary}</p>
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
