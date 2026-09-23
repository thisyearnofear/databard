import { NextRequest, NextResponse } from "next/server";
import { ValidationError, rateLimit } from "@/lib/validation";
import {
  getLatestIndex,
  findServices,
  findAlternatives,
  type IndexedService,
} from "@/lib/marketplace-index";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";

/**
 * A2MCP tool — `databard_service_score` (FREE).
 *
 * Look up a marketplace service's DataBard Probe score before paying it.
 * Input is deliberately lenient (same posture as the other A2MCP tools):
 * envelopes are unwrapped and common aliases accepted —
 *   {agentId}, {serviceId}, {endpoint|url}, {query|q|question}.
 * Never returns 400 for a missing/misnamed param — a lookup that finds
 * nothing answers 200 with verdict "unknown" plus a usage hint.
 */

const PUBLIC_BASE = (process.env.NEXT_PUBLIC_URL || "https://databard.persidian.com").replace(/\/$/, "");

const ENVELOPE_KEYS = ["arguments", "input", "params", "data", "payload", "tool_input", "toolInput"] as const;
const KNOWN_KEYS = new Set([
  "agentId", "agent_id", "agent", "id",
  "serviceId", "service_id", "service",
  "endpoint", "url",
  "query", "q", "question",
  ...ENVELOPE_KEYS,
]);

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function parseLookup(body: unknown): {
  agentId?: string;
  serviceId?: string;
  endpoint?: string;
  query?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  let record = body as Record<string, unknown>;
  const hasKnown = Object.keys(record).some(
    (k) => KNOWN_KEYS.has(k) && !(ENVELOPE_KEYS as readonly string[]).includes(k),
  );
  if (!hasKnown) {
    for (const env of ENVELOPE_KEYS) {
      const inner = record[env];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        record = { ...(inner as Record<string, unknown>), ...record };
        break;
      }
      if (typeof inner === "string" && inner.trim()) {
        record = { query: inner.trim(), ...record };
        break;
      }
    }
  }
  return {
    agentId: firstString(record, ["agentId", "agent_id", "agent", "id"]),
    serviceId: firstString(record, ["serviceId", "service_id"]),
    endpoint: firstString(record, ["endpoint", "url"]),
    query: firstString(record, ["query", "q", "question"]),
  };
}

type Verdict = "safe_to_pay" | "caution" | "avoid" | "unknown";

function verdictFor(svc: IndexedService): Verdict {
  if (svc.status === "unverified") return "unknown";
  if (svc.status === "broken" || svc.status === "unreachable") return "avoid";
  if (svc.status === "healthy" && svc.verification === "delivered") return "safe_to_pay";
  return "caution"; // healthy gate-only, or degraded
}

function shape(svc: IndexedService) {
  return {
    verification: svc.verification ?? "none",
    paid: svc.paid ?? false,
    serviceId: svc.serviceId,
    agentId: svc.agentId,
    agentName: svc.agentName,
    serviceName: svc.serviceName,
    endpoint: svc.endpoint,
    feeUsd: svc.feeUsd,
    score: svc.score,
    status: svc.status,
    flags: svc.flags,
    checks: svc.checks,
    subScores: svc.subScores ?? null,
    uptimePct: svc.uptimePct ?? null,
    lastPaidVerification: svc.lastPaidVerification ?? null,
    onchain: process.env.PROBE_REGISTRY_ADDRESS
      ? {
          registry: process.env.PROBE_REGISTRY_ADDRESS,
          serviceId: svc.serviceId,
          hint: `Read it yourself: scoreOf(${svc.serviceId}) on ProbeVerdictRegistry (X Layer eip155:196)`,
        }
      : null,
    badgeUrl: `${PUBLIC_BASE}/api/probe/badge/${svc.serviceId}`,
    pageUrl: `${PUBLIC_BASE}/probe/marketplace/${svc.serviceId}`,
  };
}



