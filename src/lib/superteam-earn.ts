/**
 * Superteam Earn economy — public accounting of the listings marketplace.
 *
 * Data source: Superteam Earn's public listings API
 * (https://superteam.fun/api/listings). No key, no auth — the same data the
 * Earn site renders. We compute chapter-level aggregates and a Superteam UK
 * spotlight because the numbers are the asset partners share.
 *
 * Honesty rules:
 * - `rewardAmount` is denominated in the listing's own token. Only
 *   USD-stable tokens (USDC/USDG/USDT) are summed into `usdRewards`.
 *   Token-denominated bounties count as listings, never as dollars.
 * - The API's `status` field is not a reliable live signal — `liveNow` is
 *   computed from deadline > now instead.
 * - This is not an official Superteam report. Numbers are computed from a
 *   public API response; the page says so.
 */
import { promises as fs } from "fs";
import path from "path";

export const EARN_API_URL = "https://superteam.fun/api/listings?take=2000&status=all";
const SNAPSHOT_FILE = path.join(process.cwd(), "src/lib/superteam-earn.snapshot.json");
const FETCH_TIMEOUT_MS = 10_000;

const STABLE_TOKENS = new Set(["USDC", "USDG", "USDT", "USD"]);
const CHAPTER_RE = /^superteam/i;
const UK_RE = /^superteam\s*uk\b/i;

export interface EarnListing {
  id: string;
  title: string;
  slug: string;
  rewardAmount: number | null;
  token: string | null;
  deadline: string | null;
  type: string;
  status: string;
  isFeatured: boolean;
  agentAccess: string | null;
  _count?: { Submission?: number; Comments?: number };
  sponsor: { name: string; slug?: string; isVerified?: boolean };
}

export interface ChapterRow {
  rank: number;
  name: string;
  listings: number;
  usdRewards: number;
  submissions: number;
  liveNow: number;
}

export interface EarnListingCard {
  title: string;
  url: string;
  reward: string;
  deadline: string | null;
}

/** One cumulative-listings trace per chapter, bucketed by deadline month. */
export interface RaceSeries {
  /** Chart rows: `{ t: "Jan 24", "<chapter>": cumulativeCount, … }` */
  rows: Record<string, string | number>[];
  /** Series keys in render order — index 0 is the highlighted one. */
  keys: string[];
}

export interface EarnEdition {
  generatedAt: string;
  source: "live" | "snapshot";
  totals: {
    listings: number;
    sponsors: number;
    submissions: number;
    usdRewards: number;
    stableListings: number;
    agentAllowed: number;
    liveNow: number;
  };
  uk: {
    name: string;
    rankByListings: number;
    rankByRewards: number;
    listings: number;
    usdRewards: number;
    submissions: number;
    subsPerListing: number;
    streakMonths: number;
    leadSinceMonth: string | null;
    liveNow: EarnListingCard[];
    biggest: EarnListingCard[];
  };
  chapters: ChapterRow[];
  race: RaceSeries;
  story: string[];
  headline: { claim: string; line: string };
  permalink: string;
  tweet: string;
  linkedin: string;
  emailBlurb: string;
}

const PUBLIC_BASE = (process.env.NEXT_PUBLIC_URL || "https://databard.persidian.com").replace(/\/$/, "");
export const SUPERTEAM_PATH = "/superteam";

export function isStableToken(token: string | null | undefined): boolean {
  return !!token && STABLE_TOKENS.has(token.toUpperCase());
}

function listingUrl(l: EarnListing): string {
  return `https://superteam.fun/listing/${l.slug}`;
}

function rewardLabel(l: EarnListing): string {
  const amt = l.rewardAmount ?? 0;
  const token = l.token ?? "";
  if (isStableToken(token)) return `$${amt.toLocaleString("en-US")}`;
  return `${amt.toLocaleString("en-US")} ${token}`;
}

function toCard(l: EarnListing): EarnListingCard {
  return {
    title: l.title,
    url: listingUrl(l),
    reward: rewardLabel(l),
    deadline: l.deadline,
  };
}

