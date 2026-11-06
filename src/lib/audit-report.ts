/**
 * Audit report generator (Shipyard `databard_health_*` ladder).
 * Joins the buyer's internal-data findings with Tavily-researched category
 * benchmarks. Honest by construction: anything not measured is marked
 * "not assessed", never fabricated.
 */
import type { AuditOrder } from "./audit-orders";

export interface Benchmark {
  metric: string;
  claim: string;
  source: string;
}

export interface AuditReport {
  kind: "databard-health-audit";
  sku: string;
  plan: string;
  orderRef: string; // checkout session id — the receipt
  generatedAt: string;
  category: string | null;
  score: number | null; // null = not assessed (internal data not supplied)
  findings: string[];
  benchmarks: Benchmark[];
  actions: string[]; // ranked 3-step plan (plus/operator)
  caveats: string[];
}

interface InternalFindings {
  score?: number;
  findings?: string[];
}

/** One Tavily search for published category benchmarks; empty without a key. */
async function fetchBenchmarks(category: string): Promise<Benchmark[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: `${category} ecommerce benchmark conversion rate CAC review rate 2026`,
        max_results: 4,
        search_depth: "basic",
        include_answer: false,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (data.results ?? [])
      .filter((r) => r.url && r.content)
      .slice(0, 4)
      .map((r) => ({
        metric: r.title ?? "benchmark",
        claim: (r.content ?? "").slice(0, 280),
        source: r.url!,
      }));
  } catch {
    return [];
  }
}

function actionsFor(findings: string[], benchmarks: Benchmark[]): string[] {
  const out: string[] = [];
  if (findings[0]) out.push(`Fix the top finding first: ${findings[0].replace(/\.$/, "")}.`);
  if (benchmarks.length) out.push("Re-baseline the gap metric against the category norms cited below — decide win share vs cut cost from the delta, not vibes.");
  out.push("Re-run the audit after the fix ships; deltas over vanity scores.");
  return out.slice(0, 3);
}

export async function generateAuditReport(opts: {
  order: Pick<AuditOrder, "sessionId" | "sku" | "plan">;
  category?: string | null;
  internal?: InternalFindings | null;
}): Promise<AuditReport> {
  const { order, category = null, internal = null } = opts;
  const benchmarks = category ? await fetchBenchmarks(category) : [];
  const findings = internal?.findings?.length ? internal.findings : [];
  const caveats: string[] = [];
  if (!internal?.score && internal?.score !== 0) caveats.push("Internal data not supplied with this order — score not assessed.");
  if (!category) caveats.push("No category supplied — benchmarks not researched.");
  if (category && benchmarks.length === 0) caveats.push("Benchmark research returned no usable sources for this category.");

  return {
    kind: "databard-health-audit",
    sku: order.sku,
    plan: order.plan,
    orderRef: order.sessionId,
    generatedAt: new Date().toISOString(),
    category,
    score: internal?.score ?? null,
    findings,
    benchmarks: order.sku === "snapshot" ? benchmarks.slice(0, 1) : benchmarks,
    actions: order.sku === "snapshot" ? [] : actionsFor(findings, benchmarks),
    caveats,
  };
}
