/**
 * The attention market — what web3 brands spend buying builder attention.
 *
 * Data source: Superteam Earn's public listings API (same dataset as
 * `superteam-earn.ts`). Bounties are literally companies purchasing community
 * attention, and Earn publishes the price they paid and how many people showed
 * up. That makes an attention-price index computable from public data.
 *
 * Honesty rules (each one earned by a wrong first answer):
 * - USD totals cover **stablecoin-denominated** rewards only (USDC/USDG/USDT).
 *   Token-denominated bounties (JUP/SOL/PYTH/…) count as listings, never as
 *   dollars. They are ~6% of listings.
 * - `rewardAmount` is a *budget*, not a settlement. We index the advertised
 *   price of attention, not money that verifiably changed hands.
 * - Submissions are the listing's own submission count — a demand proxy, not
 *   unique humans. One person may submit to many listings.
 * - A single $1M hackathon is 29% of all reward value and distorts every
 *   derived ratio, so outliers at or above `OUTLIER_USD` are reported by name
 *   and excluded from trend maths.
 * - Months are bucketed by **deadline**, because Earn's API exposes no
 *   posted-at date. This is a closings series, not an announcements series.
 * - The current month is incomplete and future months contain only already-
 *   scheduled campaigns. Only `complete` months inform the trend.
 * - The price trend compares the first and second halves of complete months.
 *   It reports "flat" when the move is inside ±15%: the honest reading of this
 *   data is stable, and a noisier framing would be a claim the numbers do not
 *   support.
 *
 * Server-only: `superteam-earn.ts` imports `node:fs`/`node:path`.
 */
import { isStableToken, loadEarnListings, type EarnListingsSnapshot, type EarnListing } from "@/lib/superteam-earn";
import { createEvidenceReceipt, hashEvidence, type EvidenceReceipt } from "@/lib/evidence-receipt";

export const ATTENTION_REPORT_VERSION = 1;

/** A campaign this large moves the aggregate ratio on its own. */
export const OUTLIER_USD = 100_000;

/** Inside this band the trend is called flat rather than up or down. */
export const FLAT_BAND = 0.15;

export interface AttentionMonth {
  month: string;
  label: string;
  /** complete = fully in the past; current = in progress; scheduled = deadline not yet reached. */
  phase: "complete" | "current" | "scheduled";
  listings: number;
  stableListings: number;
  /** Stable-denominated budget, including outliers. */
  usdRewards: number;
  /** Stable-denominated budget below OUTLIER_USD — what the trend is computed on. */
  usdRewardsCore: number;
  submissions: number;
  /** Submissions on non-outlier campaigns — the denominator that matches usdRewardsCore. */
  submissionsCore: number;
  /** Advertised USD spent per submission received; null when nothing was received. */
  usdPerSubmission: number | null;
}

export interface AttentionOutlier {
  title: string;
  sponsor: string;
  rewardAmount: number;
  month: string;
}

export interface AttentionSponsorShare {
  name: string;
  usdRewards: number;
  share: number;
}

export interface AttentionPriceTrend {
  /** Half-window labels, e.g. "Jun 2023–Dec 2024". */
  earlyLabel: string;
  lateLabel: string;
  earlyUsdPerSubmission: number;
  lateUsdPerSubmission: number;
  /** late ÷ early. */
  ratio: number;
  direction: "flat" | "up" | "down";
}

