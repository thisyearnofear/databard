import type { EarnEdition } from "./superteam-earn";

export function reportEvidence(edition: EarnEdition) {
  const comparison = edition.focus.isChapter ? edition.chapters : edition.sponsors;
  const leaders = comparison.slice(0, 5);
  const focusRow = comparison.find((row) => row.name === edition.focus.name);
  const comparisons = focusRow && !leaders.some((row) => row.name === focusRow.name) ? [...leaders, focusRow] : leaders;
  return {
    focusName: edition.focus.name, isChapter: edition.focus.isChapter,
    listings: edition.focus.listings, usdRewards: edition.focus.usdRewards,
    observedAt: edition.observedAt, source: edition.source,
    race: edition.race, comparisons, receipt: edition.receipt,
  };
}

export type ReportEvidenceData = ReturnType<typeof reportEvidence>;
