import fs from "node:fs/promises";
import { getDataPath } from "./data-dir";
import { serial } from "./serial-queue";
import type { probeAll, ProbePayment } from "./probe-runner";
import { scoreProbe } from "./probe-scorer";

/**
 * Published Probe verdicts — the "Wirecutter for agent services" artifact.
 *
 * A verdict is one full preview-pipeline run over the curated
 * DEFAULT_CANDIDATES set, persisted to a rolling JSON window. The only writer
 * is the cron-gated /api/probe/verdicts/refresh route — it always probes the
 * built-in default list, so nothing a user submits can be published. Surfaced
 * publicly at /probe/verdicts; each publish emits a `verdict_publish` event.
 */

export interface ScoredCandidate {
  name: string;
  endpoint: string;
  agentId?: string;
  knownPriceUsd: number | null;
  score: ReturnType<typeof scoreProbe>;
  reachable: boolean;
  error: string | null;
  payment: ProbePayment | null;
  fromCache: boolean;
  /** DataBard's own service — probed for reference, never ranked. */
  reference: boolean;
}

export function scoreResult(r: Awaited<ReturnType<typeof probeAll>>[number]): ScoredCandidate {
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

export function buildSummary(scored: ScoredCandidate[]): string {
  return (
    `Probed ${scored.length} services without paying any outbound fees. ` +
    `Top pick: ${scored[0]?.name ?? "n/a"} (${scored[0]?.score.total ?? 0}/100). ` +
    `${scored.filter((s) => !s.reachable).length} unreachable.`
  );
}

export function rankedPayload(scored: ScoredCandidate[]) {
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

export interface PublishedVerdict {
  id: string;
  question: string | null;
  summary: string;
  generatedAt: string;
  candidates: number;
  topPick: string | null;
  cost: {
    priceUsd: string;
    outboundSpentUsd: number;
    cachedCount: number;
    paidCount: number;
  };
  ranked: ReturnType<typeof rankedPayload>;
  reference: ReturnType<typeof rankedPayload>;
}

const VERDICTS_FILE = getDataPath("probe-verdicts.json");
const MAX_VERDICTS = 50;

function isVerdict(v: unknown): v is PublishedVerdict {
  const o = v as PublishedVerdict;
  return Boolean(
    o && typeof o.id === "string" && typeof o.generatedAt === "string" && Array.isArray(o.ranked),
  );
}

export async function loadVerdicts(): Promise<PublishedVerdict[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(VERDICTS_FILE, "utf-8"));
    return Array.isArray(parsed) ? parsed.filter(isVerdict) : [];
  } catch {
    return [];
  }
}

export async function appendVerdict(verdict: PublishedVerdict): Promise<PublishedVerdict[]> {
  return serial("probe-verdicts", async () => {
    const existing = await loadVerdicts();
    const next = [verdict, ...existing].slice(0, MAX_VERDICTS);
    await fs.writeFile(VERDICTS_FILE, JSON.stringify(next), "utf-8");
    return next;
  });
}
