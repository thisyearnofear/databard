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
import { createEvidenceReceipt, hashEvidence, type EvidenceReceipt } from "@/lib/evidence-receipt";

export const EARN_API_URL = "https://superteam.fun/api/listings?take=2000&status=all";
const SNAPSHOT_FILE = path.join(process.cwd(), "src/lib/superteam-earn.snapshot.json");
const FETCH_TIMEOUT_MS = 10_000;

/** Bump when the computation below changes, so receipts stay comparable. */
export const EARN_REPORT_VERSION = 1;

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

/**
 * Which sponsor an edition spotlights. UK is the showcase default; any Earn
 * sponsor name works — commissioned editions pass their own focus.
 */
export interface SponsorFocus {
  /** Canonical sponsor name as it appears in Earn's `sponsor.name`. */
  name: string;
  /** Short label for prose — "UK", "Nigeria", "Jupiter". */
  short: string;
  /** Extra matcher beyond exact-name equality (UK counts "SuperteamUK" too). */
  match?: RegExp;
  /** Permalink path for share copy. */
  path: string;
  /** X handle for tweet copy, without the @. */
  handle?: string;
}

export const UK_FOCUS: SponsorFocus = {
  name: "Superteam UK",
  short: "UK",
  match: /^superteam\s*uk\b/i,
  path: "/superteam",
  handle: "SuperteamUK",
};

