import type { Metadata } from "next";
import Link from "next/link";
import { loadEarnEdition } from "@/lib/superteam-earn";
import { editionPricePusd } from "@/lib/pusd";
import { ShareRow } from "@/components/superteam/ShareRow";
import { InlineReportCta } from "@/components/superteam/InlineReportCta";
import { ReportEvidenceExplorer } from "@/components/editions/ReportEvidenceExplorer";
import { reportEvidence } from "@/lib/report-evidence";
import { DitherAvatar, PixelIcon } from "@/components/dither-kit";
import { DitherField } from "@/components/editions/DitherField";
import { focusSeriesFromRace, seedFromString } from "@/lib/dither-field";

export const revalidate = 3600;

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const edition = await loadEarnEdition();
    const description = `${edition.focus.listings} listings, ${fmtUsd(edition.focus.usdRewards)} in rewards, ${edition.focus.submissions.toLocaleString("en-US")} submissions — Superteam UK's place in the Earn economy, computed from public data.`;
    return {
      title: "The Superteam Earn economy, measured — DataBard",
      description,
      openGraph: {
        title: "The Superteam Earn economy, measured",
        description,
        url: edition.permalink,
        images: [{ url: "/api/og/superteam", width: 1200, height: 630, alt: "Superteam Earn economy stats" }],
      },
      twitter: {
        card: "summary_large_image",
        title: "The Superteam Earn economy, measured",
        description,
        images: ["/api/og/superteam"],
      },
    };
  } catch {
    return { title: "Superteam Earn economy — DataBard" };
  }
}

