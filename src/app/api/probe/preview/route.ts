import { NextRequest, NextResponse } from "next/server";
import { rateLimit, ValidationError } from "@/lib/validation";
import { probeAll, DEFAULT_CANDIDATES } from "@/lib/probe-runner";
import { scoreProbe } from "@/lib/probe-scorer";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";

/**
 * POST /api/probe/preview — FREE preview of DataBard Probe.
 *
 * Runs the same probe + score pipeline on the curated default candidate set,
 * but with outbound x402 payments disabled. Paid candidates are still
 * reachable-checked: a 402 challenge is honest evidence the service is live,
 * and it is scored as "requires payment" rather than as an error.
 *
 * This endpoint exists so humans can see the product from the browser without
 * a wallet; agents use the paid endpoint POST /api/agent/probe.
 */
export async function POST(req: NextRequest) {
  try {
    rateLimit(req, { maxRequests: 10, windowMs: 3600000 });

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const question =
      typeof body.question === "string" ? body.question.slice(0, 500) : undefined;

    // Preview never spends: paid candidates may return 402, which is reported honestly.
    const results = await probeAll(DEFAULT_CANDIDATES, { allowPayments: false });

    const scored = results.map((r) => ({
      name: r.candidate.name,
      endpoint: r.candidate.endpoint,
      agentId: r.candidate.agentId,
      knownPriceUsd: r.candidate.knownPriceUsd ?? null,
      score: scoreProbe(r.metrics),
      reachable: r.metrics.reachable,
      error: r.error,
      payment: r.payment ?? null,
      fromCache: r.fromCache ?? false,
    }));

    scored.sort((a, b) => b.score.total - a.score.total);

    const generatedAt = new Date().toISOString();
    const summary =
      `Free preview: probed ${scored.length} services without paying any outbound fees. ` +
      `Top pick: ${scored[0]?.name ?? "n/a"} (${scored[0]?.score.total ?? 0}/100). ` +
      `${scored.filter((s) => !s.reachable).length} unreachable.`;

    void recordEvent("probe_run", {
      mode: "preview",
      candidates: String(scored.length),
      top: String(scored[0]?.name ?? "none").slice(0, 120),
    });

    return NextResponse.json({
      ok: true,
      tool: "databard.probe",
      preview: true,
      serviceVersion: 2,
      generatedAt,
      question,
      summary,
      cost: {
        priceUsd: "free preview",
        outboundSpentUsd: 0,
        outboundCapUsd: 0,
        cachedCount: scored.filter((s) => s.fromCache).length,
        paidCount: 0,
      },
      attestation: { requested: false, txHash: null, error: null },
      ranked: scored.map((s, i) => ({
        rank: i + 1,
        name: s.name,
        endpoint: s.endpoint,
        agentId: s.agentId,
        score: s.score.total,
        label: s.score.label,
        breakdown: s.score.breakdown,
        flags: s.score.flags,
        reachable: s.reachable,
        knownPriceUsd: s.knownPriceUsd,
        error: s.error ?? null,
        payment: s.payment,
        fromCache: s.fromCache,
      })),
    });
  } catch (e) {
    if (e instanceof ValidationError) {
      const status = e.message.startsWith("Rate limit") ? 429 : 400;
      return NextResponse.json({ ok: false, error: e.message }, { status });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