export interface AttentionEdition {
  generatedAt: string;
  observedAt: string;
  source: "live" | "snapshot";
  window: { from: string; to: string; completeMonths: number };
  totals: {
    listings: number;
    stableListings: number;
    tokenListings: number;
    sponsors: number;
    submissions: number;
    /** Stable-denominated budget across every month, outliers included. */
    usdRewards: number;
    /** Same, outliers excluded. */
    usdRewardsCore: number;
    usdPerSubmissionCore: number | null;
  };
  outliers: AttentionOutlier[];
  months: AttentionMonth[];
  topSponsors: AttentionSponsorShare[];
  priceTrend: AttentionPriceTrend;
  headline: { claim: string; line: string; card: string };
  story: string[];
  permalink: string;
  receipt: EvidenceReceipt;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PUBLIC_BASE = (process.env.NEXT_PUBLIC_URL || "https://databard.persidian.com").replace(/\/$/, "");
export const ATTENTION_PATH = "/attention";

function monthKey(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
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

function nowMonthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

export function count(n: number): string {
  return n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`;
}

function phaseOf(key: string, nowKey: string): AttentionMonth["phase"] {
  if (key < nowKey) return "complete";
  if (key === nowKey) return "current";
  return "scheduled";
}

interface Bucket {
  listings: number;
  stableListings: number;
  usdRewards: number;
  usdRewardsCore: number;
  submissions: number;
  submissionsCore: number;
}

function emptyBucket(): Bucket {
  return {
    listings: 0,
    stableListings: 0,
    usdRewards: 0,
    usdRewardsCore: 0,
    submissions: 0,
    submissionsCore: 0,
  };
}

/** Advertised dollars per submission received, on a bucket's own totals. */
export function pricePerSubmission(usd: number, submissions: number): number | null {
  return submissions > 0 ? usd / submissions : null;
}

/**
 * Pure computation — same path for live data and the committed snapshot.
 * Listings without a deadline still count in `totals`; they just cannot be
 * placed on the timeline.
 */
export function computeAttentionEdition(
  listings: EarnListing[],
  now = new Date(),
  opts: { source?: "live" | "snapshot"; observedAt?: string; requestedAt?: string } = {},
): AttentionEdition {
  const source = opts.source ?? "live";
  const nowKey = nowMonthKey(now);
  const buckets = new Map<string, Bucket>();
  const outliers: AttentionOutlier[] = [];
  const sponsorUsd = new Map<string, number>();

  let stableListings = 0;
  let tokenListings = 0;
  let usdRewards = 0;
  let usdRewardsCore = 0;
  let submissions = 0;

  for (const l of listings) {
    const subs = l._count?.Submission ?? 0;
    submissions += subs;

    if (!isStableToken(l.token)) {
      tokenListings += 1;
      continue;
    }
    stableListings += 1;
    const amount = l.rewardAmount ?? 0;
    const sponsor = l.sponsor?.name?.trim() || "Unknown";
    usdRewards += amount;

    const key = monthKey(l.deadline);
    if (!key) continue;

    const isOutlier = amount >= OUTLIER_USD;
    if (isOutlier) {
      outliers.push({ title: l.title, sponsor, rewardAmount: amount, month: key });
    } else {
      usdRewardsCore += amount;
      sponsorUsd.set(sponsor, (sponsorUsd.get(sponsor) ?? 0) + amount);
    }

    const b = buckets.get(key) ?? emptyBucket();
    b.listings += 1;
    b.stableListings += 1;
    b.usdRewards += amount;
    b.submissions += subs;
    // Outliers leave the core figures entirely — dollars *and* the submissions
    // they drew — so the ratio never mixes two different populations.
    if (!isOutlier) {
      b.usdRewardsCore += amount;
      b.submissionsCore += subs;
    }
    buckets.set(key, b);
  }

  const months: AttentionMonth[] = [...buckets.keys()]
    .sort()
    .map((key) => {
      const b = buckets.get(key)!;
      return {
        month: key,
        label: monthLabel(key),
        phase: phaseOf(key, nowKey),
        listings: b.listings,
        stableListings: b.stableListings,
        usdRewards: b.usdRewards,
        usdRewardsCore: b.usdRewardsCore,
        submissions: b.submissions,
        submissionsCore: b.submissionsCore,
        usdPerSubmission: pricePerSubmission(b.usdRewardsCore, b.submissionsCore),
      };
    });

  // Monotonic calendar spine so the series is continuous even for gaps.
  const spine =
    months.length > 1
      ? monthRange(months[0].month, months[months.length - 1].month).map((key) => {
          const found = months.find((m) => m.month === key);
          if (found) return found;
          return {
            month: key,
            label: monthLabel(key),
            phase: phaseOf(key, nowKey),
            listings: 0,
            stableListings: 0,
            usdRewards: 0,
            usdRewardsCore: 0,
            submissions: 0,
            submissionsCore: 0,
            usdPerSubmission: null,
          } satisfies AttentionMonth;
        })
      : months;

  const complete = spine.filter((m) => m.phase === "complete");
  const coreUsd = complete.reduce((s, m) => s + m.usdRewardsCore, 0);
  const coreSubs = complete.reduce((s, m) => s + m.submissionsCore, 0);

// Two equal-ish halves of the complete months: the least arbitrary split
  // available, and the trend is only ever claimed inside a ±15% band.
  const half = Math.floor(complete.length / 2);
  const early = complete.slice(0, half);
  const late = complete.slice(half);
  const total = (rows: AttentionMonth[], pick: (m: AttentionMonth) => number) =>
    rows.reduce((s, m) => s + pick(m), 0);
  const earlyPps = pricePerSubmission(total(early, (m) => m.usdRewardsCore), total(early, (m) => m.submissionsCore)) ?? 0;
  const latePps = pricePerSubmission(total(late, (m) => m.usdRewardsCore), total(late, (m) => m.submissionsCore)) ?? 0;
  const ratio = earlyPps > 0 ? latePps / earlyPps : 1;
  const direction: AttentionPriceTrend["direction"] =
    Math.abs(ratio - 1) <= FLAT_BAND ? "flat" : ratio > 1 ? "up" : "down";
  const spanLabel = (rows: AttentionMonth[]) =>
    rows.length === 0 ? "—" : `${rows[0].label}–${rows[rows.length - 1].label}`;

  const topSponsors: AttentionSponsorShare[] = [...sponsorUsd.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, usd]) => ({
      name,
      usdRewards: usd,
      share: usdRewardsCore > 0 ? usd / usdRewardsCore : 0,
    }));

  const earlyUsd = total(early, (m) => m.usdRewardsCore);
  const lateUsd = total(late, (m) => m.usdRewardsCore);
  const growth = earlyUsd > 0 ? lateUsd / earlyUsd : 0;
  // A trend claim needs two populated halves: at least a month either side of
  // the split, each with submissions to divide by. Below that we state the
  // level, not a movement.
  const trendClaimable =
    complete.length >= 4 &&
    early.length > 0 &&
    late.length > 0 &&
    total(early, (m) => m.submissionsCore) > 0 &&
    total(late, (m) => m.submissionsCore) > 0;
  const outlierUsd = outliers.reduce((s, o) => s + o.rewardAmount, 0);
  const outlierShare = usdRewards > 0 ? outlierUsd / usdRewards : 0;

  const claim = !trendClaimable
    ? `Web3 attention spend is ${money(coreUsd || usdRewards)} at ${money(latePps || earlyPps)} a submission.`
    : direction === "flat"
      ? `Web3 attention spend grew ${growth.toFixed(1)}× — the price of a builder submission didn't move.`
      : `Web3 attention spend grew ${growth.toFixed(1)}× and the price of a builder submission ${direction === "up" ? "rose" : "fell"} to ${money(latePps)}.`;

  const headline = {
    claim,
    line: `${money(usdRewardsCore)} of advertised USD bounties across ${stableListings.toLocaleString("en-US")} stablecoin campaigns and ${count(submissions)} submissions — ${money(earlyPps)} per submission in ${spanLabel(early)} vs ${money(latePps)} in ${spanLabel(late)}.`,
    card: claim,
  };

  const story: string[] = [];
  if (outliers.length > 0) {
    const biggest = outliers.reduce((a, b) => (b.rewardAmount > a.rewardAmount ? b : a));
    story.push(
      `One campaign — ${biggest.sponsor}'s ${money(biggest.rewardAmount)} ${biggest.title} — is ${(outlierShare * 100).toFixed(0)}% of all reward value on Earn. It is excluded from the per-submission figures above.`,
    );
  }
  if (trendClaimable) {
    story.push(
      direction === "flat"
        ? `Spend in ${spanLabel(late)} was ${growth.toFixed(1)}× the first half of the record, while the advertised price per submission held at ${money(earlyPps)} → ${money(latePps)}. Builder supply scaled with demand.`
        : `Advertised price per submission moved ${(ratio * 100 - 100).toFixed(0)}% across the record (${money(earlyPps)} → ${money(latePps)}).`,
    );
  }
  if (topSponsors.length > 0) {
    story.push(
      `Attention is long-tailed: ${count(sponsorUsd.size)} sponsors buy it, and the largest structural buyer holds ${(topSponsors[0].share * 100).toFixed(1)}% of spend.`,
    );
  }
  if (stableListings > 0) {
    story.push(
      `${((stableListings / (stableListings + tokenListings)) * 100).toFixed(0)}% of campaigns are priced in stablecoins; ${tokenListings} pay in their own token, so no dollar figure is claimed for them.`,
    );
  }

  const permalink = `${PUBLIC_BASE}${ATTENTION_PATH}`;
  const edition: Omit<AttentionEdition, "receipt"> = {
    generatedAt: opts.requestedAt ?? now.toISOString(),
    observedAt: opts.observedAt ?? now.toISOString(),
    source,
    window: {
      from: spine[0]?.month ?? nowKey,
      to: spine[spine.length - 1]?.month ?? nowKey,
      completeMonths: complete.length,
    },
    totals: {
      listings: listings.length,
      stableListings,
      tokenListings,
      sponsors: sponsorUsd.size,
      submissions,
      usdRewards,
      usdRewardsCore,
      usdPerSubmissionCore: pricePerSubmission(coreUsd, coreSubs),
    },
    outliers,
    months: spine,
    topSponsors,
    priceTrend: {
      earlyLabel: spanLabel(early),
      lateLabel: spanLabel(late),
      earlyUsdPerSubmission: earlyPps,
      lateUsdPerSubmission: latePps,
      ratio,
      direction,
    },
    headline,
    story,
    permalink,
  };

  const receipt = createEvidenceReceipt({
    issuer: "databard",
    analysis: { report: "attention-market", reportVersion: ATTENTION_REPORT_VERSION },
    generatedAt: edition.generatedAt,
    request: { source: "superteam-earn-listings", url: "https://superteam.fun/api/listings" },
    evidence: {
      kind: "earn-listings",
      delivery: source,
      observedAt: edition.observedAt,
      listings: listings.length,
      outliersExcluded: outliers.length,
      listingsHash: hashEvidence(JSON.parse(JSON.stringify(listings))),
    },
    resultHash: hashEvidence(JSON.parse(JSON.stringify(edition))),
  });

  return { ...edition, receipt };
}

/**
 * Live fetch → computed edition, falling back to the committed snapshot
 * (labelled, with `snapshotAsOf` as the observation time).
 */
export async function loadAttentionEdition(now = new Date()): Promise<AttentionEdition> {
  let loaded: EarnListingsSnapshot;
  try {
    loaded = await loadEarnListings(now);
  } catch {
    throw new Error("Attention market data unavailable (live fetch failed, no snapshot)");
  }
  return computeAttentionEdition(loaded.listings, new Date(loaded.observedAt), {
    source: loaded.source,
    observedAt: loaded.observedAt,
    requestedAt: now.toISOString(),
  });
}
