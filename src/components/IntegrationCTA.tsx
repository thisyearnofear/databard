"use client";

import { useState } from "react";
import Link from "next/link";
import { track } from "@/lib/track";

/**
 * IntegrationCTA — direct self-serve replacement for inbound email capture.
 *
 * Instead of "leave your email, we'll be in touch", every high-intent surface
 * offers the three things an agent or human can do right now:
 *   1. Run a labelled demo analysis (free, no credentials)
 *   2. Connect their own source in the wizard
 *   3. Copy a ready-to-run agent curl for the A2MCP health-check
 *
 * Source is tracked via `integration_cta_click` so the funnel stays measurable
 * without storing PII in leads.json.
 */
export function IntegrationCTA({
  source,
  schemaName,
  connectHref = "/?start=connect",
  compact = false,
}: {
  source: string;
  schemaName?: string;
  connectHref?: string;
  compact?: boolean;
}) {
  const [demoState, setDemoState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [demoSummary, setDemoSummary] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function runDemo() {
    if (demoState === "loading" || demoState === "done") return;
    setDemoState("loading");
    track("integration_cta_click", { action: "demo", source });
    try {
      const res = await fetch("/api/mcp/health-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demo: true }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const score = data.health?.score ?? data.score;
        const summary: string = data.summary ?? data.keyFindings?.[0] ?? "Demo analysis ready.";
        setDemoSummary(
          typeof score === "number" ? `Demo health ${score}/100 — ${summary}` : summary,
        );
        setDemoState("done");
      } else {
        setDemoState("error");
      }
    } catch {
      setDemoState("error");
    }
  }

  async function copyCurl() {
    track("integration_cta_click", { action: "copy_curl", source });
    const curl = `curl -X POST ${typeof window !== "undefined" ? window.location.origin : "https://databard.persidian.com"}/api/mcp/health-check -H 'content-type: application/json' -d '{"demo":true}'`;
    try {
      await navigator.clipboard.writeText(curl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — user can read the docs instead */
    }
  }

  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col items-center gap-3"}>
      <div className={compact ? "flex items-center gap-2 flex-wrap" : "flex items-center gap-2 flex-wrap justify-center"}>
        <button
          type="button"
          onClick={runDemo}
          disabled={demoState === "loading"}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0 cursor-pointer"
        >
          {demoState === "loading" ? "Running…" : demoState === "done" ? "✓ Demo ready" : "Run demo analysis →"}
        </button>
        <Link
          href={connectHref}
          onClick={() => track("integration_cta_click", { action: "connect", source })}
          className="text-sm font-medium px-4 py-2 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] transition-colors shrink-0"
        >
          Connect your source →
        </Link>
        <button
          type="button"
          onClick={copyCurl}
          className="text-xs px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors shrink-0 cursor-pointer font-mono"
        >
          {copied ? "✓ Copied" : "Copy agent curl"}
        </button>
      </div>
      {demoState === "done" && demoSummary && (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-md text-center">
          {demoSummary}{" "}
          <Link href="/api/mcp/tools" className="text-[var(--accent)] hover:underline">
            See all agent tools →
          </Link>
        </p>
      )}
      {demoState === "error" && (
        <p className="text-xs text-[var(--danger)]">
          Demo failed — <Link href={connectHref} className="underline">connect a source</Link> or try again.
        </p>
      )}
      {schemaName && demoState === "idle" && (
        <p className="text-[11px] text-[var(--text-muted)]">
          Or run it on <span className="font-mono">{schemaName}</span> via connect — no email needed.
        </p>
      )}
    </div>
  );
}
