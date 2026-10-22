import type { Metadata } from "next";
import Link from "next/link";
import { loadBeamBench, type BenchReport } from "@/lib/beam-bench";
import { getPageviewCount } from "@/lib/pageviews";
import { PixelIcon } from "@/components/dither-kit/icon";
import { scoreTextClass } from "@/lib/product/score-tone";

export const dynamic = "force-dynamic";

const PUBLIC_BASE = (process.env.NEXT_PUBLIC_URL || "https://databard.persidian.com").replace(/\/$/, "");

export async function generateMetadata(): Promise<Metadata> {
  const report = await loadBeamBench();
  const description = report
    ? `We ran Reflection Beam 1.0 501B through DataBard's real synthesis workload — ${report.tasks.length} tasks, scored on JSON validity, shape, and grounding. Full results, nothing curated.`
    : "Benchmarking Reflection Beam 1.0 501B on DataBard's production synthesis workload.";
  return {
    title: "Beam as a data analyst — DataBard Benchmark",
    description,
    openGraph: {
      title: "Beam as a data analyst",
      description,
      url: `${PUBLIC_BASE}/benchmarks/beam`,
    },
    twitter: {
      card: "summary_large_image",
      title: "Beam as a data analyst — DataBard Benchmark",
      description,
    },
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function BeamBenchPage() {
  const [report, views] = await Promise.all([loadBeamBench(), getPageviewCount("/benchmarks/beam")]);

  return (
    <main className="report-surface enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10" id="main-content">
      <div className="max-w-[720px] mx-auto">
        <Link href="/" className="inline-flex items-center py-1.5 font-mono text-xs text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
          ← DataBard
        </Link>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--border)] pb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
          <span>Public accounting — model benchmark</span>
          {views > 0 && <span>{views.toLocaleString("en-US")} reads on record</span>}
          <span>Measured, never crafted</span>
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent)] mt-4 flex items-center gap-2">
          <PixelIcon name="flask" size={12} /> Benchmark · Beam 1.0 501B
        </p>
        <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-tight mt-2 font-display">
          Can an open 501B model do a data analyst&apos;s job?
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
          We ran <a href="https://huggingface.co/reflection/Beam-1.0-501B-A23B" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline underline-offset-2">Reflection Beam 1.0 501B-A23B</a>{" "}
          through DataBard&apos;s actual synthesis workload — the exact production prompts that turn a schema into a
          two-host analysis script — and graded every output the same way our pipeline does. Built for the{" "}
          <a href="https://huggingface.co/reflection/Beam-1.0-501B-A23B" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline underline-offset-2">Beam × Hugging Face</a> build
          contest. Results below are frozen from the harness run; nothing was curated or re-rolled.
        </p>

        {!report ? <NoReport /> : <Report report={report} />}

        <section className="mt-10 border-t border-[var(--border)] pt-6">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">What next</h2>
          <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
            The harness lives in the repo (<code className="font-mono text-xs">scripts/beam-bench.mjs</code>) — rerun it any day against Reflection&apos;s
            free daily allowance and the numbers on this page update. That is the point: a benchmark as a live accounting
            artifact, not a one-off blog post.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 font-mono text-xs">
            <Link href="/agents" className="text-[var(--accent)] no-underline hover:underline">Call DataBard&apos;s own agent tools →</Link>
            <Link href="/probe/verdicts" className="text-[var(--accent)] no-underline hover:underline">Probe verdicts →</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function NoReport() {
  return (
    <div className="mt-8 border border-dashed border-[var(--border)] p-6">
      <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
        <PixelIcon name="clock" size={14} /> No benchmark run published yet
      </p>
      <p className="text-sm text-[var(--text-muted)] mt-2">
        The harness has not written a report on this deployment. Run{" "}
        <code className="font-mono text-xs">npx tsx scripts/beam-bench.mjs</code> locally to generate one.
      </p>
    </div>
  );
}

