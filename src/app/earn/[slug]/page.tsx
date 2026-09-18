import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadEarnEdition, loadEarnListings, sponsorFocus } from "@/lib/superteam-earn";
import { sponsorForSlug } from "@/lib/editions";
import { editionPricePusd } from "@/lib/pusd";
import { SponsorEdition, SponsorEditionShareRow } from "@/components/editions/SponsorEdition";
import { EditionPublish } from "@/components/editions/EditionPublish";
import { homeHref } from "@/lib/product/workspaces";

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
  const title = `${resolved.name} — Earn accounting`;
  const description = `A public accounting of ${resolved.name}'s place in the Superteam Earn economy — listings, rewards, submissions, computed from public data.`;
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

  return (
    <main className="enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10">
      <div className="max-w-[720px] mx-auto">
        <Link
          href="/earn"
          className="inline-flex items-center py-1.5 font-mono text-xs text-[var(--text-muted)] no-underline hover:text-[var(--text)]"
        >
          ← Earn sponsors
        </Link>

        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--accent)] mt-6">
          {published
            ? "Commissioned edition · pinned + attested"
            : edition?.source === "snapshot"
              ? "Live preview · snapshot data"
              : "Live preview · public data"}
        </p>
        <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-tight mt-2">
          {name}, measured
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          {edition
            ? `${edition.totals.listings.toLocaleString("en-US")} listings · ${edition.totals.submissions.toLocaleString("en-US")} submissions · computed from Superteam Earn's public API`
            : `A public accounting of ${name}'s place in the Earn economy.`}
        </p>

        {edition && (
          <div className="mt-5">
            <SponsorEditionShareRow edition={edition} />
          </div>
        )}

        {!published && edition && (
          <div className="mt-5 border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              This is the free live preview — the numbers move as Earn&apos;s API does. Publish it
              to pin this snapshot, issue the evidence receipt, and keep the permalink.
            </p>
            <div className="mt-3">
              <EditionPublish sponsor={name} slug={slug} pricePusd={editionPricePusd()} />
            </div>
          </div>
        )}

        {loadError && <p className="mt-8 text-sm text-[var(--danger)]">{loadError}</p>}

        {edition && <SponsorEdition edition={edition} published={published} />}
      </div>
    </main>
  );
}
