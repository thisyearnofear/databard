import type { Metadata } from "next";
import Link from "next/link";
import { loadEarnListings } from "@/lib/superteam-earn";
import { listPublished, slugifySponsor } from "@/lib/editions";
import { editionPricePusd } from "@/lib/pusd";
import { DitherAvatar } from "@/components/dither-kit";
import { homeHref } from "@/lib/product/workspaces";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Commission an Earn accounting — DataBard",
  description:
    "Pick any sponsor on Superteam Earn and publish a pinned, attested accounting page — listings, rewards, submissions, the chapter race — paid in Palm USD.",
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

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default async function EarnIndexPage() {
  const [{ listings, source }, published] = await Promise.all([
    loadEarnListings(),
    Promise.resolve(listPublished()),
  ]);
  const sponsors = summarize(listings);
  const price = editionPricePusd();

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
          Commission an edition
        </p>
        <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-tight mt-2">
          Your sponsor, accounted for
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
          Every sponsor on Superteam Earn gets a free live preview — the same accounting we ran for{" "}
          <Link href="/superteam" className="text-[var(--accent)] hover:underline">Superteam UK</Link>.
          Pay {price} PUSD to publish it: a pinned snapshot, an evidence receipt, a shareable OG
          card, and a permalink that is yours.
        </p>

        {published.length > 0 && (
          <section className="mt-8" aria-labelledby="published-title">
            <h2 id="published-title" className="text-sm font-semibold">
              Published editions
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
              Pick a sponsor — preview is free
            </h2>
            <p className="font-mono text-xs text-[var(--text-muted)]">
              {sponsors.length} sponsors{source === "snapshot" ? " · snapshot" : ""}
            </p>
          </div>
          <ol className="flex flex-col gap-2">
            {sponsors.map((row) => (
              <li key={row.name}>
                <Link
                  href={`/earn/${slugifySponsor(row.name)}`}
                  className="flex items-center gap-3 border border-[var(--border)] bg-[var(--surface)] px-4 py-3 no-underline hover:border-[var(--accent)]/50 transition-colors"
                >
                  <DitherAvatar name={row.name} size={26} className="rounded-md shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.name}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {row.listings} listings · {row.submissions.toLocaleString("en-US")} submissions
                    </p>
                  </div>
                  <span className="font-mono text-sm tabular-nums shrink-0">
                    {fmtUsd(row.usdRewards)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-8 text-[11px] leading-relaxed text-[var(--text-muted)]">
          Previews compute live from Earn&apos;s public listings API and move as new listings close.
          Publishing pins the numbers to the payment moment and issues the evidence receipt — the
          page then shows exactly what was paid for.
        </p>
      </div>
    </main>
  );
}
