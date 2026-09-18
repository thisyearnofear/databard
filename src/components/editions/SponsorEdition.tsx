/**
 * SponsorEdition — the shared view for any Earn-sponsor accounting page.
 *
 * Renders an `EarnEdition` computed by `computeEarnEdition` — the same shape
 * /superteam uses, but with copy that follows the focus sponsor instead of
 * being UK-specific. Used by /earn/[slug] for both live previews and
 * commissioned (pinned) editions.
 */
import Link from "next/link";
import type { EarnEdition } from "@/lib/superteam-earn";
import { ChapterRaceChart } from "@/components/superteam/ChapterRaceChart";
import { ShareRow } from "@/components/superteam/ShareRow";
import { IntegrationCTA } from "@/components/IntegrationCTA";
import { DitherAvatar, PixelIcon } from "@/components/dither-kit";
import { explorerUrl } from "@/lib/settlement/verifier";
import { editionPricePusd } from "@/lib/pusd";
import { workspaceHref } from "@/lib/product/workspaces";
import type { PublishedEdition } from "@/lib/editions";

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

interface SponsorEditionProps {
  edition: EarnEdition;
  /** Present when this render is a published, commissioned edition. */
  published?: PublishedEdition | null;
}

export function SponsorEdition({ edition, published }: SponsorEditionProps) {
  const { focus } = edition;
  const league = focus.isChapter ? edition.chapters : edition.sponsors;
  const leagueLabel = focus.isChapter ? "Chapter league" : "Sponsor league";
  const maxLeagueRewards = Math.max(...league.map((c) => c.usdRewards), 1);
  const rewardRank =
    focus.isChapter && focus.rankByRewardsChapters > 0
      ? `#${focus.rankByRewardsChapters} of ${edition.chapters.length} chapters`
      : `#${focus.rankByRewards || "?"} of ${edition.sponsors.length} sponsors`;

  return (
    <>
      {/* ── commissioned attribution ────────────────────────────── */}
      {published && (
        <div className="mt-5 border border-[var(--palm)]/40 bg-[var(--palm)]/10 px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-[var(--palm-light)] shrink-0" aria-hidden="true" />
          <p className="text-xs text-[var(--text-muted)]">
            Commissioned edition · paid {published.pricePusd} PUSD by{" "}
            <span className="font-mono">
              {published.paidBy.slice(0, 4)}…{published.paidBy.slice(-4)}
            </span>{" "}
            · pinned {new Date(published.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
          </p>
          <a
            href={explorerUrl("tx", published.txSignature)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-[var(--palm-light)] hover:underline"
          >
            payment receipt →
          </a>
        </div>
      )}

      {/* ── L0 · the decision ───────────────────────────────────── */}
      <section
        className="mt-8 border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-5 py-5"
        aria-labelledby="focus-headline"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">
              The headline
            </p>
            <h2 id="focus-headline" className="text-xl font-bold mt-3 leading-snug">
              {edition.headline.claim}
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
              {edition.headline.line}
            </p>
          </div>
          <DitherAvatar name={focus.name} size={44} className="rounded-lg shrink-0 mt-1" />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div>
            <div className="font-display text-3xl font-bold tabular-nums">{focus.listings}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
              listings · #{focus.rankByListings} of sponsors
            </div>
          </div>
          <div>
            <div className="font-display text-3xl font-bold tabular-nums">
              {fmtUsd(focus.usdRewards)}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
              USD rewards · {rewardRank}
            </div>
          </div>
          <div>
            <div className="font-display text-3xl font-bold tabular-nums">
              {focus.submissions.toLocaleString("en-US")}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
              submissions · ~{focus.subsPerListing}/listing
            </div>
          </div>
        </div>
        <p className="mt-4 text-[10px] leading-relaxed text-[var(--text-muted)]">
          Counted from listings published under the{" "}
          <span className="font-mono">{focus.name}</span> sponsor account. Campaigns run under
          another sponsor&apos;s listing are not counted here — so {focus.listings} listings is a
          floor on {focus.short} activity, not a ceiling.
        </p>
      </section>

      <div className="mt-6">
        <ChapterRaceChart race={edition.race} focusName={focus.name} />
      </div>

      {/* ── L1 · the story ──────────────────────────────────────── */}
      {edition.story.length > 0 && (
        <section className="mt-10" aria-labelledby="story-title">
          <h2 id="story-title" className="text-sm font-semibold flex items-center gap-2">
            <PixelIcon name="chart" size={14} className="text-[var(--accent)]" />
            How the {focus.short} desk got here
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
          <h2 className="text-sm font-semibold">Live from {focus.name} right now</h2>
          {focus.liveNow.length === 0 ? (
            <div className="mt-3">
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                Nothing open at this moment. {focus.short} publishes in bursts — the streak and
                the totals above are the better signal.
              </p>
              {focus.recent.length > 0 && (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-4 mb-2">
                    Most recently closed
                  </p>
                  <ul className="flex flex-col gap-2.5">
                    {focus.recent.map((l) => (
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
              {focus.liveNow.map((l) => (
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
          <h2 className="text-sm font-semibold">Biggest {focus.short} bounties to date</h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {focus.biggest.map((l) => (
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

      {/* ── L2 · the evidence ───────────────────────────────────── */}
      <section className="mt-12" aria-labelledby="evidence-title">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-4">
          Evidence behind the numbers above
        </p>

        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 id="evidence-title" className="text-sm font-semibold">
            {leagueLabel} — by USD-denominated rewards
          </h2>
          <p className="font-mono text-xs text-[var(--text-muted)]">
            {league.length} {focus.isChapter ? "chapters" : "sponsors"}
          </p>
        </div>
        <ol className="flex flex-col gap-2">
          {league.slice(0, 8).map((row) => {
            const isFocus = row.name === focus.name;
            return (
              <li
                key={row.name}
                className={`border px-4 py-3 ${
                  isFocus
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
                      {isFocus && (
                        <span className="ml-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--accent)]">
                          #{focus.rankByListings} by listings
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
                    className={`h-1 rounded-sm ${isFocus ? "bg-[var(--accent)]" : "bg-[var(--accent)]/45"}`}
                    style={{ width: `${Math.max(2, (row.usdRewards / maxLeagueRewards) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>

        {league.length > 8 && (
          <details className="mt-3 group">
            <summary className="cursor-pointer list-none font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
              <span className="group-open:hidden">Show all {league.length} {focus.isChapter ? "chapters" : "sponsors"} ↓</span>
              <span className="hidden group-open:inline">Show fewer ↑</span>
            </summary>
            <ol className="mt-3 flex flex-col gap-2">
              {league.slice(8).map((row) => (
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
            {edition.totals.listings.toLocaleString("en-US")} are agent-eligible. Agents can watch
            the whole marketplace; they can barely earn in it.
          </p>
        </div>
      </section>

      <section
        className="mt-10 border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-5 py-5"
        aria-labelledby="cta-title"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">
          Get one like this
        </p>
        <h2 id="cta-title" className="text-sm font-semibold mt-3">
          Your sponsor, measured the same way
        </h2>
        <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
          Any Earn sponsor can commission this page — pinned snapshot, evidence receipt, shareable
          OG card, permanent link. One payment, settled on Solana.
        </p>
        <Link
          href="/earn"
          className="mt-4 inline-flex items-center gap-2 rounded bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90"
        >
          Commission an edition — {editionPricePusd()} PUSD →
        </Link>
        <p className="mt-5 text-xs text-[var(--text-muted)]">
          Not on Earn? The same engine runs on your own data:
        </p>
        <div className="mt-3">
          <IntegrationCTA
            source="earn_edition"
            connectHref={workspaceHref("/?start=connect", "protocols")}
            compact
          />
        </div>
      </section>

      <section className="mt-8 border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Evidence receipt · databard.evidence-receipt v1
        </p>
        <p className="mt-3 font-mono text-[11px] break-all text-[var(--text)]">
          {edition.receipt.payloadHash}
        </p>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
          SHA-256 over the canonical (key-sorted) JSON of these{" "}
          {edition.totals.listings.toLocaleString("en-US")} listings plus the computed result,
          observed {new Date(edition.observedAt).toISOString()}. Copy it with the button above
          and check it offline with{" "}
          <span className="font-mono">verifyEvidenceReceipt()</span> from{" "}
          <span className="font-mono">databard.evidence-receipt</span>. It proves these numbers
          correspond to exactly that listing set — it does not authenticate the issuer, and it
          does not make Superteam&apos;s own data true.
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
        {` ${focus.short} `}activity run under another sponsor&apos;s listing is not counted here and
        the figures are floors, not ceilings. This is an independent accounting, not an official
        Superteam report.
      </p>
    </>
  );
}

/** Share row + header stats that both preview and published renders want. */
export function SponsorEditionShareRow({ edition }: { edition: EarnEdition }) {
  return (
    <ShareRow
      tweet={edition.tweet}
      linkedin={edition.linkedin}
      email={edition.emailBlurb}
      link={edition.permalink}
      receipt={JSON.stringify(edition.receipt, null, 2)}
    />
  );
}
