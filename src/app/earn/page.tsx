import type { Metadata } from "next";
import Link from "next/link";
import { loadEarnListings } from "@/lib/superteam-earn";
import { listPublished, slugifySponsor } from "@/lib/editions";
import { editionPricePusd } from "@/lib/pusd";
import { DitherAvatar } from "@/components/dither-kit";
import { SponsorSearch } from "@/components/editions/SponsorSearch";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Find your organization — DataBard reports",
  description:
    "Preview a report for any organization on Superteam Earn — listings, rewards, submissions and the chapter race — then publish a dated edition when it matters.",
};

interface SponsorRow {
  name: string;
  listings: number;
  usdRewards: number;
  submissions: number;
}

function summarize(listings: Awaited<ReturnType<typeof loadEarnListings>>["listings"]): SponsorRow[] {
  const acc = new Map<string, SponsorRow>();
  for (const l of listings) {
    const name = l.sponsor?.name?.trim();
    if (!name) continue;
    const row = acc.get(name) ?? { name, listings: 0, usdRewards: 0, submissions: 0 };
    row.listings += 1;
    if (l.token && ["USDC", "USDG", "USDT", "USD"].includes(l.token.toUpperCase())) {
      row.usdRewards += l.rewardAmount ?? 0;
    }
    row.submissions += l._count?.Submission ?? 0;
    acc.set(name, row);
  }
  return [...acc.values()].sort((a, b) => b.listings - a.listings || b.usdRewards - a.usdRewards);
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EarnIndexPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialQuery = typeof params.q === "string" ? params.q : "";

  let sponsors: ReturnType<typeof summarize> = [];
  let source: string | null = null;
  let observedAt: string | null = null;
  let loadError = false;
  try {
    const loaded = await loadEarnListings();
    sponsors = summarize(loaded.listings);
    source = loaded.source;
    observedAt = loaded.observedAt;
  } catch {
    loadError = true;
  }
  const published = listPublished();
  const price = editionPricePusd();

  return (
    <main className="report-surface enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10" id="main-content">
      <div className="max-w-[720px] mx-auto">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
          Public reports
        </p>
        <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-tight mt-2">
          Find your organization
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
          Preview a report built from public Superteam Earn listings. No wallet needed. Publish a
          dated edition for {"$"}{price}, one-time.
        </p>
        <hr className="dither-rule mt-6" aria-hidden="true" />

        {published.length > 0 && (
          <section className="mt-8" aria-labelledby="published-title">
            <h2 id="published-title" className="text-sm font-semibold">
              Published reports
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {published.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/earn/${p.slug}`}
                    className="flex items-center gap-3 border border-[var(--palm)]/40 bg-[var(--palm)]/10 px-4 py-3 no-underline hover:brightness-110"
                  >
                    <DitherAvatar name={p.sponsor} size={26} className="rounded-md shrink-0" />
                    <span className="flex-1 text-sm font-medium">{p.sponsor}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--palm-light)]">
                      published {new Date(p.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8" aria-labelledby="picker-title">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 id="picker-title" className="text-sm font-semibold">
              Public listings directory
            </h2>
            {source && (
              <p className="font-mono text-xs text-[var(--text-muted)]">
                {source === "snapshot" ? "Snapshot data" : "Public source"}
                {observedAt
                  ? ` · observed ${new Date(observedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
                  : ""}
              </p>
            )}
          </div>
          {loadError ? (
            <p className="border border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-sm leading-relaxed text-[var(--text-muted)]">
              The public listings directory could not be loaded right now.{" "}
              <Link href="/earn" className="text-[var(--accent)] hover:underline">
                Try again
              </Link>
              .
            </p>
          ) : (
            <SponsorSearch
              sponsors={sponsors.map((row) => ({ ...row, slug: slugifySponsor(row.name) }))}
              initialQuery={initialQuery}
            />
          )}
        </section>

        <p className="mt-8 text-[11px] leading-relaxed text-[var(--text-muted)]">
          Previews compute from Earn&apos;s public listings and move as new listings close.
          Publishing preserves the report computed at publication together with the evidence receipt
          — the page then shows exactly what was paid for.
        </p>
      </div>
    </main>
  );
}
