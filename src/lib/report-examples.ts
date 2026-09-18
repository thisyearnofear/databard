import { computeEarnEdition, sponsorFocus, UK_FOCUS, type EarnListingsSnapshot } from "./superteam-earn";

export interface ReportExampleData {
  id: string;
  name: string;
  href: string;
  observedAt: string;
  source: "live" | "snapshot";
  headline: string;
  summary: string;
  listings: number;
  usdRewards: number;
  submissions: number;
  evidenceNote: string;
}

export function buildReportExamples(loaded: EarnListingsSnapshot, requestedAt: string): ReportExampleData[] {
  const choices = [UK_FOCUS, sponsorFocus("Jupiter", "/earn/jupiter"), sponsorFocus("Superteam Nigeria", "/earn/superteam-nigeria")];
  return choices.filter((focus) => loaded.listings.some((listing) => {
    const name = listing.sponsor?.name?.trim() ?? "";
    return name === focus.name || Boolean(focus.match?.test(name));
  })).map((focus) => {
    const edition = computeEarnEdition(loaded.listings, new Date(loaded.observedAt), {
      source: loaded.source, observedAt: loaded.observedAt, requestedAt, focus,
    });
    return {
      id: focus.path, name: edition.focus.name, href: focus.path, observedAt: edition.observedAt,
      source: edition.source, headline: edition.headline.claim, summary: edition.headline.line,
      listings: edition.focus.listings, usdRewards: edition.focus.usdRewards,
      submissions: edition.focus.submissions,
      evidenceNote: "Attributed by sponsor account. Reward totals include stablecoin-denominated listings only.",
    };
  });
}
