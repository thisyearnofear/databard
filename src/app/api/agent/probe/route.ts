import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@okxweb3/x402-next";
import { rateLimit, ValidationError } from "@/lib/validation";
import { probeAll, DEFAULT_CANDIDATES, MAX_OUTBOUND_SPEND_USD, type ProbeCandidate } from "@/lib/probe-runner";
import { scoreProbe } from "@/lib/probe-scorer";
import { attestVerdict } from "@/lib/probe-attestation";
import { x402Server, probeRouteConfig, x402Configured, PROBE_PRICE } from "@/lib/x402";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";

/**
 * POST /api/agent/probe — PAID (x402, $1 USDT on X Layer)
 *
 * Probes a set of A2MCP agent-service endpoints, scores each on schema
 * completeness, latency, freshness, price-per-value, reliability, and
 * (optionally) credential verification via Ligis. Returns a ranked verdict
 * and writes the verdict hash to X Layer as an attestation.
 *
 * Body (all fields optional — defaults to the built-in candidate set):
 * {
 *   "question": "I need a reliable on-chain token-price feed",
 *   "candidates": [
 *     { "name": "Doxa", "endpoint": "https://...", "method": "POST", "body": {...} }
 *   ],
 *   "attest": true   // optional: write verdict hash on-chain
 * }
 */
async function probeHandler(req: NextRequest): Promise<NextResponse> {
  try {
    // Rate-limit paid runs per IP to prevent runaway spend and abuse.
    rateLimit(req, { maxRequests: 12, windowMs: 3600000 });

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // Accept candidates from the request, or fall back to the curated default set.
    let candidates: ProbeCandidate[] = DEFAULT_CANDIDATES;
    if (Array.isArray(body.candidates) && body.candidates.length > 0) {
      candidates = (body.candidates as Record<string, unknown>[])
        .filter((c) => typeof c.endpoint === "string" && c.endpoint.startsWith("http"))
        .slice(0, 10) // cap at 10 to bound cost/latency
        .map((c) => ({
          name: typeof c.name === "string" ? c.name : new URL(c.endpoint as string).hostname,
          endpoint: c.endpoint as string,
          discoveryUrl: typeof c.discoveryUrl === "string" ? c.discoveryUrl : undefined,
          method: c.method === "GET" ? ("GET" as const) : ("POST" as const),
          body:
            c.body && typeof c.body === "object" && !Array.isArray(c.body)
              ? (c.body as Record<string, unknown>)
              : undefined,
          knownPriceUsd: typeof c.knownPriceUsd === "number" ? c.knownPriceUsd : null,
          agentId: typeof c.agentId === "string" ? c.agentId : undefined,
          agentAddress: typeof c.agentAddress === "string" ? c.agentAddress : undefined,
        }));
    }

    const question =
      typeof body.question === "string" ? body.question.slice(0, 500) : undefined;
    const shouldAttest = body.attest === true;

    // Run all probes in parallel (concurrency-limited inside probeAll)
    const results = await probeAll(candidates, { allowPayments: true });

    // Score each result
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

    // Rank by total score descending
    scored.sort((a, b) => b.score.total - a.score.total);

    const generatedAt = new Date().toISOString();
    const unreachableCount = scored.filter((s) => !s.reachable).length;
    const paidCount = scored.filter((s) => s.payment?.paid).length;
    const cachedCount = scored.filter((s) => s.fromCache).length;
    const outboundSpend = scored.reduce(
      (sum, s) => sum + (s.payment?.paid ? (s.knownPriceUsd ?? 0) : 0),
      0
    );
    const summary =
      `Probed ${scored.length} service${scored.length === 1 ? "" : "s"}. ` +
      `Top pick: ${scored[0]?.name ?? "n/a"} (${scored[0]?.score.total ?? 0}/100). ` +
      `${unreachableCount} unreachable, ${paidCount} paid, ${cachedCount} cached.`;

    const verdict = {
      question,
      generatedAt,
      ranked: scored.map((s, i) => ({
        rank: i + 1,
        name: s.name,
        endpoint: s.endpoint,
        score: s.score.total,
        label: s.score.label,
      })),
    };

    // Optionally write attestation on-chain
    let attestationTx: string | null = null;
    let attestationError: string | null = null;
    if (shouldAttest) {
      try {
        const att = await attestVerdict(verdict);
        attestationTx = att.txHash;
      } catch (attErr) {
        attestationError = attErr instanceof Error ? attErr.message : "Attestation failed";
        console.warn("[probe] Attestation failed (non-fatal):", attErr);
      }
    }

    void recordEvent("probe_run", {
      candidates: String(candidates.length),
      top: String(scored[0]?.name ?? "none").slice(0, 120),
      attest: shouldAttest ? "yes" : "no",
      paidOutbound: paidCount > 0 ? "yes" : "no",
    });

    return NextResponse.json({
      ok: true,
      tool: "databard.probe",
      serviceVersion: 2,
      generatedAt,
      question,
      summary,
      cost: {
        priceUsd: PROBE_PRICE,
        outboundSpentUsd: Number(outboundSpend.toFixed(4)),
        outboundCapUsd: MAX_OUTBOUND_SPEND_USD,
        cachedCount,
        paidCount,
      },
      attestation: {
        requested: shouldAttest,
        txHash: attestationTx,
        error: attestationError,
      },
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

// When x402 credentials are present, gate the handler behind payment.
// Otherwise surface a loud 503 so the deploy is obviously not ready.
export const POST: (req: NextRequest) => Promise<NextResponse> =
  x402Configured && x402Server
    ? withX402(probeHandler, probeRouteConfig, x402Server)
    : async () =>
        NextResponse.json(
          {
            ok: false,
            error:
              "x402 payment not configured. Set PAY_TO_ADDRESS, OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE to enable the paid Probe endpoint.",
          },
          { status: 503 }
        );