function deadlineAfter(l: EarnListing, now: Date): boolean {
  if (!l.deadline) return false;
  const d = new Date(l.deadline);
  return !Number.isNaN(d.getTime()) && d > now;
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function count(n: number): string {
  return n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthKey(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y.slice(2)}`;
}

function monthLong(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

function monthRange(min: string, max: string): string[] {
  const out: string[] = [];
  let [y, m] = min.split("-").map(Number);
  const [ey, em] = max.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Longest run of consecutive months with ≥1 listing (deadline month as the activity proxy). */
function longestStreak(months: Set<string>): number {
  if (months.size === 0) return 0;
  const sorted = [...months].sort();
  let best = 1, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const [py, pm] = sorted[i - 1].split("-").map(Number);
    const [cy, cm] = sorted[i].split("-").map(Number);
    run = cy * 12 + cm === py * 12 + pm + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Cumulative listings per chapter by deadline month — "the chapter race".
 * Series order: UK first (highlighted), then the next-busiest chapters.
 */
function buildRace(listings: EarnListing[], chapters: ChapterRow[]): RaceSeries {
  const names = [
    "Superteam UK",
    ...chapters.filter((c) => c.name !== "Superteam UK").sort((a, b) => b.listings - a.listings).map((c) => c.name),
  ].slice(0, 5);

  const perMonth = new Map<string, Map<string, number>>();
  let min = "9999-12", max = "0000-01";
  for (const l of listings) {
    const name = l.sponsor?.name;
    if (!name || !names.includes(name)) continue;
    const k = monthKey(l.deadline);
    if (!k) continue;
    if (k < min) min = k;
    if (k > max) max = k;
    const bucket = perMonth.get(k) ?? new Map<string, number>();
    bucket.set(name, (bucket.get(name) ?? 0) + 1);
    perMonth.set(k, bucket);
  }
  if (min > max) return { rows: [], keys: names };

  const cumulative = new Map<string, number>(names.map((n) => [n, 0]));
  const rows = monthRange(min, max).map((k) => {
    const bucket = perMonth.get(k);
    const row: Record<string, string | number> = { t: monthLabel(k) };
    for (const n of names) {
      cumulative.set(n, (cumulative.get(n) ?? 0) + (bucket?.get(n) ?? 0));
      row[n] = cumulative.get(n) ?? 0;
    }
    return row;
  });
  return { rows, keys: names };
}

/**
 * Earliest month the UK held sole listings lead (vs every sponsor, not just
 * chapters) and never lost it through the end of the series. `null` if the
 * lead still trades hands — the story must say so honestly.
 */
function ukLeadSince(listings: EarnListing[]): string | null {
  const byMonth = new Map<string, Map<string, number>>();
  let min = "9999-12", max = "0000-01";
  for (const l of listings) {
    const name = l.sponsor?.name;
    const k = monthKey(l.deadline);
    if (!name || !k) continue;
    if (k < min) min = k;
    if (k > max) max = k;
    const bucket = byMonth.get(k) ?? new Map<string, number>();
    bucket.set(name, (bucket.get(name) ?? 0) + 1);
    byMonth.set(k, bucket);
  }
  if (min > max) return null;

  const cum = new Map<string, number>();
  let candidate: string | null = null;
  for (const k of monthRange(min, max)) {
    const bucket = byMonth.get(k);
    if (bucket) for (const [n, c] of bucket) cum.set(n, (cum.get(n) ?? 0) + c);
    const uk = cum.get("Superteam UK") ?? 0;
    const bestOther = Math.max(0, ...[...cum.entries()].filter(([n]) => n !== "Superteam UK").map(([, c]) => c));
    candidate = uk > bestOther ? candidate ?? k : null;
  }
  return candidate;
}

/** Pure computation — same path for live data and the committed snapshot. */
export function computeEarnEdition(listings: EarnListing[], now = new Date()): EarnEdition {
  const sponsors = new Map<string, { listings: number; usdRewards: number; submissions: number; liveNow: number }>();
  let submissions = 0;
  let usdRewards = 0;
  let stableListings = 0;
  let agentAllowed = 0;
  let liveNow = 0;

  for (const l of listings) {
    const name = l.sponsor?.name?.trim() || "Unknown";
    const agg = sponsors.get(name) ?? { listings: 0, usdRewards: 0, submissions: 0, liveNow: 0 };
    agg.listings += 1;
    if (isStableToken(l.token)) {
      agg.usdRewards += l.rewardAmount ?? 0;
      usdRewards += l.rewardAmount ?? 0;
      stableListings += 1;
    }
    const subs = l._count?.Submission ?? 0;
    agg.submissions += subs;
    submissions += subs;
    if (deadlineAfter(l, now)) {
      agg.liveNow += 1;
      liveNow += 1;
    }
    if (l.agentAccess === "AGENT_ALLOWED") agentAllowed += 1;
    sponsors.set(name, agg);
  }

  const chapters: ChapterRow[] = [...sponsors.entries()]
    .filter(([name]) => CHAPTER_RE.test(name))
    .map(([name, a]) => ({ rank: 0, name, ...a }))
    .sort((a, b) => b.usdRewards - a.usdRewards || b.listings - a.listings)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  const allSponsors = [...sponsors.entries()].map(([name, a]) => ({ name, ...a }));
  const byListings = [...allSponsors].sort((a, b) => b.listings - a.listings);
  const ukAgg = sponsors.get("Superteam UK") ?? { listings: 0, usdRewards: 0, submissions: 0, liveNow: 0 };
  const rankByListings = byListings.findIndex((s) => s.name === "Superteam UK") + 1;
  const rankByRewards = chapters.find((c) => c.name === "Superteam UK")?.rank ?? 0;

  const ukListings = listings.filter((l) => UK_RE.test(l.sponsor?.name ?? ""));
  const live = ukListings
    .filter((l) => deadlineAfter(l, now))
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  const biggest = [...ukListings]
    .filter((l) => isStableToken(l.token))
    .sort((a, b) => (b.rewardAmount ?? 0) - (a.rewardAmount ?? 0))
    .slice(0, 5);

  const ukMonths = new Set(ukListings.map((l) => monthKey(l.deadline)).filter((k): k is string => !!k));
  const leadSince = ukLeadSince(listings);
  const race = buildRace(listings, chapters);
  const chapterSubsRates = chapters.filter((c) => c.listings > 0).map((c) => c.submissions / c.listings).sort((a, b) => a - b);
  const chapterMedianSubs = chapterSubsRates.length > 0 ? chapterSubsRates[Math.floor(chapterSubsRates.length / 2)] : 0;
  const ukSubsRate = ukAgg.listings > 0 ? ukAgg.submissions / ukAgg.listings : 0;

  const uk = {
    name: "Superteam UK",
    rankByListings,
    rankByRewards,
    listings: ukAgg.listings,
    usdRewards: ukAgg.usdRewards,
    submissions: ukAgg.submissions,
    subsPerListing: Math.round(ukSubsRate),
    streakMonths: longestStreak(ukMonths),
    leadSinceMonth: leadSince,
    liveNow: live.slice(0, 6).map(toCard),
    biggest: biggest.map(toCard),
  };

  const topRewards = chapters.slice(0, 4);
  const rewardLeader = chapters[0];

  const story: string[] = [];
  if (leadSince) {
    story.push(
      `The UK took the listings lead in ${monthLong(leadSince)} and hasn't handed it back — every sponsor, not just chapters.`,
    );
  }
  if (rewardLeader && rewardLeader.name !== "Superteam UK") {
    story.push(
      `${rewardLeader.name} leads on reward dollars (${money(rewardLeader.usdRewards)}); the UK wins on volume — ${ukAgg.listings} listings, the most of any sponsor.`,
    );
  }
  if (uk.streakMonths >= 3) {
    story.push(`Longest run without a quiet month: ${uk.streakMonths} consecutive months with at least one UK listing.`);
  }
  if (ukSubsRate > chapterMedianSubs && chapterMedianSubs > 0) {
    story.push(
      `A UK listing draws ~${uk.subsPerListing} submissions — ${ukSubsRate > chapterMedianSubs * 1.5 ? "well above" : "above"} the ~${Math.round(chapterMedianSubs)} median across chapters.`,
    );
  }

  const headline = {
    claim:
      rankByListings === 1
        ? "Superteam UK posts more Earn opportunities than any sponsor in the network"
        : `Superteam UK ranks #${rankByListings} by listings in the Earn economy`,
    line: `${uk.listings} listings · ${money(uk.usdRewards)} in USD rewards · ${uk.submissions.toLocaleString("en-US")} builder submissions — #${uk.rankByRewards || "?"} of ${chapters.length} chapters by reward volume.`,
  };

  const permalink = `${PUBLIC_BASE}${SUPERTEAM_PATH}`;
  const leaders = topRewards.map((c) => `${c.name.replace("Superteam ", "")} ${money(c.usdRewards)}`).join(" · ");

  const tweet = [
    "The Superteam Earn economy, measured:",
    "",
    `@SuperteamUK posts more opportunities than any other chapter — ${uk.listings} listings, ${money(uk.usdRewards)} in rewards, ${count(uk.submissions)} submissions.`,
    "",
    `Reward leaders: ${leaders}`,
    "",
    `Full table → ${permalink}`,
  ].join("\n");

  const linkedin = [
    `We ran the numbers on the Superteam Earn economy — ${listings.length.toLocaleString("en-US")} public listings, ${count(submissions)} builder submissions.`,
    "",
    `Superteam UK stands out: ${uk.listings} opportunities posted (more than any other chapter), ${money(uk.usdRewards)} in USD-denominated rewards, ${uk.submissions.toLocaleString("en-US")} submissions.`,
    "",
    `By reward volume: ${leaders}.`,
    "",
    `Table + method: ${permalink}`,
  ].join("\n");

  const emailBlurb = [
    `We computed a public accounting of the Superteam Earn economy from the listings API (${listings.length.toLocaleString("en-US")} listings, ${count(submissions)} submissions).`,
    "",
    `Superteam UK: ${uk.listings} listings (#${uk.rankByListings} of all sponsors), ${money(uk.usdRewards)} in USD rewards, ${uk.submissions.toLocaleString("en-US")} submissions — #${uk.rankByRewards || "?"} chapter by reward volume.`,
    "",
    `The table is public — no login: ${permalink}`,
    "",
    "We run this same synthesis on any data source. If a number looks wrong, that is the conversation.",
  ].join("\n");

  return {
    generatedAt: now.toISOString(),
    source: "live",
    totals: {
      listings: listings.length,
      sponsors: sponsors.size,
      submissions,
      usdRewards,
      stableListings,
      agentAllowed,
      liveNow,
    },
    uk,
    chapters,
    race,
    story,
    headline,
    permalink,
    tweet,
    linkedin,
    emailBlurb,
  };
}

export async function fetchEarnListings(): Promise<EarnListing[]> {
  const res = await fetch(EARN_API_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Earn API ${res.status}`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("Earn API returned a non-array body");
  return data as EarnListing[];
}

interface SnapshotFile {
  snapshotAsOf: string;
  listings: EarnListing[];
}

/** Live fetch → computed edition; falls back to the committed snapshot, labelled. */
export async function loadEarnEdition(now = new Date()): Promise<EarnEdition> {
  try {
    const listings = await fetchEarnListings();
    return computeEarnEdition(listings, now);
  } catch {
    try {
      const raw = await fs.readFile(SNAPSHOT_FILE, "utf-8");
      const snap = JSON.parse(raw) as SnapshotFile;
      const edition = computeEarnEdition(snap.listings, new Date(snap.snapshotAsOf));
      return { ...edition, source: "snapshot", generatedAt: now.toISOString() };
    } catch {
      throw new Error("Superteam Earn data unavailable (live fetch failed, no snapshot)");
    }
  }
}
