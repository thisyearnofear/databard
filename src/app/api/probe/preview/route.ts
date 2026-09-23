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
 * Pass {"stream": true} for an NDJSON stream: one "start" line naming the
 * candidates, one "result" line per candidate as its real probe completes,
 * then a "done" line with the full summary. Default remains a single JSON
 * response. Every streamed value comes from the probe pipeline — nothing is
 * simulated client-side or server-side.
 *
 * This endpoint exists so humans can see the product from the browser without
 * a wallet; agents use the paid endpoint POST /api/agent/probe.
 */
interface ScoredCandidate {
  name: string;
  endpoint: string;
  agentId?: string;
  knownPriceUsd: number | null;
  score: ReturnType<typeof scoreProbe>;
  reachable: boolean;
  error: string | null;
  payment: unknown;
  fromCache: boolean;
  /** DataBard's own service — probed for reference, never ranked. */
  reference: boolean;
}

function scoreResult(r: Awaited<ReturnType<typeof probeAll>>[number]): ScoredCandidate {
  return {
    name: r.candidate.name,
    endpoint: r.candidate.endpoint,
    agentId: r.candidate.agentId,
    knownPriceUsd: r.candidate.knownPriceUsd ?? null,
    score: scoreProbe(r.metrics),
    reachable: r.metrics.reachable,
    error: r.error ?? null,
    payment: r.payment ?? null,
    fromCache: r.fromCache ?? false,
    reference: r.candidate.reference === true,
  };
}

function buildSummary(scored: ScoredCandidate[]): string {
  return (
    `Free preview: probed ${scored.length} services without paying any outbound fees. ` +
    `Top pick: ${scored[0]?.name ?? "n/a"} (${scored[0]?.score.total ?? 0}/100). ` +
    `${scored.filter((s) => !s.reachable).length} unreachable.`
  );
}

function rankedPayload(scored: ScoredCandidate[]) {
  return scored.map((s, i) => ({
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
    reference: s.reference,
  }));
}

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

    if (body.stream === true) {
      return streamPreview(question);
    }

    // Preview never spends: paid candidates may return 402, which is reported honestly.
    const results = await probeAll(DEFAULT_CANDIDATES, { allowPayments: false });

    const scored = results.map(scoreResult);
    const ranked = scored.filter((s) => !s.reference);
    const reference = scored.filter((s) => s.reference);
    ranked.sort((a, b) => b.score.total - a.score.total);

    const generatedAt = new Date().toISOString();
    const summary = buildSummary(ranked);

    void recordEvent("probe_run", {
      mode: "preview",
      candidates: String(ranked.length),
      top: String(ranked[0]?.name ?? "none").slice(0, 120),
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
      ranked: rankedPayload(ranked),
      reference: rankedPayload(reference),
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

/**
 * NDJSON stream of a live preview run. Emits:
 *   {"type":"start",  "candidates":[{name,endpoint,knownPriceUsd}]}
 *   {"type":"result", "candidate":{…scored…}}   ← as each probe completes
 *   {"type":"done",   "summary":…, "cost":…, "ranked":[…], "generatedAt":…}
 * Every value comes from the real probe pipeline; the client choreographs the
 * reveal but never invents progress.
 */
async function streamPreview(question: string | undefined): Promise<Response> {
  const encoder = new TextEncoder();
  const scored: ScoredCandidate[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        send({
          type: "start",
          candidates: DEFAULT_CANDIDATES.map((c) => ({
            name: c.name,
            endpoint: c.endpoint,
            knownPriceUsd: c.knownPriceUsd ?? null,
            reference: c.reference === true,
          })),
        });

        await probeAll(DEFAULT_CANDIDATES, {
          allowPayments: false,
          onStage: (endpoint, stage) => {
            send({ type: "stage", endpoint, stage });
          },
          onResult: (result) => {
            const entry = scoreResult(result);
            scored.push(entry);
            send({ type: "result", candidate: entry });
          },
        });

        const sorted = scored.filter((s) => !s.reference).sort((a, b) => b.score.total - a.score.total);
        const reference = scored.filter((s) => s.reference);
        const summary = buildSummary(sorted);

        void recordEvent("probe_run", {
          mode: "preview",
          candidates: String(sorted.length),
          top: String(sorted[0]?.name ?? "none").slice(0, 120),
        });

        send({
          type: "done",
          summary,
          generatedAt: new Date().toISOString(),
          question,
          cost: {
            priceUsd: "free preview",
            outboundSpentUsd: 0,
            outboundCapUsd: 0,
            cachedCount: scored.filter((s) => s.fromCache).length,
            paidCount: 0,
          },
          ranked: rankedPayload(sorted),
          reference: rankedPayload(reference),
        });
      } catch (failure) {
        send({
          type: "error",
          error:
            failure instanceof Error
              ? failure.message
              : "The service check could not be completed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
