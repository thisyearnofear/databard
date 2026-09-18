/**
 * Commissioned editions — pay-per-publish public accounting pages.
 *
 * A commissioned edition is a pinned, attested `EarnEdition` spotlighting one
 * Earn sponsor, published at `/earn/[slug]`. The preview is free and live —
 * what PUSD buys is the durable public object: a pinned snapshot, an evidence
 * receipt, an OG card, a permalink, and "commissioned by" attribution.
 *
 * Lifecycle: POST /api/editions → intent → PUSD transfer → verify → publish.
 * One published edition per sponsor name; republishing is a no-op so a sponsor
 * can never be double-charged for the same page.
 */
import { randomBytes } from "crypto";
import { store } from "@/lib/store";
import { editionPricePusd } from "@/lib/pusd";
import {
  loadEarnEdition,
  loadEarnListings,
  sponsorFocus,
  type EarnEdition,
  type EarnListing,
} from "@/lib/superteam-earn";

const INTENT_PREFIX = "edition:intent:";
const INTENT_TTL_SECONDS = 86400 * 7;
const PUB_PREFIX = "edition:pub:";
const SPONSOR_PREFIX = "edition:sponsor:";
const PUB_TTL_SECONDS = 86400 * 365 * 5; // published pages are durable artifacts

export interface EditionIntent {
  id: string;
  sponsor: string;
  slug: string;
  pricePusd: number;
  createdAt: string;
}

export interface PublishedEdition {
  slug: string;
  sponsor: string;
  paidBy: string;
  txSignature: string;
  pricePusd: number;
  publishedAt: string;
  /** The pinned computation — the published page renders this, not live data. */
  edition: EarnEdition;
}

export function slugifySponsor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Distinct sponsor names present in a listing set, canonical casing preserved. */
export function sponsorNames(listings: EarnListing[]): string[] {
  const seen = new Map<string, string>();
  for (const l of listings) {
    const raw = l.sponsor?.name?.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!seen.has(key)) seen.set(key, raw);
  }
  return [...seen.values()];
}

/**
 * Resolve user input to the canonical sponsor name present in the data —
 * case-insensitive exact match only, so "superteam nigeria" resolves but
 * "superteam nig" never invents a page.
 */
export function resolveSponsorName(input: string, listings: EarnListing[]): string | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  return sponsorNames(listings).find((n) => n.toLowerCase() === q) ?? null;
}

/** Slug → canonical sponsor name, or null. Published editions resolve first. */
export async function sponsorForSlug(
  slug: string,
  listings: EarnListing[],
): Promise<{ name: string; published: PublishedEdition | null } | null> {
  const published = getPublished(slug);
  if (published) return { name: published.sponsor, published };
  const name = sponsorNames(listings).find((n) => slugifySponsor(n) === slug) ?? null;
  return name ? { name, published: null } : null;
}

export function getIntent(id: string): EditionIntent | null {
  return store.get<EditionIntent>(`${INTENT_PREFIX}${id}`);
}

/**
 * Create (or reuse) a payment intent for a sponsor. Validation is the
 * caller's job — pass the canonical name from `resolveSponsorName`.
 */
export function createIntent(sponsor: string): EditionIntent {
  const slug = slugifySponsor(sponsor);
  const existing = store.keys(INTENT_PREFIX)
    .map((k) => store.get<EditionIntent>(k))
    .find((i): i is EditionIntent => i !== null && i.slug === slug);
  if (existing) return existing;
  const intent: EditionIntent = {
    id: `int_${randomBytes(6).toString("hex")}`,
    sponsor,
    slug,
    pricePusd: editionPricePusd(),
    createdAt: new Date().toISOString(),
  };
  store.set(`${INTENT_PREFIX}${intent.id}`, intent, INTENT_TTL_SECONDS);
  return intent;
}

export function getPublished(slug: string): PublishedEdition | null {
  return store.get<PublishedEdition>(`${PUB_PREFIX}${slug}`);
}

export function publishedForSponsor(sponsor: string): PublishedEdition | null {
  const slug = store.get<string>(`${SPONSOR_PREFIX}${sponsor.toLowerCase()}`);
  return slug ? getPublished(slug) : null;
}

export function listPublished(): PublishedEdition[] {
  return store
    .keys(PUB_PREFIX)
    .map((k) => store.get<PublishedEdition>(k))
    .filter((p): p is PublishedEdition => p !== null)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * Pin the computation and publish. Computes a fresh edition at publish time so
 * the page, receipt, and share copy all describe one consistent snapshot —
 * `opts.edition` injects it (tests, retries).
 */
export async function publishEdition(
  intent: EditionIntent,
  payment: { walletAddress: string; txSignature: string },
  opts: { edition?: EarnEdition } = {},
): Promise<PublishedEdition> {
  const existing = publishedForSponsor(intent.sponsor);
  if (existing) return existing;
  const edition =
    opts.edition ??
    (await loadEarnEdition(new Date(), sponsorFocus(intent.sponsor, `/earn/${intent.slug}`)));
  const published: PublishedEdition = {
    slug: intent.slug,
    sponsor: intent.sponsor,
    paidBy: payment.walletAddress,
    txSignature: payment.txSignature,
    pricePusd: intent.pricePusd,
    publishedAt: new Date().toISOString(),
    edition,
  };
  store.set(`${PUB_PREFIX}${intent.slug}`, published, PUB_TTL_SECONDS);
  store.set(`${SPONSOR_PREFIX}${intent.sponsor.toLowerCase()}`, intent.slug, PUB_TTL_SECONDS);
  return published;
}
