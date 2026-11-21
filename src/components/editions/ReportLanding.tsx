import Link from "next/link";
import { Suspense } from "react";
import { loadEarnListings } from "@/lib/superteam-earn";
import { buildReportExamples } from "@/lib/report-examples";
import { buildEarnSeries, seedFromString } from "@/lib/dither-field";
import { ReportLink } from "./ReportLink";
import { ReportExampleSwitcher } from "./ReportExampleSwitcher";
import { EarnReportSearch } from "./EarnReportSearch";
import { DitherField } from "./DitherField";

/** Load the dataset once and derive the deterministic landscape arguments. */
async function loadLandscapeArgs() {
  const loaded = await loadEarnListings();
  const series = buildEarnSeries(loaded.listings, new Date());
  if (series.every((v) => v === 0)) return null;
  return { series, seed: seedFromString(`${loaded.observedAt}:${series.join(",")}`) };
}

/** The hero landscape: grown from the live dataset, identical for the same data. */
async function HeroLandscape() {
  try {
    const args = await loadLandscapeArgs();
    if (!args) return null;
    return <DitherField series={args.series} seed={args.seed} className="h-full w-full" />;
  } catch {
    return null;
  }
}

async function ReportExample() {
  try {
    const loaded = await loadEarnListings();
    const examples = buildReportExamples(loaded, new Date().toISOString());
    if (examples.length) return <ReportExampleSwitcher examples={examples} />;
  } catch {}
  return (
    <article aria-label="Example report" className="enter-up paper-doc l-brackets rounded-2xl p-6 sm:p-10">
      <p className="text-sm text-[var(--paper-muted)]">The example report is temporarily unavailable.</p>
      <Link href="/superteam" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-[var(--paper-accent)] hover:underline">Read the full report →</Link>
    </article>
  );
}

export function ReportLanding() {
  return (
    <main className="report-surface relative bg-[var(--bg)]" id="main-content">
      <div className="mx-auto max-w-[1160px] px-5">

        {/* Registry line */}
        <div className="border-b border-[var(--border)] py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
          <span>Superteam Earn · Public reports</span>
        </div>

        {/* Hero — find a report beside a real example */}
        <section className="relative isolate overflow-hidden py-14 md:py-20">
          <div
            className="pointer-events-none absolute inset-0 opacity-40 sm:opacity-100 [mask-image:linear-gradient(to_right,transparent_0%,black_48%)]"
            aria-hidden="true"
          >
            <Suspense fallback={null}>
              <HeroLandscape />
            </Suspense>
          </div>
          <div className="relative grid gap-10 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-center">
            <div className="min-w-0">
              <h1 className="enter-up mt-4 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
                Find your organization’s report
              </h1>
              <p className="enter-up enter-delay-2 mt-6 max-w-[42ch] text-base leading-relaxed text-[var(--text-muted)] md:text-lg">
                Explore listings, rewards and builder submissions on Superteam Earn.
              </p>
              <div className="enter-up enter-delay-3 mt-8">
                <EarnReportSearch />
                <p className="mt-3">
                  <ReportLink href="/earn" cta="reports" className="inline-flex min-h-11 items-center text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
                    Browse all reports →
                  </ReportLink>
                </p>
              </div>
            </div>

            <div id="filings" className="paper-stage scroll-mt-24">
              <div className="paper-stack">
                <Suspense
                  fallback={
                    <article aria-label="Example report" aria-busy="true" className="enter-up paper-doc l-brackets rounded-2xl p-6 sm:p-10">
                      <p className="text-sm text-[var(--paper-muted)]">Loading the example report…</p>
                      <Link href="/superteam" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-[var(--paper-accent)] hover:underline">Read the full report →</Link>
                    </article>
                  }
                >
                  <ReportExample />
                </Suspense>
              </div>
            </div>
          </div>
        </section>

        {/* Connect your data — compact footer nav, kept for deep links */}
        <nav aria-label="Connect your data" id="divisions" className="scroll-mt-24 border-t border-[var(--border)] py-6">
          <ul className="flex flex-wrap gap-x-8 gap-y-3">
            <li>
              <ReportLink href="/?start=connect&workspace=teams" cta="own_data" className="inline-flex min-h-11 items-center text-sm text-[var(--text-muted)] hover:text-[var(--accent)]">
                Your warehouse →
              </ReportLink>
            </li>
            <li>
              <ReportLink href="/?start=connect&workspace=protocols" cta="own_data" className="inline-flex min-h-11 items-center text-sm text-[var(--text-muted)] hover:text-[var(--accent)]">
                Your protocol →
              </ReportLink>
            </li>
          </ul>
        </nav>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] py-8 text-xs text-[var(--text-muted)]">
          <span>DataBard</span>
          <nav className="flex items-center gap-4" aria-label="Footer">
            <Link href="/privacy" className="hover:text-[var(--text)]">Privacy</Link>
            <Link href="/terms" className="hover:text-[var(--text)]">Terms</Link>
            <a href="https://github.com/thisyearnofear/databard" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text)]">GitHub</a>
          </nav>
        </footer>
      </div>
    </main>
  );
}