export default async function SuperteamPage() {
  let edition;
  let loadError: string | null = null;
  try {
    edition = await loadEarnEdition();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Superteam Earn data unavailable";
  }

  const maxChapterRewards = edition ? Math.max(...edition.chapters.map((c) => c.usdRewards), 1) : 1;

  return (
    <main className="report-surface enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10" id="main-content">
      <div className="max-w-[720px] mx-auto">
        <Link
          href="/"
          className="inline-flex items-center py-1.5 font-mono text-xs text-[var(--text-muted)] no-underline hover:text-[var(--text)]"
        >
          ← DataBard
        </Link>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--border)] pb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
          <span>DataBard Registry — Earn division</span>
          <span>Flagship accounting · free to read</span>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent)] mt-4">
          {edition?.source === "snapshot" ? "Snapshot edition · public data" : "Live accounting · public data"}
        </p>
        <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-tight mt-2">
          The Superteam Earn economy, measured
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          {edition
            ? `${edition.totals.listings.toLocaleString("en-US")} listings · ${edition.totals.submissions.toLocaleString("en-US")} submissions · computed from Superteam Earn's public API`
            : "A public accounting of the Superteam Earn listings economy."}
        </p>

        {edition && (
          <div className="mt-5">
            <ShareRow
              tweet={edition.tweet}
              linkedin={edition.linkedin}
              email={edition.emailBlurb}
              link={edition.permalink}
              receipt={JSON.stringify(edition.receipt, null, 2)}
            />
          </div>
        )}

        {loadError && <p className="mt-8 text-sm text-[var(--danger)]">{loadError}</p>}

        {edition && (() => {
          const terrain = focusSeriesFromRace(edition.race, edition.focus.name);
          return terrain.some((v) => v > 0) ? (
            <div
              aria-hidden="true"
              className="pointer-events-none relative mt-8 h-32 overflow-hidden rounded-xl border border-[var(--border)] md:h-40 [mask-image:linear-gradient(to_right,transparent_0%,black_15%,black_85%,transparent_100%)]"
            >
              <DitherField
                series={terrain}
                seed={seedFromString(edition.receipt.payloadHash)}
                className="h-full w-full"
              />
            </div>
          ) : null;
        })()}

        {edition && (
          <div className="paper-doc mt-8 rounded-2xl px-5 py-6 sm:px-8 sm:py-8">
            {/* ── L0 · the decision ─────────────────────────────── */}
            <section
              className="mt-0 border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-5 py-5"
              aria-labelledby="uk-headline"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">
                    The headline
                  </p>
                  <h2 id="uk-headline" className="text-xl md:text-2xl font-bold mt-3 leading-snug">
                    {edition.headline.claim}
                  </h2>
                  <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
                    {edition.headline.line}
                  </p>
                </div>
                <DitherAvatar name="Superteam UK" size={44} className="rounded-lg shrink-0 mt-1" />
              </div>
              <div className="mt-5 grid grid-cols-1 min-[420px]:grid-cols-3 gap-3">
                <div>
                  <div className="font-display text-3xl font-bold tabular-nums">{edition.focus.listings}</div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
                    listings · #{edition.focus.rankByListings} of sponsors
                  </div>
                </div>
                <div>
                  <div className="font-display text-3xl font-bold tabular-nums">
                    {fmtUsd(edition.focus.usdRewards)}
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
                    USD rewards · #{edition.focus.rankByRewardsChapters} chapter
                  </div>
                </div>
                <div>
                  <div className="font-display text-3xl font-bold tabular-nums">
                    {edition.focus.submissions.toLocaleString("en-US")}
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
                    submissions · ~{edition.focus.subsPerListing}/listing
                  </div>
                </div>
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
                Counted from listings published under the{" "}
                <span className="font-mono">Superteam UK</span> sponsor account. Campaigns the desk
                co-hosts under another sponsor&apos;s listing are not counted here — so{" "}
              </p>
              <InlineReportCta />
            </section>

            <div className="mt-6">
              <ReportEvidenceExplorer evidence={reportEvidence(edition)} />
            </div>

            {/* ── L1 · the story ────────────────────────────────── */}
            {edition.story.length > 0 && (
              <section className="mt-10" aria-labelledby="story-title">
                <h2 id="story-title" className="text-sm font-semibold flex items-center gap-2">
                  <PixelIcon name="chart" size={14} className="text-[var(--accent)]" />
                  How the UK desk got here
                </h2>
                <ul className="mt-3 flex flex-col gap-3">
                  {edition.story.map((line, i) => (
                    <li
                      key={i}
                      className="border-l-2 border-[var(--accent)]/50 bg-[var(--surface)] px-4 py-3 text-sm leading-relaxed"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-8 grid gap-6 sm:grid-cols-2">
              <div className="border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                <h2 className="text-sm font-semibold">Live from Superteam UK right now</h2>
                {edition.focus.liveNow.length === 0 ? (
                  <div className="mt-3">
                    <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                      Nothing open at this moment. The UK desk publishes in bursts — the streak and
                      the totals above are the better signal.
                    </p>
                    {edition.focus.recent.length > 0 && (
                      <>
                        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-4 mb-2">
                          Most recently closed
                        </p>
                        <ul className="flex flex-col gap-2.5">
                          {edition.focus.recent.map((l) => (
                            <li key={l.url} className="text-xs leading-relaxed">
                              <a
                                href={l.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--accent)] hover:underline"
                              >
                                {l.title}
                              </a>
                              <span className="text-[var(--text-muted)]">
                                {" "}· {l.reward}
                                {l.deadline
                                  ? ` · closed ${new Date(l.deadline).toLocaleDateString("en-GB", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                      timeZone: "UTC",
                                    })}`
                                  : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {edition.focus.liveNow.map((l) => (
                      <li key={l.url} className="text-xs leading-relaxed">
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--accent)] hover:underline"
                        >
                          {l.title}
                        </a>
                        <span className="text-[var(--text-muted)]"> · {l.reward}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                <h2 className="text-sm font-semibold">Biggest UK bounties to date</h2>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {edition.focus.biggest.map((l) => (
                    <li key={l.url} className="text-xs leading-relaxed">
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--text)] hover:text-[var(--accent)]"
                      >
                        {l.title}
                      </a>
                      <span className="text-[var(--text-muted)]"> · {l.reward}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* ── L2 · the evidence ─────────────────────────────── */}
            <section className="mt-12" aria-labelledby="evidence-title">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-4">
                Evidence behind the numbers above
              </p>

              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 id="evidence-title" className="text-sm font-semibold">
                  Chapter league — by USD-denominated rewards
                </h2>
                <p className="font-mono text-xs text-[var(--text-muted)]">
                  {edition.chapters.length} chapters
                </p>
              </div>
              <ol className="flex flex-col gap-2">
                {edition.chapters.slice(0, 8).map((row) => {
                  const isUk = row.name === "Superteam UK";
                  return (
                    <li
                      key={row.name}
                      className={`border px-4 py-3 ${
                        isUk
                          ? "border-[var(--accent)]/50 bg-[var(--accent)]/10"
                          : "border-[var(--border)] bg-[var(--surface)]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-[var(--text-muted)] w-6 shrink-0">
                          {row.rank}
                        </span>
                        <DitherAvatar name={row.name} size={26} className="rounded-md shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {row.name}
                            {isUk && (
                              <span className="ml-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--accent)]">
                                most listings
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            {row.listings} listings · {row.submissions.toLocaleString("en-US")} subs
                            {row.liveNow > 0 ? ` · ${row.liveNow} live` : ""}
                          </p>
                        </div>
                        <span className="font-mono text-sm font-bold tabular-nums shrink-0">
                          {fmtUsd(row.usdRewards)}
                        </span>
                      </div>
                      <div
                        className="mt-2 h-1 rounded-sm bg-[var(--accent)]/25"
                        aria-hidden="true"
                      >
                        <div
                          className={`h-1 rounded-sm ${isUk ? "bg-[var(--accent)]" : "bg-[var(--accent)]/45"}`}
                          style={{ width: `${Math.max(2, (row.usdRewards / maxChapterRewards) * 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>

              {edition.chapters.length > 8 && (
                <details className="mt-3 group">
                  <summary className="cursor-pointer list-none font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                    <span className="inline-flex items-center gap-1 group-open:hidden">Show all {edition.chapters.length} chapters <PixelIcon name="arrowDown" size={9} aria-hidden /></span>
                    <span className="hidden items-center gap-1 group-open:inline-flex">Show fewer <PixelIcon name="arrowUp" size={9} aria-hidden /></span>
                  </summary>
                  <ol className="mt-3 flex flex-col gap-2">
                    {edition.chapters.slice(8).map((row) => (
                      <li
                        key={row.name}
                        className="flex items-center gap-3 border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5"
                      >
                        <span className="font-mono text-xs text-[var(--text-muted)] w-6 shrink-0">
                          {row.rank}
                        </span>
                        <DitherAvatar name={row.name} size={22} className="rounded-md shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{row.name}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            {row.listings} listings · {row.submissions.toLocaleString("en-US")} subs
                          </p>
                        </div>
                        <span className="font-mono text-sm tabular-nums shrink-0">
                          {fmtUsd(row.usdRewards)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              <div className="mt-8 border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                  <span className="font-semibold text-[var(--text)]">
                    {edition.totals.liveNow} listings live right now
                  </span>
                  {" "}across the whole network — but only {edition.totals.agentAllowed} of{" "}
                  {edition.totals.listings.toLocaleString("en-US")} are agent-eligible. Agents can
                  watch the whole marketplace; they can barely earn in it.
                </p>
              </div>
            </section>

            <section
              className="mt-10 border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-5 py-5"
              aria-labelledby="cta-title"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">
                Get one like this
              </p>
              <h2 id="cta-title" className="text-sm font-semibold mt-3">
                Get a report for your organization
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
                Preview free. Publish a dated edition for {"$"}{editionPricePusd()}, one-time.
              </p>
              <Link
                href="/earn"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--bg)] transition hover:brightness-110"
              >
                Find your organization →
              </Link>
              <p className="mt-5 text-xs text-[var(--text-muted)]">
                <Link href="/#divisions" className="text-[var(--accent)] hover:underline">
                  Analyze your own data instead
                </Link>
                {" "}— a separate workflow for supported sources; not this public-report format.
              </p>
            </section>

            <section className="mt-10 border-t-2 border-[var(--border)] pt-6 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                Imprint · databard.evidence-receipt v1
              </p>
              <p className="mt-4 font-mono text-[11px] break-all text-[var(--text)]">
                {edition.receipt.payloadHash}
              </p>
              <p className="mx-auto mt-4 max-w-[64ch] text-[11px] leading-relaxed text-[var(--text-muted)]">
                SHA-256 over the canonical (key-sorted) JSON of these{" "}
                {edition.totals.listings.toLocaleString("en-US")} listings plus the computed result,
                observed {new Date(edition.observedAt).toISOString()}. This unsigned receipt contains
                hashes of the input dataset and report. Matching original data is required to check
                those hashes. It does not authenticate the issuer or prove source accuracy.
              </p>
            </section>

            <p className="mt-8 text-[11px] leading-relaxed text-[var(--text-muted)]">
              {edition.source === "snapshot"
                ? `Computed from a snapshot of Superteam Earn's public listings API taken ${new Date(edition.observedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}. `
                : "Computed live from Superteam Earn's public listings API. "}
              USD figures cover stablecoin-denominated rewards only (USDC/USDG/USDT); token-denominated
              bounties count as listings, not dollars. The race chart buckets each listing by the month
              its deadline fell in — Earn&apos;s API exposes no posted-at date, so that axis measures when
              bounties closed, not when they were announced. Attribution is by sponsor-account name, so
              UK activity run under another sponsor&apos;s listing is not counted here and the UK figures
              are floors, not ceilings. Independent computation — not an official Superteam report. If a
              number looks wrong, that is the conversation.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
