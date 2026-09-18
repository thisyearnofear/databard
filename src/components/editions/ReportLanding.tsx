import Link from "next/link";
import { Suspense } from "react";
import { loadEarnListings } from "@/lib/superteam-earn";
import { buildReportExamples } from "@/lib/report-examples";
import { buildEarnSeries, seedFromString } from "@/lib/dither-field";
import { editionPricePusd } from "@/lib/pusd";
import { ReportLink } from "./ReportLink";
import { ReportExampleSwitcher } from "./ReportExampleSwitcher";
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

/** The horizon band: a full-width read of the same landscape between sections. */
async function DitherBand() {
  try {
    const args = await loadLandscapeArgs();
    if (!args) return null;
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none relative h-40 overflow-hidden border-y border-[var(--border)] md:h-52 [mask-image:linear-gradient(to_right,transparent_0%,black_18%,black_82%,transparent_100%)]"
      >
        <DitherField series={args.series} seed={args.seed + 1} className="h-full w-full" />
      </div>
    );
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
    <article aria-label="Example report" className="paper-doc l-brackets rounded-2xl p-6 sm:p-10">
      <p className="text-sm text-[var(--paper-muted)]">The example report is temporarily unavailable.</p>
      <Link href="/superteam" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-[var(--paper-accent)] hover:underline">Read the full report →</Link>
    </article>
  );
}

