import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuditOrder } from "@/lib/audit-orders";
import { Gauge } from "@/components/dither-kit";
import { scoreDitherColor, scoreTextClass } from "@/lib/product/score-tone";
import type { AuditReport } from "@/lib/audit-report";
import { BenchmarkSignup } from "@/components/BenchmarkSignup";

export const dynamic = "force-dynamic";

const PUBLIC_BASE = (process.env.NEXT_PUBLIC_URL || "https://databard.persidian.com").replace(/\/$/, "");

export async function generateMetadata({ params }: { params: Promise<{ sessionId: string }> }): Promise<Metadata> {
  const { sessionId } = await params;
  const order = await getAuditOrder(sessionId);
  const report = order?.report as AuditReport | undefined;
  const title = report ? `DataBard Scorecard — ${report.category ?? "data health"}` : "DataBard Audit";
  const description = "A dated, benchmarked verdict on whether the numbers are actually below market.";
  return {
    title,
    description,
    openGraph: { title, description, url: `${PUBLIC_BASE}/audit/report/${sessionId}` },
    twitter: { card: "summary", title, description },
  };
}

const TIER_LABELS: Record<string, string> = {
  snapshot: "Snapshot",
  plus: "Scorecard",
  operator: "Scorecard + Analyst",
};

export default async function AuditReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const order = await getAuditOrder(sessionId);
  if (!order) notFound();
  const report = order.report as AuditReport | undefined;
  const tier = TIER_LABELS[order.sku] ?? order.sku;

  return (
    <main className="report-surface enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10" id="main-content">
      <div className="max-w-[720px] mx-auto">
        <Link href="/roast" className="inline-flex items-center py-1.5 font-mono text-xs text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
          ← Get your own Scorecard
        </Link>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--border)] pb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
          <span>DataBard {tier}</span>
          <span>{report ? `Issued ${report.generatedAt.slice(0, 10)}` : "In progress"}</span>
        </div>

        {!report ? (
          <div className="mt-8 border border-[var(--border)] bg-[var(--surface)] px-5 py-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">Paid · report in progress</p>
            <h1 className="text-xl font-bold mt-2">Your {tier} is being generated</h1>
            <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
              The report lands at the buyer&apos;s email and appears here once delivered. If this link has been shared with you, check back shortly.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-6">
              {report.score !== null && (
                <Gauge
                  value={report.score}
                  color={scoreDitherColor(report.score)}
                  ticks={[50, 80]}
                  bloom="low"
                  valueClassName={scoreTextClass(report.score)}
                  className="w-32"
                />
              )}
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight">
                  {report.category ? `${report.category} — the verdict` : "Data health verdict"}
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Order <span className="font-mono text-xs">{report.orderRef.slice(0, 20)}…</span>
                </p>
              </div>
            </div>

            {report.findings.length > 0 && (
              <section className="mt-8" aria-label="Findings">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">What the data says</h2>
                <ol className="mt-3 flex flex-col gap-2">
                  {report.findings.map((f, i) => (
                    <li key={i} className="border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm leading-relaxed">
                      <span className="font-mono text-[10px] text-[var(--accent)] mr-2">{String(i + 1).padStart(2, "0")}</span>
                      {f}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {report.benchmarks.length > 0 && (
              <section className="mt-8" aria-label="Benchmarks">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Vs the category</h2>
                <ol className="mt-3 flex flex-col gap-2">
                  {report.benchmarks.map((b, i) => (
                    <li key={i} className="border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                      <p className="text-sm font-semibold">{b.metric}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{b.claim}</p>
                      <a href={b.source} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block font-mono text-[11px] text-[var(--accent)] no-underline hover:underline truncate max-w-full">
                        {b.source}
                      </a>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {report.actions.length > 0 && (
              <section className="mt-8" aria-label="Action plan">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">The 3-step plan</h2>
                <ol className="mt-3 flex flex-col gap-2">
                  {report.actions.map((a, i) => (
                    <li key={i} className="flex gap-3 border border-[var(--accent)]/40 bg-[var(--accent)]/5 px-4 py-3 text-sm leading-relaxed">
                      <span className="font-display font-bold text-[var(--accent)]">{i + 1}</span>
                      {a}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {report.caveats.length > 0 && (
              <section className="mt-8" aria-label="Caveats">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Honest limits</h2>
                <ul className="mt-3 flex flex-col gap-1.5">
                  {report.caveats.map((c, i) => (
                    <li key={i} className="text-xs text-[var(--text-muted)]">· {c}</li>
                  ))}
                </ul>
              </section>
            )}

            <div className="mt-10 border-t border-[var(--border)] pt-5">
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Receipted verdict — order <span className="font-mono">{report.orderRef}</span>, generated{" "}
                {new Date(report.generatedAt).toUTCString()}.{" "}
                <Link href="/roast" className="text-[var(--accent)] no-underline hover:underline">Get yours →</Link>
              </p>
              <div className="mt-4 max-w-xs">
                <BenchmarkSignup />
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
