import type { Metadata } from "next";
import Link from "next/link";
import { loadEarnEdition } from "@/lib/superteam-earn";
import { ShareRow } from "@/components/superteam/ShareRow";
import { ChapterRaceChart } from "@/components/superteam/ChapterRaceChart";
import { LeadCapture } from "@/components/LeadCapture";
import { DitherAvatar, PixelIcon } from "@/components/dither-kit";
import { homeHref, workspaceHref } from "@/lib/product/workspaces";

export const revalidate = 3600;

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const edition = await loadEarnEdition();
    const description = `${edition.uk.listings} listings, ${fmtUsd(edition.uk.usdRewards)} in rewards, ${edition.uk.submissions.toLocaleString("en-US")} submissions — Superteam UK's place in the Earn economy, computed from public data.`;
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
    <main className="enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10">
      <div className="max-w-[720px] mx-auto">
        <Link
          href={homeHref("protocols")}
          className="inline-flex items-center py-1.5 font-mono text-xs text-[var(--text-muted)] no-underline hover:text-[var(--text)]"
        >
          ← DataBard
        </Link>

        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--accent)] mt-6">
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
            />
          </div>
        )}

        {loadError && <p className="mt-8 text-sm text-[var(--danger)]">{loadError}</p>}

        {edition && (
          <>
            {/* ── L0 · the decision ─────────────────────────────── */}
            <section
              className="mt-8 border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-5 py-5"
              aria-labelledby="uk-headline"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">
                    The headline
                  </p>
                  <h2 id="uk-headline" className="text-xl font-bold mt-3 leading-snug">
                    {edition.headline.claim}
                  </h2>
                  <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
                    {edition.headline.line}
                  </p>
                </div>
                <DitherAvatar name="Superteam UK" size={44} className="rounded-lg shrink-0 mt-1" />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div>
                  <div className="font-display text-3xl font-bold tabular-nums">{edition.uk.listings}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
                    listings · #{edition.uk.rankByListings} of sponsors
                  </div>
                </div>
                <div>
                  <div className="font-display text-3xl font-bold tabular-nums">
                    {fmtUsd(edition.uk.usdRewards)}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
                    USD rewards · #{edition.uk.rankByRewards} chapter
                  </div>
                </div>
                <div>
                  <div className="font-display text-3xl font-bold tabular-nums">
                    {edition.uk.submissions.toLocaleString("en-US")}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
                    submissions · ~{edition.uk.subsPerListing}/listing
                  </div>
                </div>
              </div>
            </section>

            <div className="mt-6">
              <ChapterRaceChart race={edition.race} />
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
                {edition.uk.liveNow.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] mt-3">
                    No open UK listings past their deadline check right now — the desk restocks often.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {edition.uk.liveNow.map((l) => (
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
                  {edition.uk.biggest.map((l) => (
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
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-4">
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
                    <span className="group-open:hidden">Show all {edition.chapters.length} chapters ↓</span>
                    <span className="hidden group-open:inline">Show fewer ↑</span>
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

              <div className="mt-8 border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                <h2 className="text-sm font-semibold">The wider economy</h2>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <div className="font-display text-2xl font-bold tabular-nums">
                      {edition.totals.listings.toLocaleString("en-US")}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
                      listings tracked
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-2xl font-bold tabular-nums">
                      {edition.totals.submissions.toLocaleString("en-US")}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
                      builder submissions
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-2xl font-bold tabular-nums">
                      {edition.totals.liveNow}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
                      live right now
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-2xl font-bold tabular-nums">
                      {edition.totals.agentAllowed}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
                      agent-eligible
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
                  Agents can watch the whole marketplace — only {edition.totals.agentAllowed} listings
                  let them earn. That asymmetry is the interesting bit.
                </p>
              </div>
            </section>

            <section className="mt-10 border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
              <h2 className="text-sm font-semibold">Want this kind of accounting on your ecosystem?</h2>
              <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
                DataBard turns any data source into a synthesized briefing — scores, narratives,
                shareable artifacts. Leave an email or connect a source.
              </p>
              <div className="mt-4">
                <LeadCapture source="superteam_page" prompt="" buttonText="Request a briefing →" />
              </div>
              <p className="mt-4 text-xs">
                <Link href={workspaceHref("/?start=connect", "protocols")} className="text-[var(--accent)] hover:underline">
                  Or connect your data yourself →
                </Link>
              </p>
            </section>

            <p className="mt-8 text-[11px] leading-relaxed text-[var(--text-muted)]">
              {edition.source === "snapshot"
                ? `Computed from a snapshot of Superteam Earn's public listings API taken ${new Date(edition.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. `
                : "Computed live from Superteam Earn's public listings API. "}
              USD figures cover stablecoin-denominated rewards only (USDC/USDG/USDT); token-denominated
              bounties count as listings, not dollars. The race chart counts each listing by its
              deadline month. Independent computation — not an official Superteam report. If a
              number looks wrong, that is the conversation.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