function Report({ report }: { report: BenchReport }) {
  const modelIds = Object.keys(report.models);
  const failures = report.results.filter((r) => r.ok && r.failMode);
  const errors = report.results.filter((r) => !r.ok);
  const totalReasoning = modelIds.reduce((s, id) => s + (report.summary[id]?.reasoningTokens ?? 0), 0);

  return (
    <>
      {/* Headline numbers */}
      <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {modelIds.map((id) => {
          const agg = report.summary[id];
          if (!agg) return null;
          const meta = report.models[id];
          return (
            <div key={id} className="border border-[var(--border)] p-4 bg-[var(--surface)]">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{meta.label}</h2>
              <p className={`font-display text-[40px] font-extrabold leading-none mt-3 ${scoreTextClass(agg.meanScore * 100)}`}>
                {pct(agg.meanScore)}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] mt-1">mean check score</p>
              <dl className="mt-4 space-y-1 text-xs text-[var(--text-muted)]">
                <div className="flex justify-between"><dt>Runs passed</dt><dd className="font-mono">{agg.ok}/{agg.runs}</dd></div>
                <div className="flex justify-between"><dt>Mean latency</dt><dd className="font-mono">{agg.meanLatencyMs != null ? `${(agg.meanLatencyMs / 1000).toFixed(1)}s` : "—"}</dd></div>
                <div className="flex justify-between"><dt>Output tokens</dt><dd className="font-mono">{agg.tokensOut.toLocaleString("en-US")}</dd></div>
                {meta.thinking && (
                  <div className="flex justify-between"><dt>…of which reasoning</dt><dd className="font-mono">{agg.reasoningTokens.toLocaleString("en-US")}</dd></div>
                )}
              </dl>
            </div>
          );
        })}
      </section>

      {/* Methodology */}
      <section className="mt-10 border-t border-[var(--border)] pt-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] flex items-center gap-2">
          <PixelIcon name="book" size={14} /> Methodology
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-[var(--text-muted)] leading-relaxed">
          <li>
            <strong className="text-[var(--text)] font-medium">Workload:</strong> DataBard&apos;s production synthesis prompts — schema + computed
            health insights in, two-host podcast script or executive summary out. {report.tasks.length} tasks across two
            labelled demo schemas (a Uniswap V3 subgraph and an e-commerce warehouse), podcast and executive formats, with
            and without a research question. {report.config.runsPerTask} run(s) per task per model, temperature 0.8.
          </li>
          <li>
            <strong className="text-[var(--text)] font-medium">Checks per output:</strong> valid JSON array (the pipeline rejects anything else),
            segment count in the format&apos;s range, speakers limited to the two hosts, sane narration length, the computed
            health score actually appears in the script, and — for question tasks — the question gets answered.
          </li>
          <li>
            <strong className="text-[var(--text)] font-medium">Access:</strong> Beam via Reflection&apos;s own API under its free daily allowance
            (no spend). Beam is a thinking model — reasoning tokens count against the output budget, so the harness
            inflates <code className="font-mono text-xs">max_tokens</code> 4× to keep reasoning from starving content.
          </li>
          <li>
            <strong className="text-[var(--text)] font-medium">Run:</strong>{" "}
            <time dateTime={report.generatedAt}>{new Date(report.generatedAt).toUTCString()}</time> · harness{" "}
            <code className="font-mono text-xs">{report.harness}</code>
          </li>
        </ul>
      </section>

      {/* Per-task grid */}
      <section className="mt-10 border-t border-[var(--border)] pt-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] flex items-center gap-2">
          <PixelIcon name="chart" size={14} /> Per-task scores
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">
                <th className="text-left py-2 pr-3 border-b border-[var(--border)]">Task</th>
                {modelIds.map((id) => (
                  <th key={id} className="text-right py-2 px-3 border-b border-[var(--border)]">{id}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.tasks.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 pr-3 border-b border-[var(--border)]">
                    <span className="font-mono">{t.id}</span>
                    {t.researchQuestion && <span className="block text-[var(--text-muted)] text-[11px] mt-0.5">“{t.researchQuestion}”</span>}
                  </td>
                  {modelIds.map((id) => {
                    const agg = report.summary[id]?.perTask[t.id];
                    return (
                      <td key={id} className={`text-right py-2 px-3 border-b border-[var(--border)] font-mono ${agg ? scoreTextClass(agg.meanScore * 100) : "text-[var(--text-muted)]"}`}>
                        {agg ? pct(agg.meanScore) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Findings */}
      <section className="mt-10 border-t border-[var(--border)] pt-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] flex items-center gap-2">
          <PixelIcon name="warning" size={14} /> Findings
        </h2>
        <ul className="mt-3 space-y-3 text-sm text-[var(--text-muted)] leading-relaxed">
          {failures.length > 0 && (
            <li>
              <strong className="text-[var(--text)] font-medium">Shape failures, not gibberish:</strong> {failures.length} of{" "}
              {report.results.length} runs produced parseable JSON with the wrong shape
              {(() => {
                const modes = new Map<string, number>();
                for (const f of failures) modes.set(f.failMode ?? "other", (modes.get(f.failMode ?? "other") ?? 0) + 1);
                return ` (${[...modes.entries()].map(([m, n]) => `${n}× ${m}`).join(", ")})`;
              })()}
              . In production the pipeline would have rejected these and fallen back to templates — the honest, boring
              failure mode, which is exactly what this bench measures.
            </li>
          )}
          {errors.length > 0 && (
            <li>
              <strong className="text-[var(--text)] font-medium">Hard errors:</strong> {errors.length} run(s) errored outright
              {" "}({[...new Set(errors.map((e) => (e.error ?? "unknown").slice(0, 60)))].join("; ")}).
            </li>
          )}
          {totalReasoning > 0 && (
            <li>
              <strong className="text-[var(--text)] font-medium">The reasoning tax is real:</strong>{" "}
              {totalReasoning.toLocaleString("en-US")} of the output tokens were reasoning. Beam&apos;s pitch is
              token-efficient thinking — here reasoning dominated the budget, which is why small{" "}
              <code className="font-mono text-xs">max_tokens</code> values returned empty content until the harness
              inflated the budget.
            </li>
          )}
          <li>
            <strong className="text-[var(--text)] font-medium">Latency:</strong> see the headline cards. The bench measures
            the synthesis call only — no audio generation, no data fetch.
          </li>
        </ul>
      </section>
    </>
  );
}
