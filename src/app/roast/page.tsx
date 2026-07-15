"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useWizard } from "@/components/wizard";
import { track } from "@/lib/track";

export default function RoastPage() {
  const { dispatch } = useWizard();

  useEffect(() => {
    track("roast_page_view", {});
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 gap-8 max-w-2xl mx-auto enter-up">
      <div className="w-full">
        <Link href="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">← Back to DataBard</Link>
      </div>

      {/* Hero */}
      <div className="text-center space-y-4 animate-fade-in">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Let AI roast your data quality 🔥
        </h1>
        <p className="text-[var(--text-muted)] max-w-lg mx-auto">
          Connect your database, warehouse, or catalog. Two AI hosts will analyze it live — calling out failing tests, missing docs, PII exposure, and stale pipelines. No mercy.
        </p>
      </div>

      {/* Sample roast quotes */}
      <div className="w-full space-y-3">
        <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium text-center">Real things Morgan has said about real databases:</p>
        {[
          { quote: "Test coverage at 23%? What are you testing — your luck?", severity: "bad" },
          { quote: "The customers table has PII columns with no owner. Who's responsible for this data — the intern?", severity: "bad" },
          { quote: "events hasn't been updated in 36 hours. Are the pipelines running, or did someone forget to pay the AWS bill?", severity: "medium" },
          { quote: "Health score 58 out of 100. I've seen spreadsheets with better governance.", severity: "bad" },
        ].map((item, i) => (
          <div
            key={i}
            className={`rounded-xl p-4 border ${
              item.severity === "bad"
                ? "border-[var(--danger)]/30 bg-[var(--danger)]/5"
                : "border-yellow-500/30 bg-yellow-500/5"
            }`}
          >
            <p className="text-sm italic">"{item.quote}"</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">— Morgan, the quality auditor</p>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-3 w-full max-w-sm">
        <button
          onClick={() => { track("roast_cta_click", { cta: "roast" }); dispatch({ type: "SET_STEP", step: "connect" }); }}
          className="bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-xl px-6 py-3.5 text-base font-bold transition ease-out hover:scale-[1.02]"
        >
          🔥 Roast my data →
        </button>
        <Link
          href="/"
          className="text-center text-sm text-[var(--text-muted)] hover:text-[var(--text)] py-2"
        >
          Or listen to a demo first (no signup)
        </Link>
      </div>

      {/* What you'll get */}
      <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3 hover-depth">
        <h2 className="text-sm font-semibold">What you'll get:</h2>
        <ul className="space-y-2 text-sm text-[var(--text-muted)]">
          <li className="flex items-start gap-2">
            <span>📊</span>
            <span>A health score (0-100) for your data estate</span>
          </li>
          <li className="flex items-start gap-2">
            <span>🎙️</span>
            <span>A 2-minute audio briefing calling out your top 3 issues</span>
          </li>
          <li className="flex items-start gap-2">
            <span>📈</span>
            <span>A dashboard with trend narratives — what changed, why it matters</span>
          </li>
          <li className="flex items-start gap-2">
            <span>🔥</span>
            <span>Morgan's unfiltered assessment (she doesn't hold back)</span>
          </li>
        </ul>
        <p className="text-[10px] text-[var(--text-muted)] pt-2 border-t border-[var(--border)]">
          Works with OpenMetadata, dbt, The Graph, Dune, or any source via Coral SQL. No data leaves your machine.
        </p>
      </div>
    </main>
  );
}
