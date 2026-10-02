import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { probeAll, DEFAULT_CANDIDATES } from "@/lib/probe-runner";
import {
  scoreResult,
  buildSummary,
  rankedPayload,
  appendVerdict,
  type PublishedVerdict,
} from "@/lib/probe-verdicts";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/probe/verdicts/refresh — publish a Probe verdict (weekly cron).
 *
 * Auth: x-cron-secret must match CRON_SECRET; fails closed (503) when unset.
 *
 * Runs the free preview pipeline over the curated DEFAULT_CANDIDATES — never
 * user-supplied candidates, so nothing private can be published. Publishes
 * only on a clean run (the probe completed and at least half the set
 * answered); a garbage sweep of an outage morning withholds instead of
 * publishing "everything is down" as content.
 *
 * Query params:
 *   ?q=… — optional framing question stored with the verdict (≤500 chars)
 *
 * Synchronous by design: the cron caller (curl from 127.0.0.1) waits.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: "Verdict publish not configured — set CRON_SECRET" },
      { status: 503 },
    );
  }
  if (req.headers.get("x-cron-secret") !== cronSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const question = req.nextUrl.searchParams.get("q")?.slice(0, 500) ?? null;

  try {
    const results = await probeAll(DEFAULT_CANDIDATES, { allowPayments: false });
    const scored = results.map(scoreResult);
    const ranked = scored
      .filter((s) => !s.reference)
      .sort((a, b) => b.score.total - a.score.total);
    const reference = scored.filter((s) => s.reference);
    const reachable = ranked.filter((s) => s.reachable).length;

    // Clean-run gate: a majority-unreachable sweep is an outage report, not a
    // verdict — withhold it rather than publishing noise.
    if (ranked.length === 0 || reachable < Math.ceil(ranked.length / 2)) {
      return NextResponse.json(
        {
          ok: false,
          error: "run not clean — verdict withheld",
          candidates: ranked.length,
          reachable,
        },
        { status: 502 },
      );
    }

    const generatedAt = new Date().toISOString();
    const verdict: PublishedVerdict = {
      id: `${generatedAt.slice(0, 10)}-${randomUUID().slice(0, 8)}`,
      question,
      summary: buildSummary(ranked),
      generatedAt,
      candidates: ranked.length,
      topPick: ranked[0]?.name ?? null,
      cost: {
        priceUsd: "free preview",
        outboundSpentUsd: 0,
        cachedCount: scored.filter((s) => s.fromCache).length,
        paidCount: 0,
      },
      ranked: rankedPayload(ranked),
      reference: rankedPayload(reference),
    };

    await appendVerdict(verdict);
    void recordEvent("verdict_publish", {
      candidates: String(ranked.length),
      top: String(verdict.topPick ?? "none").slice(0, 120),
    });

    return NextResponse.json({
      ok: true,
      verdict: {
        id: verdict.id,
        generatedAt,
        candidates: verdict.candidates,
        topPick: verdict.topPick,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
