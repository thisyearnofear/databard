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
  return {
    title,
    description: edition.headline.line,
    openGraph: {
      title: `DataBard League · ${edition.weekLabel}`,
      description: `${edition.headline.schemaName} is ${edition.headline.score}. ${edition.headline.line}`,
      url: edition.permalink,
      images: [{ url: "/api/og/league", width: 1200, height: 630, alt: "DataBard protocol data-health league" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `DataBard League · ${edition.weekLabel}`,
      description: `${edition.headline.schemaName} is ${edition.headline.score}. ${edition.headline.line}`,
      images: ["/api/og/league"],
    },
  };
}

export default function LeaguePage() {
  return <LeagueBoard />;
}
