import { NextRequest, NextResponse } from "next/server";
import { runIndex, MARKETPLACE_SERVICES } from "@/lib/marketplace-index";

export const runtime = "nodejs";
// A full pass checks every listing serially-batched (concurrency 10) — allow
// the function enough headroom on hosts that respect maxDuration.
export const maxDuration = 300;

/**
 * POST /api/probe/marketplace/refresh — run a marketplace health pass.
 *
 * Auth: same cron-secret pattern as /api/schedules/run — the x-cron-secret
 * header must match CRON_SECRET, and the route fails closed (503) when the
 * env var is unset. This run makes one UNPAID request per listed endpoint;
 * it never pays unless deepBudget is passed.
 *
 * Query params:
 *   ?attest=1        — anchor the run verdict hash on X Layer (costs gas)
 *   ?deepBudget=0.1  — USD cap for paid deep checks on ≤$0.02 services (max 0.25)
 *   ?dryRun=1        — report what would run without checking anything
 *
 * Synchronous by design: the cron caller (curl from 127.0.0.1) waits.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: "Marketplace index refresh not configured — set CRON_SECRET" },
      { status: 503 },
    );
  }
  if (req.headers.get("x-cron-secret") !== cronSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const dryRun = params.get("dryRun") === "1";
  const attest = params.get("attest") === "1";
  const deepBudgetUsd = Math.min(
    Math.max(Number(params.get("deepBudget") ?? 0) || 0, 0),
    0.25,
  );

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      wouldCheck: MARKETPLACE_SERVICES.length,
      deepBudgetUsd,
      attest,
    });
  }

  const startedAt = Date.now();
  const index = await runIndex({ deepBudgetUsd, attest });
  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    generatedAt: index.generatedAt,
    aggregates: index.aggregates,
    attestation: index.attestation ?? null,
  });
}
