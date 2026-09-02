import type { Metadata } from "next";
import { buildLeagueEdition } from "@/lib/league";
import { LeagueBoard } from "@/components/league/LeagueBoard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const edition = buildLeagueEdition();
  const delta =
    edition.headline.change === 0
      ? ""
      : edition.headline.change > 0
        ? ` ↑${edition.headline.change}`
        : ` ↓${Math.abs(edition.headline.change)}`;
  const title = `${edition.headline.schemaName} ${edition.headline.score}${delta} — protocol data health`;
  const asOf = edition.stale
    ? ` Data as of ${new Date(edition.asOf).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })}.`
    : "";
  const socialDescription = `${edition.headline.schemaName} is ${edition.headline.score}. ${edition.headline.line}${asOf}`;
  return {
    title,
    description: edition.headline.line,
    openGraph: {
      title: `DataBard League · ${edition.weekLabel}`,
      description: socialDescription,
      url: edition.permalink,
      images: [{ url: "/api/og/league", width: 1200, height: 630, alt: "DataBard protocol data-health league" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `DataBard League · ${edition.weekLabel}`,
      description: socialDescription,
      images: ["/api/og/league"],
    },
  };
}

export default function LeaguePage() {
  return <LeagueBoard />;
}