export async function POST(req: NextRequest) {
  try {
    // Same posture as health-check — the lookup reads a persisted index.
    rateLimit(req, { maxRequests: 60, windowMs: 3600000 });

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const q = parseLookup(body);

    const index = await getLatestIndex();
    const base = {
      ok: true,
      tool: "databard.service_score",
      indexGeneratedAt: index?.generatedAt ?? null,
    };

    if (!index) {
      return NextResponse.json({
        ...base,
        matches: [],
        verdict: "unknown" as Verdict,
        keyFindings: ["No marketplace index has been generated yet."],
        nextStep:
          "Check back shortly — the index refreshes on a schedule. The probe preview at POST /api/probe/preview still works.",
        alternatives: [],
      });
    }

    const found = findServices(index, q);
    const primary = found[0];

    if (!primary) {
      void recordEvent("service_score_lookup", { hit: "no" });
      return NextResponse.json({
        ...base,
        matches: [],
        verdict: "unknown" as Verdict,
        keyFindings: [
          "No indexed service matched. Accepted params: agentId (e.g. \"2023\"), serviceId, endpoint/url, or query/q/question keywords.",
        ],
        nextStep:
          "Retry with the service's agentId, endpoint URL, or a keyword like \"token security\" — or browse the index at GET /api/probe/marketplace.",
        alternatives: findAlternatives(index, undefined, q.query).map((s) => ({
          agentId: s.agentId,
          serviceName: s.serviceName,
          score: s.score,
          status: s.status,
          feeUsd: s.feeUsd,
        })),
      });
    }

    const verdict = verdictFor(primary);
    const keyFindings: string[] = [
      `${primary.agentName} — ${primary.serviceName}: ${primary.score}/100 (${primary.status}) as of ${index.generatedAt}.`,
    ];
    if (primary.feeUsd > 0 && primary.checks.paymentIntegrity) {
      keyFindings.push(`Payment integrity: ${primary.checks.paymentIntegrity.detail}.`);
    }
    for (const flag of primary.flags.slice(0, 3)) keyFindings.push(flag);
    const lastPaid = primary.lastPaidVerification;
    if (lastPaid?.delivered) {
      keyFindings.push(
        `Paid verification: a real $${lastPaid.amountUsd ?? primary.feeUsd} payment was made and the service delivered (HTTP ${lastPaid.status}).`,
      );
    } else if (lastPaid) {
      keyFindings.push(
        `Paid verification on ${lastPaid.at.slice(0, 10)}: payment signed but the service did not deliver a substantive payload${lastPaid.status ? ` (HTTP ${lastPaid.status})` : ""}.`,
      );
    } else if (primary.verification === "gate" && primary.feeUsd > 0) {
      keyFindings.push(
        "Payment gate verified, delivery not yet verified — the x402 challenge checks out but paid output was not measured.",
      );
    }

    const nextStep =
      verdict === "safe_to_pay"
        ? `Safe to pay: ${primary.endpoint} ($${primary.feeUsd}/call) — the payment gate and listed price check out${
            lastPaid?.delivered ? ", and a real paid call was delivered" : ""
          }.`
        : verdict === "caution"
          ? `Proceed with caution: ${primary.endpoint} — ${
              primary.verification === "gate"
                ? "payment gate verified, delivery not yet verified"
                : `answered but had flag(s): ${primary.flags[0] ?? "partial checks"}`
            }.`
        : verdict === "unknown"
          ? `Unverified: ${primary.endpoint} answered but we could not verify its payment gate or delivery — ${primary.flags[0] ?? "no input contract discovered"}.`
          : `Avoid for now: ${primary.endpoint} scored ${primary.score}/100 (${primary.status}) — ${primary.flags[0] ?? "failing checks"}.`;

    void recordEvent("service_score_lookup", {
      hit: "yes",
      verdict,
      agentId: primary.agentId.slice(0, 20),
    });

    return NextResponse.json({
      ...base,
      matches: found.slice(0, 5).map(shape),
      verdict,
      keyFindings,
      nextStep,
      alternatives: findAlternatives(index, primary, q.query).map(shape),
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
