/**
 * POST /api/checkout/palmusd/verify
 * Verifies a Palm USD payment on-chain, then activates whatever was paid for:
 *
 *   purpose=pro     → Pro access for the paying wallet
 *   purpose=edition → publishes the commissioned edition page, returns its permalink
 *
 * Verification is strict (settlement/backends/pusd.ts): the tx must succeed,
 * pay the treasury, be funded by the claiming wallet, and move at least the
 * expected amount of the PUSD mint — measured from token balances. A verified
 * signature is then claimed exactly once (claimPusdSignature) so one payment
 * can never activate two things.
 *
 * Body: { walletAddress, txSignature, purpose?: "pro" | "edition", editionId?,
 *        method?: "pusd" | "usdc" | "sol", quoteId? }
 * For method=sol, quoteId names the server-locked price quote from checkout —
 * the expected lamports come from that record, never from the client.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getBackend } from "@/lib/settlement";
import { serial } from "@/lib/serial-queue";
import {
  claimPusdSignature,
  releasePusdSignature,
  getSolQuote,
  quoteMatches,
  priceFor,
  pusdMint,
  pusdNetwork,
  pusdTreasury,
  usdcMint,
  type PaymentMethod,
  type SolQuote,
} from "@/lib/pusd";
import { getIntent, getPublished, publishEdition, type PublishedEdition } from "@/lib/editions";

type EditionPaymentDetails = NonNullable<PublishedEdition["payment"]>;

function invalidateEditionPaths(slug: string): void {
  try {
    revalidatePath("/earn");
    revalidatePath(`/earn/${slug}`);
    revalidatePath(`/api/og/earn/${slug}`);
  } catch { }
}

function quoteWindow(quote: SolQuote): { expectedAfter: number; expectedBefore: number } {
  const created = Date.parse(quote.createdAt);
  const expires = Date.parse(
    quote.expiresAt ?? new Date(created + 600_000).toISOString(),
  );
  return {
    expectedAfter: Math.floor(created / 1000) - 30,
    expectedBefore: Math.floor(expires / 1000),
  };
}

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, txSignature, purpose = "pro", editionId, method = "pusd", quoteId } =
      await req.json();
    if (!walletAddress || !txSignature) {
      return NextResponse.json(
        { ok: false, error: "walletAddress and txSignature required" },
        { status: 400 },
      );
    }
    if (purpose !== "pro" && purpose !== "edition") {
      return NextResponse.json({ ok: false, error: "purpose must be 'pro' or 'edition'" }, { status: 400 });
    }
    if (!["pusd", "usdc", "sol"].includes(method)) {
      return NextResponse.json(
        { ok: false, error: "method must be 'pusd', 'usdc' or 'sol'" },
        { status: 400 },
      );
    }

    const treasury = pusdTreasury();
    if (!treasury) {
      return NextResponse.json({ ok: false, error: "Payments are not configured yet" }, { status: 503 });
    }

    // Resolve what this payment is supposed to buy — server-side, so the
    // expected amount comes from our pricing, not the caller.
    const intent = purpose === "edition" ? (editionId ? getIntent(editionId) : null) : null;
    if (purpose === "edition" && !intent) {
      return NextResponse.json({ ok: false, error: "Unknown or expired edition intent" }, { status: 400 });
    }

    // Idempotent: an already-published edition verifies as success regardless
    // of which tx signature the client resubmits.
    if (intent) {
      const existing = getPublished(intent.slug);
      if (existing) {
        invalidateEditionPaths(existing.slug);
        return NextResponse.json({
          ok: true,
          message: `Edition already published — ${existing.sponsor}`,
          txSignature: existing.txSignature,
          permalink: existing.edition.permalink,
          slug: existing.slug,
        });
      }
    }
    const expectedUsd = intent ? intent.pricePusd : priceFor("pro");

    let backendId: "pusd" | "sol" = "pusd";
    let expectedAmount: number;
    let expectedMint: string | undefined;
    let expectedAfter: number | undefined;
    let expectedBefore: number | undefined;
    if (method === "sol") {
      // Expected lamports come from the server-locked quote — never the client.
      const quote = quoteId ? getSolQuote(quoteId) : null;
      if (!quote || !quoteMatches(quote, { walletAddress, purpose, intentId: intent?.id ?? null })) {
        return NextResponse.json(
          { ok: false, error: "Payment quote unavailable. Keep your transaction reference; do not pay again." },
          { status: 400 },
        );
      }
      backendId = "sol";
      expectedAmount = quote.lamports;
      const window = quoteWindow(quote);
      expectedAfter = window.expectedAfter;
      expectedBefore = window.expectedBefore;
      if (!Number.isFinite(expectedAfter) || !Number.isFinite(expectedBefore)) {
        return NextResponse.json(
          { ok: false, error: "Payment quote unavailable. Keep your transaction reference; do not pay again." },
          { status: 400 },
        );
      }
    } else {
      expectedAmount = Math.round(expectedUsd * 1e6);
      expectedMint = method === "usdc" ? usdcMint().toBase58() : pusdMint().toBase58();
    }

    const backend = getBackend(backendId);
    const result = await backend.verify({
      reference: txSignature,
      expectedRecipient: treasury.toBase58(),
      expectedPayer: walletAddress,
      expectedMint,
      expectedAmount,
      expectedAfter,
      expectedBefore,
    });
    if (result.status !== "verified") {
      return NextResponse.json({ ok: false, error: result.detail ?? result.status }, { status: 400 });
    }

    let details: EditionPaymentDetails | undefined;
    if (intent) {
      if (!result.settledAmount || !/^\d+$/.test(result.settledAmount)) {
        throw new Error("settled amount unavailable");
      }
      details = {
        method: method as PaymentMethod,
        amountBaseUnits: result.settledAmount,
        decimals: method === "sol" ? 9 : 6,
        network: pusdNetwork(),
      };
    }

    return await serial(`pusd:verify:${txSignature}`, async () => {
      // One signature funds one thing — claimed before any activation so a
      // replayed verify can never double-grant.
      const claim = claimPusdSignature(txSignature, {
        purpose,
        reference: intent?.id ?? walletAddress,
      });
      let claimedHere = false;
      if (!claim.ok) {
        const expectedReference = intent?.id ?? walletAddress;
        if (
          claim.alreadySpentOn.purpose !== purpose ||
          claim.alreadySpentOn.reference !== expectedReference
        ) {
          return NextResponse.json(
            { ok: false, error: `This payment already activated ${claim.alreadySpentOn.purpose} (${claim.alreadySpentOn.reference})` },
            { status: 409 },
          );
        }
      } else {
        claimedHere = true;
      }

      // If publish throws, the signature never activated anything — release
      // the claim so the payer can retry verify without burning the payment.
      try {
        if (intent) {
          const published = await publishEdition(intent, { walletAddress, txSignature, details });
          invalidateEditionPaths(published.slug);
          return NextResponse.json({
            ok: true,
            message: `Edition published — ${published.sponsor}`,
            txSignature,
            explorerUrl: result.explorerUrl,
            permalink: published.edition.permalink,
            slug: published.slug,
          });
        }
        await backend.activate?.(walletAddress, { reference: txSignature });
        return NextResponse.json({
          ok: true,
          message: "Pro access activated via Palm USD payment",
          txSignature,
          explorerUrl: result.explorerUrl,
        });
      } catch (e) {
        if (claimedHere) releasePusdSignature(txSignature);
        throw e;
      }
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Verification failed — keep your transaction reference and retry." },
      { status: 500 },
    );
  }
}
