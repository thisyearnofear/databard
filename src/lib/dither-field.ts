/**
 * Deterministic helpers for the hero dither landscape.
 *
 * The landscape is grown from the dataset, not decorated onto the page: the
 * terrain silhouette is the monthly listing series and every pixel decision
 * is a pure function of (x, y, seed). Same data → same landscape, on every
 * load, in every browser. That is the brand premise (reproducible, checkable)
 * rendered as the visual system.
 */
import type { EarnListing, RaceSeries } from "./superteam-earn";

/** Classic sin-hash → [0,1). Deterministic per (x, y, seed); no state. */
export function hash01(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 0.6180339887) * 43758.5453;
  return n - Math.floor(n);
}

/** mulberry32 PRNG — seeded, reproducible sequence for ambient choices. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → uint32, for turning an observedAt + series into a seed. */
export function seedFromString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The terrain series: listings per closing month for the 12 calendar months
 * ending in `now`'s month. Mirrors the race chart's bucketing (deadline
 * month, not announcement date) so the landscape and the evidence tell the
 * same story. Listings without a usable deadline are excluded.
 */
export function buildEarnSeries(listings: EarnListing[], now: Date, months = 12): number[] {
  const series = new Array<number>(months).fill(0);
  for (const listing of listings) {
    if (!listing.deadline) continue;
    const t = Date.parse(listing.deadline);
    if (!Number.isFinite(t)) continue;
    const d = new Date(t);
    const monthIndex =
      (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + (now.getUTCMonth() - d.getUTCMonth());
    const slot = months - 1 - monthIndex;
    if (slot >= 0 && slot < months) series[slot] += 1;
  }
  return series;
}

/**
 * One organization's own terrain: its cumulative race trace converted to
 * monthly counts. A report page grows the landscape of *its* subject — the
 * field becomes a visual fingerprint of that organization's data.
 */
export function focusSeriesFromRace(race: RaceSeries, focusName: string): number[] {
  let prev = 0;
  const out: number[] = [];
  for (const row of race.rows) {
    const raw = Number(row[focusName]);
    const cum = Number.isFinite(raw) ? raw : prev;
    out.push(Math.max(cum - prev, 0));
    prev = cum;
  }
  return out;
}

/**
 * Terrain of the marketplace index: every scored service is a ridge column,
 * at its composite score height. Unverified services have no score and read
 * as low ground. The index is stored score-descending, so the silhouette is
 * the market's ranking — the same evidence the index page tabulates.
 */
export function buildMarketplaceSeries(
  services: ReadonlyArray<{ score: number | null }>,
  target = 24,
): number[] | null {
  if (services.length < 2) return null;
  const step = Math.max(1, Math.floor(services.length / target));
  const out: number[] = [];
  for (let i = 0; i < services.length; i += step) {
    out.push(services[i].score ?? 0);
  }
  return out.some((v) => v > 0) ? out : null;
}
