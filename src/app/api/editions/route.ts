/**
 * GET  /api/editions — list published commissioned editions (public).
 * POST /api/editions — create a payment intent for a sponsor edition.
 *
 * Body: { sponsor } — must resolve (case-insensitively) to a sponsor name
 * present in Earn's listings. Returns the intent id + price for the checkout
 * step; an already-published sponsor returns its permalink instead so nobody
 * pays twice for the same page.
 */
import { NextRequest, NextResponse } from "next/server";
import { createIntent, listPublished, publishedForSponsor, resolveSponsorName, slugifySponsor } from "@/lib/editions";
import { loadEarnListings } from "@/lib/superteam-earn";
import { editionPricePusd } from "@/lib/pusd";

export async function GET() {
  const published = listPublished().map((p) => ({
    slug: p.slug,
    sponsor: p.sponsor,
    publishedAt: p.publishedAt,
    permalink: p.edition.permalink,
    paidBy: p.paidBy,
    txSignature: p.txSignature,
  }));
  return NextResponse.json({ ok: true, published, pricePusd: editionPricePusd() });
}

export async function POST(req: NextRequest) {
  try {
    const { sponsor } = await req.json();
    if (!sponsor || typeof sponsor !== "string") {
      return NextResponse.json({ ok: false, error: "sponsor required" }, { status: 400 });
    }

    const { listings } = await loadEarnListings();
    const canonical = resolveSponsorName(sponsor, listings);
    if (!canonical) {
      return NextResponse.json(
        { ok: false, error: `"${sponsor}" is not a sponsor on Superteam Earn` },
        { status: 404 },
      );
    }

    // UK is our own showcase — it lives at /superteam and is not for sale.
    if (canonical === "Superteam UK") {
      return NextResponse.json({
        ok: true,
        alreadyPublished: true,
        slug: "superteam-uk",
        permalink: `${process.env.NEXT_PUBLIC_URL || "https://databard.persidian.com"}/superteam`,
      });
    }

    const existing = publishedForSponsor(canonical);
    if (existing) {
      return NextResponse.json({
        ok: true,
        alreadyPublished: true,
        slug: existing.slug,
        permalink: existing.edition.permalink,
      });
    }

    const intent = createIntent(canonical);
    return NextResponse.json({
      ok: true,
      intentId: intent.id,
      slug: intent.slug,
      sponsor: canonical,
      pricePusd: intent.pricePusd,
      previewPath: `/earn/${slugifySponsor(canonical)}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
