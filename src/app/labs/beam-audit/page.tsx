import type { Metadata } from "next";
import Link from "next/link";
import { BeamAudit } from "@/components/beam-audit/BeamAudit";
import { PixelIcon } from "@/components/dither-kit/icon";

export const dynamic = "force-dynamic";

const PUBLIC_BASE = (process.env.NEXT_PUBLIC_URL || "https://databard.persidian.com").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Beam audits your database — DataBard Labs",
  description:
    "Paste your DDL. reflection/Beam-1.0-501B-A23B parses it, the production DataBard rubric scores it, and two hosts narrate the findings — with Beam's raw reasoning visible.",
  openGraph: {
    title: "Beam audits your database",
    description:
      "Paste your DDL. Beam 1.0 501B parses it, scores it, and narrates the findings — reasoning visible.",
    url: `${PUBLIC_BASE}/labs/beam-audit`,
  },
};

export default function BeamAuditPage() {
  return (
    <main className="report-surface enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10" id="main-content">
      <div className="max-w-[1080px] mx-auto">
        <Link href="/labs" className="inline-flex items-center py-1.5 font-mono text-xs text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
          ← DataBard Labs
        </Link>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--border)] pb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
          <span>Labs · Beam × Hugging Face contest entry</span>
          <span>Free daily allowance · honest quota</span>
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent)] mt-4 flex items-center gap-2">
          <PixelIcon name="flask" size={12} /> Interactive demo
        </p>
        <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-tight mt-2 font-display">
          Paste your DDL. Beam audits it. Alex &amp; Morgan narrate.
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed max-w-[720px]">
          <a href="https://huggingface.co/reflection/Beam-1.0-501B-A23B" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline underline-offset-2">reflection/Beam-1.0-501B-A23B</a>{" "}
          turns your schema definition into a structured dataset (stage 1), the deterministic DataBard rubric
          scores it (stage 2), and Beam writes a two-host analysis using the exact production prompts (stage 3).
          Beam is a thinking model — its raw reasoning streams into the open panel throughout. Runs on
          Reflection&apos;s free daily allowance; when it&apos;s exhausted, we say so.
        </p>

        <div className="mt-8">
          <BeamAudit />
        </div>

        <section className="mt-10 border-t border-[var(--border)] pt-6 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">The fine print</h2>
          <ul className="mt-3 space-y-1.5 list-disc pl-5">
            <li>Featured datasets are DataBard&apos;s labelled demo schemas (a Uniswap V3 subgraph, an e-commerce warehouse); their audio briefings are pre-recorded production episodes.</li>
            <li>Health scores come from the production rubric — the LLM cannot flatter them.</li>
            <li>This same workload, graded over 24 runs, is published at <Link href="/benchmarks/beam" className="text-[var(--accent)] hover:underline">/benchmarks/beam</Link>, with the measured dataset on <a href="https://huggingface.co/datasets/Papajams/agent-service-quality" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">Hugging Face</a>.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