/** Prose-friendly focus for any other sponsor: exact-name match, no handle. */
export function sponsorFocus(name: string, path: string): SponsorFocus {
  return { name, short: name.replace(/^superteam\s*/i, "").trim() || name, path };
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
  /** When the underlying listings were read (`generatedAt` is when the edition was composed). */
  observedAt: string;
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
  /** The sponsor this edition spotlights — UK on /superteam, any sponsor on /earn. */
  focus: {
    name: string;
    /** Short label for prose — "UK", "Nigeria", "Jupiter". */
    short: string;
    /** A Superteam chapter account (name starts with "Superteam"). */
    isChapter: boolean;
    rankByListings: number;
    /** Rank among ALL sponsors by stable rewards. */
    rankByRewards: number;
    /** Rank among chapters only — 0 for non-chapter sponsors. */
    rankByRewardsChapters: number;
    listings: number;
    usdRewards: number;
    submissions: number;
    subsPerListing: number;
    streakMonths: number;
    leadSinceMonth: string | null;
    liveNow: EarnListingCard[];
    biggest: EarnListingCard[];
    /** Most recently closed focus listings — the fallback when nothing is open. */
    recent: EarnListingCard[];
  };
  chapters: ChapterRow[];
  /** Every sponsor ranked by USD rewards — the league for non-chapter editions. */
  sponsors: ChapterRow[];
  race: RaceSeries;
  story: string[];
  /**
   * `claim` is the page headline, `card` is the OG/tweet one-liner. Both derive
   * from one constant so the card can never drift from the page it links to.
   */
  headline: { claim: string; line: string; card: string };
  permalink: string;
  tweet: string;
  linkedin: string;
  emailBlurb: string;
  /**
   * Unsigned `databard.evidence-receipt` v1 over the inputs and the computed
   * edition. Integrity only: it proves the numbers on the page correspond to
   * exactly this listing set — it does not authenticate the issuer or the
   * truth of Superteam's own data.
   */
  receipt: EvidenceReceipt;
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
 * Series order: the focus sponsor first (highlighted), then the busiest
 * chapters — so a non-chapter focus still gets a race to run in.
 */
function buildRace(listings: EarnListing[], chapters: ChapterRow[], focusName: string): RaceSeries {
  const names = [
    focusName,
    ...chapters.filter((c) => c.name !== focusName).sort((a, b) => b.listings - a.listings).map((c) => c.name),
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
 * Earliest month `focusName` held sole listings lead (vs every sponsor, not
 * just chapters) and never lost it through the end of the series. `null` if
 * the lead still trades hands — the story must say so honestly.
 */
function soleLeadSince(listings: EarnListing[], focusName: string): string | null {
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
    const focus = cum.get(focusName) ?? 0;
    const bestOther = Math.max(0, ...[...cum.entries()].filter(([n]) => n !== focusName).map(([, c]) => c));
    candidate = focus > bestOther ? candidate ?? k : null;
  }
  return candidate;
}

/** Pure computation — same path for live data and the committed snapshot. */
export function computeEarnEdition(
  listings: EarnListing[],
  now = new Date(),
  opts: {
    source?: "live" | "snapshot";
    observedAt?: string;
    requestedAt?: string;
    /** Which sponsor the edition spotlights. Defaults to UK (the /superteam page). */
    focus?: SponsorFocus;
  } = {},
): EarnEdition {
  const source = opts.source ?? "live";
  const focus = opts.focus ?? UK_FOCUS;
  const isFocus = (sponsorName: string | undefined | null) =>
    (sponsorName ?? "") === focus.name || (focus.match?.test(sponsorName ?? "") ?? false);
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
  const byRewardsAll = [...allSponsors].sort((a, b) => b.usdRewards - a.usdRewards || b.listings - a.listings);
  // The focus may appear under small name variants ("SuperteamUK") — aggregate
  // every sponsor key the matcher claims, not just the canonical spelling.
  const focusAgg = allSponsors
    .filter((s) => isFocus(s.name))
    .reduce(
      (acc, s) => ({
        listings: acc.listings + s.listings,
        usdRewards: acc.usdRewards + s.usdRewards,
        submissions: acc.submissions + s.submissions,
        liveNow: acc.liveNow + s.liveNow,
      }),
      { listings: 0, usdRewards: 0, submissions: 0, liveNow: 0 },
    );
  const rankByListings = byListings.findIndex((s) => isFocus(s.name)) + 1;
  const rankByRewards = byRewardsAll.findIndex((s) => isFocus(s.name)) + 1;
  const rankByRewardsChapters = chapters.find((c) => isFocus(c.name))?.rank ?? 0;
  const isChapter = CHAPTER_RE.test(focus.name);

  const focusListings = listings.filter((l) => isFocus(l.sponsor?.name));
  const live = focusListings
    .filter((l) => deadlineAfter(l, now))
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  const biggest = [...focusListings]
    .filter((l) => isStableToken(l.token))
    .sort((a, b) => (b.rewardAmount ?? 0) - (a.rewardAmount ?? 0))
    .slice(0, 5);
  const recent = [...focusListings]
    .filter((l) => !deadlineAfter(l, now) && l.deadline)
    .sort((a, b) => (b.deadline ?? "").localeCompare(a.deadline ?? ""))
    .slice(0, 4);

  const focusMonths = new Set(focusListings.map((l) => monthKey(l.deadline)).filter((k): k is string => !!k));
  const leadSince = soleLeadSince(listings, focus.name);
  const race = buildRace(listings, chapters, focus.name);
  const chapterSubsRates = chapters.filter((c) => c.listings > 0).map((c) => c.submissions / c.listings).sort((a, b) => a - b);
  const chapterMedianSubs = chapterSubsRates.length > 0 ? chapterSubsRates[Math.floor(chapterSubsRates.length / 2)] : 0;
  const focusSubsRate = focusAgg.listings > 0 ? focusAgg.submissions / focusAgg.listings : 0;

  const focusEd = {
    name: focus.name,
    short: focus.short,
    isChapter,
    rankByListings,
    rankByRewards,
    rankByRewardsChapters,
    listings: focusAgg.listings,
    usdRewards: focusAgg.usdRewards,
    submissions: focusAgg.submissions,
    subsPerListing: Math.round(focusSubsRate),
    streakMonths: longestStreak(focusMonths),
    leadSinceMonth: leadSince,
    liveNow: live.slice(0, 6).map(toCard),
    biggest: biggest.map(toCard),
    recent: recent.map(toCard),
  };

  const topRewards = chapters.slice(0, 4);
  const rewardLeader = chapters[0];
  const rewardLeaderAll = byRewardsAll[0];

  const story: string[] = [];
  if (leadSince) {
    story.push(
      `The ${focus.short} desk has closed more bounties than any other sponsor every month since ${monthLong(leadSince)} — every sponsor, not just chapters.`,
    );
  }
  if (rankByListings === 1 && rewardLeaderAll && !isFocus(rewardLeaderAll.name)) {
    story.push(
      `${rewardLeaderAll.name} leads on reward dollars (${money(rewardLeaderAll.usdRewards)}); ${focus.short} wins on volume — ${focusAgg.listings} listings, the most of any sponsor.`,
    );
  } else if (rewardLeaderAll && isFocus(rewardLeaderAll.name)) {
    story.push(
      `${focus.name} leads every sponsor on reward dollars too — ${money(focusAgg.usdRewards)} advertised across ${focusAgg.listings} listings.`,
    );
  }
  if (focusEd.streakMonths >= 3) {
    story.push(`Longest run without a quiet month: ${focusEd.streakMonths} consecutive months with at least one ${focus.short} listing.`);
  }
  if (focusSubsRate > chapterMedianSubs && chapterMedianSubs > 0) {
    story.push(
      `A ${focus.short} listing draws ~${focusEd.subsPerListing} submissions — ${focusSubsRate > chapterMedianSubs * 1.5 ? "well above" : "above"} the ~${Math.round(chapterMedianSubs)} median across chapters.`,
    );
  }

  // One constant, two renderers (page headline + OG card) — they cannot drift.
  const listingsLeadClaim =
    "has published more Earn listings than any other sponsor in the network";
  const rankPhrase =
    rankByListings === 1
      ? `${focus.name} ${listingsLeadClaim}`
      : rankByRewards === 1
        ? `${focus.name} leads the Earn economy on reward dollars`
        : `${focus.name} ranks #${rankByListings || "?"} by listings in the Earn economy`;
  const rewardRankLine = isChapter
    ? `#${rankByRewardsChapters || "?"} of ${chapters.length} chapters by reward volume`
    : `#${rankByRewards || "?"} of ${allSponsors.length} sponsors by reward volume`;
  const headline = {
    claim: rankPhrase,
    line: `${focusEd.listings} listings · ${money(focusEd.usdRewards)} in USD rewards · ${focusEd.submissions.toLocaleString("en-US")} builder submissions — ${rewardRankLine}.`,
    card:
      rankByListings === 1
        ? `${focus.name} ${listingsLeadClaim}.`
        : rankByRewards === 1
          ? `${focus.name} leads the Earn economy on reward dollars.`
          : `#${rankByListings || "?"} by listings in the Earn economy.`,
  };

  const permalink = `${PUBLIC_BASE}${focus.path}`;
  const mention = focus.handle ? `@${focus.handle}` : focus.name;
  const focusClaim =
    rankByListings === 1
      ? listingsLeadClaim
      : rankByRewards === 1
        ? "leads the Earn economy on reward dollars"
        : `ranks #${rankByListings || "?"} by listings`;
  // Tweet copy is length-budgeted: X counts the URL as 23 chars, so keep the
  // rest under 257. Two reward leaders only — names and totals both grow.
  const leaders = topRewards.map((c) => `${c.name.replace("Superteam ", "")} ${money(c.usdRewards)}`).join(" · ");
  const tweetLeaders = topRewards.slice(0, 2).map((c) => `${c.name.replace("Superteam ", "")} ${money(c.usdRewards)}`).join(" · ");

  const tweet = [
    "The Superteam Earn economy, measured:",
    "",
    `${mention} ${focusClaim} — ${focusEd.listings} listings, ${money(focusEd.usdRewards)} in USD-denominated rewards, ${count(focusEd.submissions)} submissions.`,
    "",
    `By reward dollars: ${tweetLeaders}`,
    "",
    permalink,
  ].join("\n");

  const linkedin = [
    `We ran the numbers on the Superteam Earn economy — ${listings.length.toLocaleString("en-US")} public listings, ${count(submissions)} builder submissions.`,
    "",
    `${focus.name} stands out: ${focusEd.listings} listings published (#${focusEd.rankByListings || "?"} of all sponsors), ${money(focusEd.usdRewards)} in USD-denominated rewards, ${focusEd.submissions.toLocaleString("en-US")} submissions.`,
    "",
    `By reward volume: ${leaders}.`,
    "",
    `Attribution is by sponsor-account name, so ${focus.short} activity run under another sponsor's listing is not counted — treat these as floors, not ceilings.`,
    "",
    `Table + method: ${permalink}`,
  ].join("\n");

  const emailBlurb = [
    `We computed a public accounting of the Superteam Earn economy from the listings API (${listings.length.toLocaleString("en-US")} listings, ${count(submissions)} submissions).`,
    "",
    `${focus.name}: ${focusEd.listings} listings (#${focusEd.rankByListings || "?"} of all sponsors), ${money(focusEd.usdRewards)} in USD-denominated rewards, ${focusEd.submissions.toLocaleString("en-US")} submissions — ${rewardRankLine}.`,
    "",
    `Attribution is by sponsor name, so these are floors, not ceilings. USD totals cover stablecoin-denominated rewards only.`,
    "",
    `The table is public — no login: ${permalink}`,
    "",
    "We run this same synthesis on any data source. If a number looks wrong, that is the conversation.",
  ].join("\n");

  const edition: Omit<EarnEdition, "receipt"> = {
    generatedAt: opts.requestedAt ?? now.toISOString(),
    observedAt: opts.observedAt ?? now.toISOString(),
    source,
    totals: {
      listings: listings.length,
      sponsors: sponsors.size,
      submissions,
      usdRewards,
      stableListings,
      agentAllowed,
      liveNow,
    },
    focus: focusEd,
    chapters,
    sponsors: byRewardsAll.map((s, i) => ({ rank: i + 1, ...s })),
    race,
    story,
    headline,
    permalink,
    tweet,
    linkedin,
    emailBlurb,
  };

  // Hash exactly what an offline consumer receives (JSON-normalised, so
  // `undefined` can never leak into the canonical form).
  const result = JSON.parse(JSON.stringify(edition));
  const receipt = createEvidenceReceipt({
    issuer: "databard",
    analysis: { report: "superteam-earn-economy", reportVersion: EARN_REPORT_VERSION },
    generatedAt: edition.generatedAt,
    request: { source: "superteam-earn-listings", url: EARN_API_URL },
    evidence: {
      kind: "earn-listings",
      delivery: source,
      observedAt: edition.observedAt,
      listings: listings.length,
      listingsHash: hashEvidence(JSON.parse(JSON.stringify(listings))),
    },
    resultHash: hashEvidence(result),
  });

  return { ...edition, receipt };
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

export interface EarnListingsSnapshot {
  listings: EarnListing[];
  source: "live" | "snapshot";
  /** When these listings were read — snapshotAsOf for a fallback. */
  observedAt: string;
}

/**
 * Live fetch, falling back to the committed snapshot. Shared by every edition
 * built on Earn data so the fallback behaves identically everywhere.
 */
export async function loadEarnListings(now = new Date()): Promise<EarnListingsSnapshot> {
  try {
    const listings = await fetchEarnListings();
    return { listings, source: "live", observedAt: now.toISOString() };
  } catch {
    const raw = await fs.readFile(SNAPSHOT_FILE, "utf-8");
    const snap = JSON.parse(raw) as SnapshotFile;
    return { listings: snap.listings, source: "snapshot", observedAt: snap.snapshotAsOf };
  }
}

/**
 * Live fetch → computed edition; falls back to the committed snapshot, labelled.
 * A snapshot edition evaluates deadlines as of `snapshotAsOf`, not "now".
 * Pass a `focus` to spotlight a different sponsor — commissioned editions do.
 */
export async function loadEarnEdition(now = new Date(), focus?: SponsorFocus): Promise<EarnEdition> {
  let loaded: EarnListingsSnapshot;
  try {
    loaded = await loadEarnListings(now);
  } catch {
    throw new Error("Superteam Earn data unavailable (live fetch failed, no snapshot)");
  }
  return computeEarnEdition(loaded.listings, new Date(loaded.observedAt), {
    source: loaded.source,
    observedAt: loaded.observedAt,
    requestedAt: now.toISOString(),
    focus,
  });
}
