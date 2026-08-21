/**
 * Weekly public accounting of protocol data health.
 * The lead magnet: a dated, linkable edition you can paste into outreach
 * and socials. Computed from engine snapshots; falls back to the seeded
 * public-protocol roster so the URL is never empty.
 */
import { diffInsights } from "@/lib/schema-analysis";
import { getSnapshotHistory, listSnapshots } from "@/lib/schema-snapshots";

export interface LeagueRow {
  rank: number;
  schemaFqn: string;
  schemaName: string;
  score: number;
  change: number;
  finding: string;
  failingTests: number;
  staleTables: number;
}

export interface LeagueHeadline {
  schemaFqn: string;
  schemaName: string;
  score: number;
  change: number;
  line: string;
}

export interface LeagueEdition {
  weekLabel: string;
  weekStart: string;
  generatedAt: string;
  sample: boolean;
  headline: LeagueHeadline;
  rows: LeagueRow[];
  average: number;
  permalink: string;
  tweet: string;
  emailBlurb: string;
}

const PUBLIC_BASE = (process.env.NEXT_PUBLIC_URL || "https://databard.persidian.com").replace(/\/$/, "");
export const LEAGUE_PATH = "/league";

/** Enterprise demo schema — not a public protocol, keep it off the magnet. */
const PRIVATE_FQN = /analytics\.ecommerce/i;

/**
 * Seeded public roster (same numbers as demo/seed). Used only when the
 * engine has no public snapshots yet, so the page is always a real URL.
 */
const SAMPLE_ROWS: Omit<LeagueRow, "rank">[] = [
  { schemaFqn: "jupiter.swap_metrics", schemaName: "Jupiter Swap Metrics", score: 92, change: 2, finding: "Healthy and stable. Routing metrics refreshing hourly.", failingTests: 0, staleTables: 0 },
  { schemaFqn: "raydium.amm", schemaName: "Raydium AMM", score: 88, change: 4, finding: "Farm rewards recovered after last week's wobble.", failingTests: 0, staleTables: 0 },
  { schemaFqn: "dune.uniswap", schemaName: "Uniswap Analytics", score: 73, change: -11, finding: "Gas analysis failing and stale for 96 hours. Coverage dropped on new pool deployments.", failingTests: 2, staleTables: 1 },
  { schemaFqn: "marinade.staking", schemaName: "Marinade Staking", score: 71, change: -3, finding: "mSOL price feed still failing. Unstake queue picked up a new failure.", failingTests: 2, staleTables: 0 },
  { schemaFqn: "orca.whirlpools", schemaName: "Orca Whirlpools", score: 68, change: -7, finding: "Tick bounds failing. Swap quotes stale for 72 hours — bad ticks mean bad quotes.", failingTests: 2, staleTables: 1 },
];

function isoWeekParts(d: Date): { year: number; week: number; monday: Date } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - 3); // Thursday minus 3 = Monday
  monday.setUTCHours(0, 0, 0, 0);
  return { year, week, monday };
}

function formatWeekLabel(d: Date): { weekLabel: string; weekStart: string } {
  const { year, week, monday } = isoWeekParts(d);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return {
    weekLabel: `Week ${week} · ${fmt(monday)}–${fmt(sunday)} ${year}`,
    weekStart: monday.toISOString(),
  };
}

function findingFromSnap(args: {
  schemaName: string;
  change: number;
  failingTests: number;
  staleCount: number;
  newFailures: string[];
  critical: string[];
}): string {
  const { schemaName, change, failingTests, staleCount, newFailures, critical } = args;
  const names = (newFailures.length ? newFailures : critical).slice(0, 2).join(", ");
  if (change <= -5) {
    const extra = names ? ` (${names})` : "";
    return `Health dropped ${Math.abs(change)} points this week${extra}.`;
  }
  if (failingTests > 0) {
    return `${failingTests} failing test${failingTests === 1 ? "" : "s"}${names ? `: ${names}` : ""}.`;
  }
  if (staleCount > 0) {
    return `${staleCount} stale table${staleCount === 1 ? "" : "s"} — pipelines may have stopped.`;
  }
  if (change > 0) return `Health up ${change} points. ${schemaName} is holding.`;
  return `${schemaName} is stable.`;
}