export function ReportLanding() {
  const price = editionPricePusd();

  return (
    <main className="report-surface relative bg-[var(--bg)]" id="main-content">
      <div className="mx-auto max-w-[1160px] px-5">

        {/* Registry masthead */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-[var(--border)] py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
          <span>DataBard Registry</span>
          <span className="hidden md:inline">Public accounting for ecosystems</span>
          <span>Earn division · Nº 01</span>
        </div>

        {/* Hero — the original two-column composition, with the filing beside
            the pitch and the data-grown landscape behind it */}
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
            <div>
              <p className="enter-up font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">
                Public accounting · Superteam Earn
              </p>
              <h1 className="enter-up enter-delay-1 mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
                Your data.
                <br />
                A story worth sharing.
              </h1>
              <p className="enter-up enter-delay-2 mt-6 max-w-[42ch] text-base leading-relaxed text-[var(--text-muted)] md:text-lg">
                Public reports for ecosystem teams. Understand the numbers, check the evidence,
                and publish a dated edition that holds up. Start with your organization on
                Superteam Earn.
              </p>
              <div className="enter-up enter-delay-3 mt-8 flex flex-wrap items-center gap-4">
                <ReportLink
                  href="/earn"
                  cta="reports"
                  className="inline-flex items-center whitespace-nowrap rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  Find your organization
                </ReportLink>
                <ReportLink
                  href="/superteam"
                  cta="example"
                  className="inline-flex items-center whitespace-nowrap text-sm font-medium text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  Read an example →
                </ReportLink>
              </div>
              <p className="enter-up enter-delay-4 mt-4 text-xs text-[var(--text-muted)]">
                Free preview. Publish a dated edition for {"$"}{price}, one-time.
              </p>
            </div>

            <div id="filings" className="paper-stage scroll-mt-24">
              <div className="paper-stack">
                <Suspense
                  fallback={
                    <article aria-label="Example report" aria-busy="true" className="paper-doc l-brackets rounded-2xl p-6 sm:p-10">
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
      </div>

      {/* The horizon — the same landscape, read full-width */}
      <Suspense fallback={null}>
        <DitherBand />
      </Suspense>

      <div className="mx-auto max-w-[1160px] px-5">
        {/* The registry index — three divisions, one list */}
        <nav aria-label="Registry divisions" id="divisions" className="scroll-mt-24 py-12">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
            The registry — three divisions
          </p>
          <ol className="border-b border-[var(--border)]">
            {[
              {
                n: "01",
                title: "Public record",
                desc: "Superteam Earn organizations, measured from public listings",
                meta: "Open filings · free to read",
                href: "/earn",
                cta: "reports" as const,
                arrow: "→",
              },
              {
                n: "02",
                title: "Your warehouse",
                desc: "dbt, catalogs and internal data, analyzed on your own sources",
                meta: "dbt · OpenMetadata · DataHub",
                href: "/?start=connect&workspace=teams",
                cta: "own_data" as const,
                arrow: "→",
              },
              {
                n: "03",
                title: "Your protocol",
                desc: "Subgraphs, Dune queries and metered endpoints, same engine",
                meta: "The Graph · Dune · Monid",
                href: "/?start=connect&workspace=protocols",
                cta: "own_data" as const,
                arrow: "→",
              },
            ].map((division) => (
              <li key={division.n}>
                <ReportLink
                  href={division.href}
                  cta={division.cta}
                  className="group flex min-h-11 items-baseline gap-4 border-t border-[var(--border)] py-4 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  <span className="shrink-0 font-mono text-xs text-[var(--accent)]">{division.n}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold transition-colors group-hover:text-[var(--accent)]">
                      {division.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-muted)]">
                      {division.desc}
                    </span>
                  </span>
                  <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)] md:block">
                    {division.meta}
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent)]">
                    {division.arrow}
                  </span>
                </ReportLink>
              </li>
            ))}
          </ol>
        </nav>

        <hr className="dither-rule" aria-hidden="true" />
        <section className="grid gap-8 py-14 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" aria-labelledby="how-title">
          <h2 id="how-title" className="text-2xl font-bold tracking-tight">
            From public data to a published report.
          </h2>
          <div>
            <ol className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  kicker: "Source",
                  title: "Find your organization",
                  body: "Reports are built from Superteam Earn's public listings — the same source anyone can read. Search the directory and open a free preview.",
                },
                {
                  kicker: "Read",
                  title: "Read before you publish",
                  body: "The preview shows the full narrative, charts and methodology for free, computed from the current public dataset. No wallet or payment is needed to read.",
                },
                {
                  kicker: "Publish",
                  title: "Keep a dated edition",
                  body: "Publishing freezes the report computed at that moment and keeps the evidence receipt and payment attribution with it.",
                },
              ].map((step) => (
                <li key={step.title} className="border-t border-[var(--border)] pt-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">{step.kicker}</p>
                  <p className="mt-2 text-sm font-semibold">{step.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-[var(--border)] pt-6">
              <p className="max-w-[52ch] text-sm leading-relaxed">
                Preview free.{" "}
                <span className="font-semibold text-[var(--accent)]">
                  Published edition {"$"}{price} one-time
                </span>{" "}
                — dated, receipted, attributed, retained five years.{" "}
                <span className="text-[var(--text-muted)]">SOL, USDC or PUSD; network fees additional.</span>
              </p>
              <ReportLink
                href="/earn"
                cta="reports"
                className="inline-flex items-center whitespace-nowrap rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                Preview your report
              </ReportLink>
            </div>
          </div>
        </section>

        {/* Agent tools — a contrasting ink panel, a change of pace */}
        <section className="py-14" aria-labelledby="agent-tools-title">
          <div className="dither-grain l-brackets relative grid gap-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">For agents</p>
              <h2 id="agent-tools-title" className="mt-3 text-2xl font-bold tracking-tight">Your agent can use DataBard, too.</h2>
              <p className="mt-4 max-w-[48ch] text-sm leading-relaxed text-[var(--text-muted)]">Check data health, compare services before paying, and inspect the evidence behind an answer.</p>
              <div className="mt-6 flex flex-wrap items-center gap-5">
                <ReportLink href="/agents" cta="agent_tools" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90">Explore agent tools</ReportLink>
                <ReportLink href="/probe" cta="service_check" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)] hover:underline">Try a service check →</ReportLink>
              </div>
            </div>
            <ul className="divide-y divide-[var(--border)] text-sm">
              <li className="py-4"><strong className="font-semibold">Free health checks</strong><p className="mt-1 text-[var(--text-muted)]">A finding and a recommended next step.</p></li>
              <li className="py-4"><strong className="font-semibold">Service comparison</strong><p className="mt-1 text-[var(--text-muted)]">Inspect quality before authorizing a paid call.</p></li>
              <li className="py-4"><strong className="font-semibold">Inspectable receipts</strong><p className="mt-1 text-[var(--text-muted)]">Keep evidence and payment records distinct.</p></li>
            </ul>
          </div>
        </section>

        <hr className="dither-rule" aria-hidden="true" />
        <section className="py-14" aria-labelledby="faq-title">
          <h2 id="faq-title" className="sr-only">Common questions</h2>
          <div className="flex flex-col gap-4">
            <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
              <summary className="cursor-pointer text-sm font-semibold">What does the evidence receipt prove?</summary>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                It lets you check the integrity of the receipt and compare matching report data.
                It does not prove the source data is true. Publishing confirms a payment on
                Solana; it does not anchor the report on-chain.
              </p>
            </details>
            <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
              <summary className="cursor-pointer text-sm font-semibold">Can I use my own dataset?</summary>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                Public report publishing currently supports Superteam Earn organizations. Our
                separate analysis tools support dbt, catalogs, Dune and subgraphs; they do not
                yet produce this same public report.{" "}
                <a href="#divisions" className="text-[var(--accent)] hover:underline">See the division index above</a>.
              </p>
            </details>
            <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
              <summary className="cursor-pointer text-sm font-semibold">Is a published report live?</summary>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                A published report is a frozen, dated edition — it shows the report computed at
                publication. A free preview refreshes from the source cache as new listings close.
              </p>
            </details>
          </div>
        </section>

        <hr className="dither-rule" aria-hidden="true" />
        <footer className="flex flex-wrap items-center justify-between gap-3 py-8 text-xs text-[var(--text-muted)]">
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
