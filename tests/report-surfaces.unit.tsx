import React from "react";
import { it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportExampleSwitcher } from "../src/components/editions/ReportExampleSwitcher";
import { AgentHealthDemo } from "../src/components/agents/AgentHealthDemo";
import { ReportEvidenceExplorer } from "../src/components/editions/ReportEvidenceExplorer";
import { PublicationFrame, publicationStage } from "../src/components/editions/PublicationFrame";
import { createEvidenceReceipt } from "../src/lib/evidence-receipt";
import { reportEvidence } from "../src/lib/report-evidence";
import { computeEarnEdition, sponsorFocus, type EarnListing } from "../src/lib/superteam-earn";

it("renders a real initial report, native selectors and a matching report link", () => {
  const html = renderToStaticMarkup(<ReportExampleSwitcher examples={[{
    id: "jupiter", name: "Jupiter", href: "/earn/jupiter", observedAt: "2026-09-17T00:00:00Z",
    source: "snapshot", headline: "Fixture headline", summary: "Fixture summary",
    listings: 2, usdRewards: 50, submissions: 5, evidenceNote: "Fixture attribution",
  }]} />);
  assert.match(html, /Fixture headline/);
  assert.match(html, /href="\/earn\/jupiter"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Snapshot example/);
  assert.match(html, /Why this finding/);
});

it("the free health example starts with explicit scope and no fabricated results", () => {
  const html = renderToStaticMarkup(<AgentHealthDemo />);
  assert.match(html, /Run a free example/);
  assert.match(html, /Sample data · no credentials · no payment/);
  assert.doesNotMatch(html, /Demo analysis ready|Recommended next step|Integrity receipt included/);
});

it("evidence views retain readable chart data, supplied ranks and integrity caveats", () => {
  const html = renderToStaticMarkup(<ReportEvidenceExplorer evidence={{
    focusName: "Jupiter", isChapter: false, listings: 2, usdRewards: 50,
    observedAt: "2026-09-17T00:00:00Z", source: "snapshot",
    race: { keys: ["Jupiter"], rows: [{ t: "May 26", Jupiter: 1 }, { t: "Jun 26", Jupiter: 2 }] },
    comparisons: [{ rank: 9, name: "Jupiter", listings: 2, usdRewards: 50, submissions: 5, liveNow: 0 }],
    receipt: createEvidenceReceipt({ resultHash: "fixture" }),
  }} />);
  assert.match(html, /Listings over time/);
  assert.match(html, /Rewards in context/);
  assert.match(html, /What is counted/);
  assert.match(html, /May 26/);
  assert.match(html, /Jun 26/);
  assert.match(html, /#9/);
  assert.match(html, /does not authenticate the issuer or prove source accuracy/);
  assert.match(html, /aria-pressed="true"/);
});

it("evidence projection retains a focus outside the leaders without changing ranks", () => {
  const listing: EarnListing = {
    id: "fixture", title: "Fixture", slug: "fixture", rewardAmount: 50, token: "USDC",
    deadline: "2026-06-01T00:00:00Z", type: "bounty", status: "CLOSED", isFeatured: false,
    agentAccess: null, sponsor: { name: "Jupiter" }, _count: { Submission: 5 },
  };
  const edition = computeEarnEdition([listing], new Date("2026-09-17T00:00:00Z"), { focus: sponsorFocus("Jupiter", "/earn/jupiter") });
  edition.sponsors = Array.from({ length: 7 }, (_, index) => ({ rank: index + 1, name: index === 6 ? "Jupiter" : `Other ${index}`, listings: 2, usdRewards: 100 - index, submissions: 5, liveNow: 0 }));
  const before = JSON.stringify(edition);
  const projected = reportEvidence(edition);
  assert.deepEqual(projected.comparisons.map((row) => row.rank), [1, 2, 3, 4, 5, 7]);
  assert.equal(projected.comparisons.at(-1)?.name, "Jupiter");
  assert.equal(projected.listings, edition.focus.listings);
  assert.equal(projected.receipt, edition.receipt);
  assert.equal(JSON.stringify(edition), before);
});

it("publication progress follows real states and never marks an uncertain payment published", () => {
  for (const state of ["signing", "confirming", "publishing", "pending"]) assert.equal(publicationStage(state), "confirm");
  for (const state of ["idle", "preparing", "review", "error"]) assert.equal(publicationStage(state), "review");
  assert.equal(publicationStage("success"), "published");
  assert.equal(publicationStage("preview"), "preview");
  const html = renderToStaticMarkup(<PublicationFrame sponsor="Jupiter" stage={publicationStage("pending")}><p>Check the existing payment</p></PublicationFrame>);
  assert.match(html, /Jupiter report/);
  assert.match(html, /aria-label="Publication progress"/);
  assert.match(html, /aria-current="step"[^>]*>[\s\S]*?Confirm/);
  assert.doesNotMatch(html, /Published<span class="sr-only"> complete/);
});