function pickHeadline(rows: LeagueRow[]): LeagueHeadline {
  const byDrop = [...rows].sort((a, b) => a.change - b.change || a.score - b.score)[0];
  const byScore = [...rows].sort((a, b) => a.score - b.score)[0];
  const pick = byDrop && byDrop.change <= -5 ? byDrop : byScore;
  return {
    schemaFqn: pick.schemaFqn,
    schemaName: pick.schemaName,
    score: pick.score,
    change: pick.change,
    line: pick.finding,
  };
}

function composeCopy(rows: LeagueRow[], headline: LeagueHeadline, weekLabel: string, permalink: string): { tweet: string; emailBlurb: string } {
  const short = (name: string) => name.replace(/ (Swap Metrics|AMM|Analytics|Staking|Whirlpools)$/, "");
  const top = rows.slice(0, 3).map((r) => {
    const delta = r.change === 0 ? "" : r.change > 0 ? `↑${r.change}` : `↓${Math.abs(r.change)}`;
    return `${short(r.schemaName)} ${r.score}${delta}`;
  });
  const drop = headline.change < 0 ? ` ↓${Math.abs(headline.change)}` : "";
  const watch = headline.line.length > 88 ? `${headline.line.slice(0, 85).trimEnd()}…` : headline.line;
  const tweet = [
    `State of Solana data health, ${weekLabel.split(" · ")[0]}`,
    top.join(" · "),
    `Watch: ${short(headline.schemaName)} ${headline.score}${drop}. ${watch}`,
    permalink,
  ].join("\n");

  const emailBlurb = [
    `We publish a weekly data-health accounting of public Solana sources (${weekLabel}).`,
    "",
    `This week: ${headline.schemaName} is ${headline.score}/100. ${headline.line}`,
    "",
    `The table is public — no login: ${permalink}`,
    "",
    "Happy to rerun this on a source you actually operate. If it doesn't surface something you didn't already know, tell me that too.",
  ].join("\n");

  return { tweet, emailBlurb };
}

function rowsFromSnapshots(): LeagueRow[] | null {
  const snaps = listSnapshots().filter((s) => !PRIVATE_FQN.test(s.schemaFqn));
  if (snaps.length === 0) return null;

  const unsorted = snaps.map((snap) => {
    const history = getSnapshotHistory(snap.schemaFqn);
    const now = new Date(snap.recordedAt);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prev =
      history
        .filter((h) => new Date(h.recordedAt) <= weekAgo)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]
      ?? history.filter((h) => h.recordedAt !== snap.recordedAt).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];

    const diff = prev
      ? diffInsights(prev.insights, snap.insights, prev.tableNames, snap.tableNames)
      : null;
    const change = diff?.healthScoreChange ?? 0;
    const critical = snap.insights.criticalTables.map((c) => c.table.name);
    const finding = findingFromSnap({
      schemaName: snap.schemaName,
      change,
      failingTests: snap.insights.failingTests,
      staleCount: snap.insights.staleTables.length,
      newFailures: diff?.newFailures ?? [],
      critical,
    });
    return {
      schemaFqn: snap.schemaFqn,
      schemaName: snap.schemaName,
      score: snap.insights.healthScore,
      change,
      finding,
      failingTests: snap.insights.failingTests,
      staleTables: snap.insights.staleTables.length,
    };
  });

  return unsorted
    .sort((a, b) => b.score - a.score)
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

export function buildLeagueEdition(now = new Date()): LeagueEdition {
  const live = rowsFromSnapshots();
  const sample = !live;
  const rows = (live ?? SAMPLE_ROWS.map((r) => ({ ...r }))).map((row, i) => ({
    ...row,
    rank: i + 1,
  }));
  const asOf = live
    ? new Date(
        listSnapshots()
          .filter((s) => !PRIVATE_FQN.test(s.schemaFqn))
          .map((s) => s.recordedAt)
          .sort()
          .at(-1) ?? now.toISOString(),
      )
    : now;
  const { weekLabel, weekStart } = formatWeekLabel(asOf);
  const headline = pickHeadline(rows);
  const permalink = `${PUBLIC_BASE}${LEAGUE_PATH}`;
  const { tweet, emailBlurb } = composeCopy(rows, headline, weekLabel, permalink);
  const average = Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length);

  return {
    weekLabel,
    weekStart,
    generatedAt: now.toISOString(),
    sample,
    headline,
    rows,
    average,
    permalink,
    tweet,
    emailBlurb,
  };
}
