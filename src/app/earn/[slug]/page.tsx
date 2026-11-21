import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadEarnEdition, loadEarnListings, sponsorFocus } from "@/lib/superteam-earn";
import { sponsorForSlug } from "@/lib/editions";
import { editionPricePusd } from "@/lib/pusd";
import { SponsorEdition, SponsorEditionShareRow } from "@/components/editions/SponsorEdition";
import { EditionCheckout } from "@/components/editions/EditionCheckout";
import { PublicationFrame } from "@/components/editions/PublicationFrame";
import { CopyReportLink } from "@/components/editions/CopyReportLink";
import { DitherField } from "@/components/editions/DitherField";
import { focusSeriesFromRace, seedFromString } from "@/lib/dither-field";

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function resolve(slug: string) {
  const { listings } = await loadEarnListings();
  return sponsorForSlug(slug, listings);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolve(slug).catch(() => null);
  if (!resolved) return { title: "Earn edition — DataBard" };
  const title = `${resolved.name} — Earn report`;
  const description = `A public report on ${resolved.name}'s place in the Superteam Earn economy — listings, rewards, submissions, computed from public data.`;
  return {
    title: `${title} · DataBard`,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: `/api/og/earn/${slug}`, width: 1200, height: 630, alt: `${resolved.name} Earn stats` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`/api/og/earn/${slug}`] },
  };
}

export default async function EarnSponsorPage({ params }: PageProps) {
  const { slug } = await params;
  const resolved = await resolve(slug).catch(() => null);
  if (!resolved) notFound();
  // UK is the showcase page — it lives at /superteam, not for sale.
  if (resolved.name === "Superteam UK") redirect("/superteam");

  const { name, published } = resolved;
  const price = editionPricePusd();

  // A published edition renders its pinned snapshot; an open sponsor renders a
  // live preview — the honest label sits under the headline.
  let edition = published?.edition ?? null;
  let loadError: string | null = null;
  if (!edition) {
    try {
      edition = await loadEarnEdition(new Date(), sponsorFocus(name, `/earn/${slug}`));
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Superteam Earn data unavailable";
    }
  }

  // This report's own terrain: its subject's monthly trace, seeded by the
  // receipt hash — a visual fingerprint of this exact dataset. A published
  // edition grows the same landscape, frozen.
  const terrain = edition ? focusSeriesFromRace(edition.race, edition.focus.name) : [];
  const showTerrain = terrain.length >= 2 && terrain.some((v) => v > 0);


  return (
    <main className="report-surface enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10" id="main-content">
      <div className="max-w-6xl mx-auto">
        <Link
          href="/earn"
          className="inline-flex items-center py-1.5 font-mono text-xs text-[var(--text-muted)] no-underline hover:text-[var(--text)]"
        >
          ← All reports
        </Link>

        <p className="mt-6 border-b border-[var(--border)] pb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
          {published
            ? `Published edition · frozen ${new Date(published.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
            : edition
              ? `Free to read · ${edition.source === "snapshot" ? "Snapshot data" : "Public data"} · observed ${new Date(edition.observedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
              : "Free to read"}
        </p>
        <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-tight mt-2">
          {name}, measured
        </h1>
        {edition ? (
          <div className="mt-3 max-w-[62ch]">
            <p className="text-base font-semibold leading-snug sm:text-lg">{edition.headline.claim}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{edition.headline.line}</p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              Stablecoin-denominated rewards; submissions are entries, not unique builders.
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)] mt-2">
            {`A public report on ${name}'s place in the Earn economy.`}
          </p>
        )}
        {!published && edition && (
          <p className="mt-3">
            <a
              href="#publish-report"
              className="inline-flex min-h-11 items-center text-xs font-medium text-[var(--text-muted)] underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--text)]"
            >
              Publish a dated edition · {"$"}{price} ↓
            </a>
          </p>
        )}

        {edition && (
          <div className="mt-5">
            <SponsorEditionShareRow
              edition={edition}
              slug={slug}
              published={Boolean(published)}
            />
          </div>
        )}

        {loadError && <p className="mt-8 text-sm text-[var(--danger)]">{loadError}</p>}

        {edition && showTerrain && (
          <div
            aria-hidden="true"
            className="pointer-events-none relative mt-6 h-32 overflow-hidden rounded-xl border border-[var(--border)] md:h-40 [mask-image:linear-gradient(to_right,transparent_0%,black_15%,black_85%,transparent_100%)]"
          >
            <DitherField
              series={terrain}
              seed={seedFromString(edition.receipt.payloadHash)}
              static={Boolean(published)}
              className="h-full w-full"
            />
          </div>
        )}

        {edition && (
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0">
              <div className="paper-doc rounded-2xl px-5 py-6 sm:px-8 sm:py-8">
                <SponsorEdition edition={edition} published={published} showAcquisition={Boolean(published)} />
              </div>
            </div>
            <aside
              id="publish-report"
              className="self-start lg:sticky lg:top-24 scroll-mt-24 border border-[var(--border)] bg-[var(--surface)] px-5 py-5"
              aria-labelledby="publish-title"
            >
              {published ? (
                <PublicationFrame sponsor={name} stage="published">
                  <h2 id="publish-title" className="text-sm font-semibold">
                    Published edition
                  </h2>
                  <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
                    Published{" "}
                    {new Date(published.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                    {" "}with a confirmed Solana payment. The unsigned evidence receipt contains
                    input and report hashes; matching original data is needed to check them. It
                    does not prove source accuracy or anchor the report on-chain.
                  </p>
                  <Link
                    href="/earn"
                    className="mt-4 inline-flex items-center text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    Find another organization →
                  </Link>
                  <CopyReportLink href={`/earn/${slug}`} />
                </PublicationFrame>
              ) : (
                <>
                  <h2 id="publish-title" className="text-sm font-semibold">
                    Publish a dated edition
                  </h2>
                  <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                    {"$"}{price} <span className="text-xs font-normal text-[var(--text-muted)]">one-time</span>
                  </p>
                  <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
                    Keep the report as it was at publication, with evidence hashes and
                    payment attribution. Retained for five years. Pay with SOL, USDC or
                    PUSD; network fees are extra.
                  </p>
                  <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    A payment receipt on-chain is not evidence of source accuracy.
                  </p>
                  <div className="mt-4">
                    <EditionCheckout sponsor={name} slug={slug} pricePusd={price} />
                  </div>
                </>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
