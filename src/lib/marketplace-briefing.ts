/**
 * Marketplace Briefing — the paid `databard_briefing` tool's default mode.
 *
 * Deterministic (no LLM): reads the persisted marketplace health index plus
 * run history and turns it into a scoped or whole-marketplace briefing —
 * summary, key findings, per-service recommendations, a two-speaker script,
 * and (optionally) narrated audio through the same TTS/persist path as the
 * schema briefing.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataPath } from "./data-dir";
import {
  findAlternatives,
  findServices,
  getMarketplaceHistory,
  type HistoryRun,
  type IndexedService,
  type MarketplaceIndex,
} from "./marketplace-index";
import { synthesizeEpisode } from "./audio-engine";
import type { ScriptSegment } from "./types";

const PUBLIC_BASE = (process.env.NEXT_PUBLIC_URL || "https://databard.persidian.com").replace(/\/$/, "");
const BRIEFING_FILE = path.join(getDataPath("marketplace-index"), "latest-briefing.json");
/** Daily cadence for the cron-driven whole-marketplace briefing. */
const BRIEFING_MAX_AGE_MS = 20 * 3600_000;
const SCOPED_CAP = 5;
const ALTERNATIVE_CAP = 2;
/** A healthy alternative this many points above a service → "switch". */
const SWITCH_MARGIN = 15;

// ── Input parsing ──────────────────────────────────────────────────────────

const ENVELOPE_KEYS = ["arguments", "input", "params", "data", "payload", "tool_input", "toolInput"] as const;

/** Keys that mean the caller wants the legacy schema-briefing path. The
    marketplace keys (agentIds/serviceIds/endpoints/query/mode/audio/demo)
    are deliberately absent — `{demo:true}` alone is marketplace mode. */
const SCHEMA_INTENT_KEYS = new Set([
  "source",
  "schemaFqn", "schema_fqn", "schema", "fqn", "dataset", "table", "tableFqn",
  "openmetadata", "datahub",
  "dbtCloud", "dbt_cloud", "dbtLocal", "dbt_local",
  "theGraph", "the_graph", "dune", "coral", "monid",
  "url", "token",
  "outputFormat", "output_format",
]);

export interface BriefingRequest {
  mode: "marketplace" | "schema";
  audio: "inline" | "url" | "none";
  demo: boolean;
  /** Scoped briefings only: re-verify the named services live before
      briefing (default true — fresh evidence is the paid value; false
      forces the cached index). Whole-marketplace calls always use cache. */
  fresh: boolean;
  agentIds: string[];
  serviceIds: string[];
  endpoints: string[];
  query?: string;
  /** The unwrapped body — passed to parseMcpInput on the schema path. */
  record: Record<string, unknown>;
}

function stringList(v: unknown): string[] {
  if (typeof v === "string" && v.trim()) return [v.trim()];
  if (typeof v === "number") return [String(v)];
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : ""))
      .filter(Boolean);
  }
  return [];
}

function firstStr(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

/** Explicit opt-out only: fresh:false (or live:false, "false"/"no"/"0").
    Anything else — including omission — means live re-verification. */
export function parseFreshFlag(v: unknown): boolean {
  if (v === false) return false;
  if (typeof v === "string" && /^(false|no|0|off)$/i.test(v.trim())) return false;
  return true;
}

/**
 * Lenient briefing input: unwraps agent-framework envelopes, then decides
 * mode. Schema mode only when `mode:"schema"` or an explicit schema
 * source/FQN/connector key is present — everything else (`{}`, `demo:true`,
 * marketplace keys) is a marketplace briefing.
 */
export function parseBriefingRequest(body: unknown): BriefingRequest {
  let record =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const ownKeys = Object.keys(record);
  const isEnvelopeKey = (k: string) => (ENVELOPE_KEYS as readonly string[]).includes(k);
  const hasNonEnvelope = ownKeys.some((k) => !isEnvelopeKey(k));
  if (!hasNonEnvelope) {
    for (const env of ENVELOPE_KEYS) {
      const inner = record[env];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        record = { ...(inner as Record<string, unknown>) };
        break;
      }
      if (typeof inner === "string" && inner.trim()) {
        record = { query: inner.trim() };
        break;
      }
    }
  }

  const modeRaw = firstStr(record, ["mode"])?.toLowerCase();
  const schemaIntent =
    modeRaw === "schema" || Object.keys(record).some((k) => SCHEMA_INTENT_KEYS.has(k));

  const audioRaw = firstStr(record, ["audio", "audioDelivery"]);
  // Default "none" (text-only, fastest): a bare paid call must answer in a
  // couple of seconds so marketplace reviewers never hit a client timeout.
  // Callers that want narration opt in with audio:"url" (hosted MP3) or
  // audio:"inline" (base64 MP3).
  const audio: BriefingRequest["audio"] =
    audioRaw === "url" || audioRaw === "inline" ? audioRaw : "none";

  return {
    mode: schemaIntent ? "schema" : "marketplace",
    audio,
    demo: record.demo === true,
    fresh: parseFreshFlag(record.fresh ?? record.live),
    agentIds: [
      ...stringList(record.agentIds),
      ...stringList(record.agentId),
      ...stringList(record.agent_id),
    ],
    serviceIds: [
      ...stringList(record.serviceIds),
      ...stringList(record.serviceId),
      ...stringList(record.service_id),
    ],
    endpoints: [...stringList(record.endpoints), ...stringList(record.endpoint)],
    query: firstStr(record, ["query", "need", "q", "researchQuestion", "research_question"]),
    record,
  };
}

// ── Content ────────────────────────────────────────────────────────────────

export type Recommendation = "keep" | "watch" | "switch";

export interface BriefingServiceEntry {
  serviceId: string;
  agentId: string;
  agentName: string;
  serviceName: string;
  endpoint: string;
  feeUsd: number;
  /** Null when unverified — no score exists to quote. */
  score: number | null;
  status: IndexedService["status"];
  verification: string;
  /** True when this row was re-verified live for this briefing (scoped +
      fresh path); false = cached index row. */
  fresh: boolean;
  /** When the live re-check for this row completed (null when cached). */
  checkedAt: string | null;
  /** Outcome of our last paid verification call, if any. */
  paidOutcome?: string;
  subScores: IndexedService["subScores"];
  uptimePct?: number;
  flags: string[];
  /** Flags translated to plain English for the audio/script layer. */
  notes: string[];
  recommendation: Recommendation;
  reason: string;
  changeSincePrev: string | null;
  changeSince24h: string | null;
  alternatives: { serviceId: string; serviceName: string; score: number | null; status: string; feeUsd: number }[];
}

export interface MarketplaceBriefing {
  mode: "marketplace";
  generatedAt: string;
  indexGeneratedAt: string;
  scope: "services" | "marketplace";
  /** live = every scoped row re-verified this call; cached = index rows
      only; partial = some rows fresh, the rest cached (see liveNote). */
  freshness: "live" | "cached" | "partial";
  /** Set when freshness is partial, or the live re-check was unavailable. */
  liveNote?: string;
  summary: string;
  keyFindings: string[];
  nextStep: string;
  services: BriefingServiceEntry[];
  alternatives: { serviceId: string; serviceName: string; score: number | null; status: string; feeUsd: number }[];
  /** Whole-marketplace view — present when nothing specific was requested. */
  market?: {
    counts: Record<string, number>;
    paidHeadline: string | null;
    notableChanges: string[];
    /** Evidence-backed list — `paid` = delivered a real answer to a paid
        request in the last 72h; `!paid` = healthy gate-verified padding. */
    recentDeliveries: { serviceId: string; serviceName: string; agentName: string; score: number; paid: boolean }[];
    providerIssues: { serviceId: string; serviceName: string; agentName: string; kind: "domain" | "paywall"; flag: string }[];
  };
  script: ScriptSegment[];
}

function statusMap(run: HistoryRun | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of run?.results ?? []) m.set(r.serviceId, r.status);
  return m;
}

function changeLabel(svc: IndexedService, prev: Map<string, string>): string | null {
  const before = prev.get(svc.serviceId);
  if (!before) return null;
  return before === svc.status ? null : `${before} → ${svc.status}`;
}

/** Flags → sentences a human can hear. Unknown flags pass through verbatim —
    the flag text is already written to be factual. */
export function flagToPlain(flag: string): string {
  if (flag === "Paid & delivered") return "";
  if (flag.startsWith("Paid verification inconclusive"))
    return "A paid call did not settle — inconclusive, so delivery is unproven.";
  if (flag.startsWith("Payment not enforced"))
    return "Its paywall is not enforced — it answered in full without payment. A provider note, not buyer risk.";
  if (flag.startsWith("Payment challenge declares"))
    return "Its payment challenge declares the wrong token domain — standard x402 clients will fail to pay it.";
  if (flag.includes("re-issued the challenge"))
    return "A signed payment was re-challenged with a fresh 402 — inconclusive.";
  if (flag.startsWith("Couldn't build") || flag.startsWith("Payment gate not reached"))
    return "We could not construct a request it would accept automatically.";
  if (flag.startsWith("MCP server"))
    return "It is an MCP server — payment is enforced per tool call, so the listing-level gate was not checked.";
  if (flag.startsWith("Skipped active call"))
    return "Not actively called — the service may have side effects.";
  if (flag.startsWith("Returned free content")) return "It returned free intro content; the paid flow was not exercised.";
  if (flag.startsWith("Stale data")) return flag;
  return flag;
}

const STATUS_WORDS: Record<IndexedService["status"], string> = {
  healthy: "healthy — it answers and every check we ran passed",
  degraded: "degraded — it answers but has flags worth reading",
  broken: "broken — it is failing hard checks",
  unreachable: "unreachable — the endpoint did not answer",
  unverified: "unverified — alive, but we could not verify its gate or delivery",
};

/** Speech-only phrasing — no jargon, no codes, no arrows. */
const STATUS_SPOKEN: Record<IndexedService["status"], string> = {
  healthy: "healthy",
  degraded: "degraded",
  broken: "broken",
  unreachable: "unreachable",
  unverified: "alive but unverified",
};

const VERIFICATION_WORDS: Record<string, string> = {
  none: "listing only — nothing verified beyond a response",
  gate: "payment gate verified — a valid request reached its x402 challenge; paid output was not measured",
  delivered: "delivered — a valid request got a substantive payload",
  failed: "failed verification — payment signed but no delivery",
};

const VERIFICATION_SPOKEN: Record<string, string> = {
  none: "only its listing is confirmed",
  gate: "its payment gate is verified, but we did not measure what it returns after payment",
  delivered: "it delivered a real answer to a valid request",
  failed: "payment was signed but it did not deliver",
};

/** Strip anything that reads badly aloud: ids, arrows, HTTP codes, jargon. */
export function sanitizeSpeech(text: string): string {
  return text
    .replace(/#\d+/g, "")
    .replace(/→/g, " to ")
    .replace(/\(?HTTP\s?\d{3}\)?/gi, "")
    .replace(/\bx402\b/gi, "payment")
    .replace(/\bA2MCP\b/gi, "agent service")
    .replace(/\bEIP-?712\b/gi, "payment signing")
    .replace(/eip155:196/gi, "X Layer")
    .replace(/\bJSON-RPC\b/gi, "agent protocol")
    .replace(/USD₮0/g, "U S D T zero")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

/** Human time-of-day for the index timestamp (UTC). */
function indexWhen(iso: string): string {
  const h = new Date(iso).getUTCHours();
  if (h < 12) return "this morning UTC";
  if (h < 18) return "this afternoon UTC";
  return "today UTC";
}

function scoreWords(score: number | null): string {
  return score === null ? "not scored" : `${score} out of 100`;
}

function recommend(
  svc: IndexedService,
  alts: IndexedService[],
): { rec: Recommendation; reason: string } {
  // "switch" is only for non-healthy rows — a healthy service is a keep even
  // when a better alternative exists (noted, not urged).
  if (svc.status === "broken" || svc.status === "unreachable") {
    return { rec: "switch", reason: `status is ${svc.status}` };
  }
  if (svc.lastPaidVerification?.outcome === "payment_rejected") {
    return { rec: "switch", reason: "a signed payment was re-challenged — paying it may fail" };
  }
  const better = alts.find((a) => (a.score ?? -1) >= (svc.score ?? 0) + SWITCH_MARGIN);
  if (svc.status === "healthy") {
    return better
      ? { rec: "keep", reason: `healthy and verified; alternative available: ${better.serviceName}` }
      : { rec: "keep", reason: "healthy with a verified payload" };
  }
  if (better) {
    return {
      rec: "switch",
      reason:
        svc.score === null
          ? `${better.serviceName} scores ${better.score} while it is not scored`
          : `${better.serviceName} scores ${better.score} vs its ${svc.score}`,
    };
  }
  if (
    svc.status === "degraded" ||
    svc.status === "unverified" ||
    (svc.feeUsd > 0 && svc.verification !== "delivered") ||
    svc.lastPaidVerification?.outcome === "thin" ||
    svc.lastPaidVerification?.outcome === "not_settled"
  ) {
    return { rec: "watch", reason: `${STATUS_WORDS[svc.status]}; delivery not fully proven` };
  }
  return { rec: "keep", reason: "healthy with a verified payload" };
}

function serviceEntry(
  svc: IndexedService,
  index: MarketplaceIndex,
  prev: Map<string, string>,
  dayAgo: Map<string, string>,
  live?: Map<string, { fresh: boolean; checkedAt: string | null }>,
): BriefingServiceEntry {
  const alts = findAlternatives(index, svc, undefined, ALTERNATIVE_CAP);
  const { rec, reason } = recommend(svc, alts);
  const lv = live?.get(svc.serviceId);
  return {
    serviceId: svc.serviceId,
    agentId: svc.agentId,
    agentName: svc.agentName,
    serviceName: svc.serviceName,
    endpoint: svc.endpoint,
    feeUsd: svc.feeUsd,
    score: svc.score,
    status: svc.status,
    verification: svc.verification,
    fresh: lv?.fresh ?? false,
    checkedAt: lv?.checkedAt ?? null,
    paidOutcome: svc.lastPaidVerification?.outcome,
    subScores: svc.subScores,
    uptimePct: svc.uptimePct,
    flags: svc.flags,
    notes: svc.flags
      .slice(0, 3)
      .map(flagToPlain)
      .filter((n): n is string => n.length > 0),
    recommendation: rec,
    reason,
    changeSincePrev: changeLabel(svc, prev),
    changeSince24h: changeLabel(svc, dayAgo),
    alternatives: alts.map((a) => ({
      serviceId: a.serviceId,
      serviceName: a.serviceName,
      score: a.score,
      status: a.status,
      feeUsd: a.feeUsd,
    })),
  };
}

/** Name safe to say aloud — English TTS mangles non-Latin listings, so fall
    back to the agent name and, failing that, a generic label. */
export function spokenName(name: string, agentName?: string): string {
  const latin = /^[\x20-\x7E]*$/;
  if (latin.test(name) && name.trim()) return name;
  if (agentName && latin.test(agentName) && agentName.trim()) return agentName;
  return "a service with a non-English listing";
}

/** Join display names for speech: non-Latin listings collapse into a count. */
function spokenNameList(items: { serviceName: string; agentName?: string }[]): string {
  const latin: string[] = [];
  const counts = new Map<string, number>();
  let nonLatin = 0;
  for (const it of items) {
    const n = spokenName(it.serviceName, it.agentName);
    if (n === "a service with a non-English listing") nonLatin += 1;
    else if (!counts.has(n)) {
      counts.set(n, 1);
      latin.push(n);
    } else {
      counts.set(n, counts.get(n)! + 1);
    }
  }
  const parts = latin.map((n) => {
    const c = counts.get(n)!;
    return c > 1 ? `${n} (${numWord(c)} listings)` : n;
  });
  if (nonLatin > 0) {
    parts.push(`${nonLatin === 1 ? "one service" : `${nonLatin} services`} listed in a non-English language`);
  }
  return parts.join(", ");
}

function marketView(index: MarketplaceIndex, prev: Map<string, string>): NonNullable<MarketplaceBriefing["market"]> {
  const agg = index.aggregates;
  const notableChanges = index.services
    .filter((s) => !s.ours)
    .map((s) => ({ s, change: changeLabel(s, prev) }))
    .filter((x): x is { s: IndexedService; change: string } => x.change !== null)
    .sort((a, b) => (a.s.score ?? -1) - (b.s.score ?? -1))
    .slice(0, 5)
    .map((x) => `${x.s.serviceName || x.s.agentName} (#${x.s.serviceId}): ${x.change}`);

  // One evidence-backed list: services that delivered a real answer to a
  // paid request in the last 72h, most recent first. Fewer than 3 → pad with
  // healthy gate-verified services, labelled differently so the claim stays
  // exact.
  const cutoff = Date.parse(index.generatedAt) - 72 * 3600_000;
  const paidDelivered = index.services
    .filter((s) => {
      const lp = s.lastPaidVerification;
      return !s.ours && lp?.outcome === "delivered" && Date.parse(lp.at) >= cutoff;
    })
    .sort((a, b) => Date.parse(b.lastPaidVerification!.at) - Date.parse(a.lastPaidVerification!.at))
    .slice(0, 5)
    .map((s) => ({ serviceId: s.serviceId, serviceName: s.serviceName, agentName: s.agentName, score: s.score ?? 0, paid: true }));
  const recentDeliveries =
    paidDelivered.length >= 3
      ? paidDelivered
      : [
          ...paidDelivered,
          ...index.services
            .filter(
              (s) =>
                !s.ours &&
                s.status === "healthy" &&
                (s.verification === "delivered" || s.verification === "gate") &&
                !paidDelivered.some((p) => p.serviceId === s.serviceId),
            )
            .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.latencyMs - b.latencyMs)
            .slice(0, Math.max(0, 3 - paidDelivered.length))
            .map((s) => ({ serviceId: s.serviceId, serviceName: s.serviceName, agentName: s.agentName, score: s.score ?? 0, paid: false })),
        ];

  const providerIssues = index.services
    .filter((s) => !s.ours)
    .flatMap((s) =>
      s.flags
        .filter((f) => f.startsWith("Payment challenge declares") || f.startsWith("Payment not enforced"))
        .map((f) => ({
          serviceId: s.serviceId,
          serviceName: s.serviceName || s.agentName,
          agentName: s.agentName,
          kind: (f.startsWith("Payment challenge declares") ? "domain" : "paywall") as "domain" | "paywall",
          flag: f,
        })),
    )
    .slice(0, 6);

  return {
    counts: {
      healthy: agg.healthy,
      degraded: agg.degraded,
      unverified: agg.unverified,
      broken: agg.broken,
      unreachable: agg.unreachable,
    },
    paidHeadline:
      (agg.paidSettledVerified ?? 0) > 0
        ? `Paid & delivered ${agg.paidDeliveredVerified} of ${agg.paidSettledVerified} settled calls with verified inputs`
        : null,
    notableChanges,
    recentDeliveries,
    providerIssues,
  };
}

/** Locate the services a briefing request asked about — ids first, then
    endpoint, then keyword query. */
export function resolveBriefingServices(
  index: MarketplaceIndex,
  req: Pick<BriefingRequest, "agentIds" | "serviceIds" | "endpoints" | "query">,
): IndexedService[] {
  const found: IndexedService[] = [];
  const seen = new Set<string>();
  const push = (svc: IndexedService | undefined) => {
    if (svc && !seen.has(svc.serviceId)) {
      seen.add(svc.serviceId);
      found.push(svc);
    }
  };
  for (const agentId of req.agentIds) for (const s of findServices(index, { agentId })) push(s);
  for (const serviceId of req.serviceIds) push(findServices(index, { serviceId })[0]);
  for (const endpoint of req.endpoints) push(findServices(index, { endpoint })[0]);
  if (!found.length && req.query) for (const s of findServices(index, { query: req.query })) push(s);
  return found.slice(0, SCOPED_CAP);
}

export function buildMarketplaceBriefing(
  index: MarketplaceIndex,
  history: HistoryRun[],
  req: Pick<BriefingRequest, "agentIds" | "serviceIds" | "endpoints" | "query">,
  live?: Map<string, { fresh: boolean; checkedAt: string | null }>,
): MarketplaceBriefing {
  const generatedAt = new Date().toISOString();
  // The last history entry IS the current run (appended during runIndex) —
  // the previous run is the one before it.
  const prev = statusMap(history.length >= 2 ? history[history.length - 2] : undefined);
  const cutoff = new Date(new Date(index.generatedAt).getTime() - 24 * 3600_000).toISOString();
  const dayAgoRun = [...history].reverse().find((h) => h.runAt <= cutoff);
  const dayAgo = statusMap(dayAgoRun);

  const matched = resolveBriefingServices(index, req).filter((s) => !s.ours);
  const scoped = matched.length > 0;

  const services = matched.map((s) => serviceEntry(s, index, prev, dayAgo, live));
  const market = scoped ? undefined : marketView(index, prev);

  // Freshness of the scoped rows: live = all re-verified this call,
  // partial = some fresh, cached = index rows only.
  const freshCount = services.filter((s) => s.fresh).length;
  const freshness: MarketplaceBriefing["freshness"] =
    !live || services.length === 0
      ? "cached"
      : freshCount === services.length
        ? "live"
        : freshCount === 0
          ? "cached"
          : "partial";

  const agg = index.aggregates;
  const freshLine =
    scoped && live
      ? freshness === "live"
        ? ` Freshness: live — all ${services.length} re-verified just now.`
        : freshness === "partial"
          ? ` Freshness: partial — ${freshCount}/${services.length} re-verified just now, the rest are cached.`
          : ` Freshness: cached — the live re-check did not complete; rows are from the index.`
      : "";
  const summary = scoped
    ? `${services.length} marketplace service${services.length === 1 ? "" : "s"}: ` +
      services.map((s) => `${s.serviceName || s.agentName} is ${s.status} (${s.score === null ? "not scored" : `${s.score}/100`}, ${s.recommendation})`).join("; ") +
      ` — index from ${index.generatedAt}.${freshLine}`
    : `OKX.AI marketplace: ${agg.healthy} healthy, ${agg.degraded} degraded, ${agg.unverified} unverified, ` +
      `${agg.broken + agg.unreachable} failing of ${agg.checked} checked` +
      (market?.paidHeadline ? ` — ${market.paidHeadline.toLowerCase()}` : "") +
      ` — index from ${index.generatedAt}.`;

  // One line per service, name-prefixed — no dangling flag-only lines.
  const keyFindings: string[] = scoped
    ? services.map((s) => {
        const parts = [
          `${s.serviceName || s.agentName} (#${s.serviceId}): ${s.score === null ? "not scored" : `${s.score}/100`}, ${STATUS_WORDS[s.status]}`,
          VERIFICATION_WORDS[s.verification] ?? s.verification,
          ...s.notes,
          `Recommendation: ${s.recommendation} — ${s.reason}`,
        ];
        return parts.join(". ").replace(/\.+/g, ".").replace(/\.\./g, ".") + ".";
      })
    : [
        `Status: ${agg.healthy} healthy, ${agg.degraded} degraded, ${agg.unverified} unverified, ${agg.broken} broken, ${agg.unreachable} unreachable.`,
        ...(market?.paidHeadline ? [market.paidHeadline + "."] : []),
        ...((market?.notableChanges ?? []).map((c) => `Changed since last run — ${c}.`)),
        ...(market?.providerIssues
          .slice(0, 2)
          .map((p) => `Provider issue — ${p.serviceName} (#${p.serviceId}): ${p.flag}`) ?? []),
      ];

  const switchTarget = services.find((s) => s.recommendation === "switch");
  const nextStep = scoped
    ? switchTarget
      ? `Switch ${switchTarget.serviceName || switchTarget.agentName} — ${
          switchTarget.alternatives[0]
            ? `${switchTarget.alternatives[0].serviceName} (#${switchTarget.alternatives[0].serviceId}) scores ${switchTarget.alternatives[0].score}`
            : "see the marketplace index for healthier alternatives"
        }.`
      : `Check any service before paying: databard_service_score with its agentId or serviceId.`
    : `Look up a specific service with databard_service_score (agentId, serviceId, endpoint, or keywords) before paying it.`;

  const briefing: MarketplaceBriefing = {
    mode: "marketplace",
    generatedAt,
    indexGeneratedAt: index.generatedAt,
    scope: scoped ? "services" : "marketplace",
    freshness,
    summary,
    keyFindings: keyFindings.slice(0, 12),
    nextStep,
    services,
    alternatives: scoped
      ? services.flatMap((s) => s.alternatives).slice(0, 5)
      : findAlternatives(index, undefined, req.query, 3).map((a) => ({
          serviceId: a.serviceId,
          serviceName: a.serviceName,
          score: a.score,
          status: a.status,
          feeUsd: a.feeUsd,
        })),
    market,
    script: [],
  };
  briefing.script = buildMarketplaceScript(briefing);
  return briefing;
}

// ── Script ─────────────────────────────────────────────────────────────────

function seg(speaker: "Alex" | "Morgan", topic: string, text: string): ScriptSegment {
  return { speaker, topic, text: text.trim() };
}

/**
 * Two-speaker script from the deterministic briefing content — 6–10
 * segments, alternating Alex/Morgan, short sentences, ~60–90s of speech.
 */
/** "healthy → broken" in JSON becomes "went from healthy to broken" aloud.
    Only transitions a buyer cares about are spoken — moves to/from
    "unverified" mostly reflect our method changes, so they stay JSON-only. */
function spokenChange(change: string | null): string | null {
  if (!change) return null;
  const [from, to] = change.split("→").map((x) => x.trim());
  if (!from || !to) return change;
  const involves = (s: string) => s === "broken" || s === "unreachable";
  const healthPair = (f: string, t: string) =>
    (f === "healthy" || f === "degraded") && (t === "healthy" || t === "degraded");
  if (!involves(from) && !involves(to) && !healthPair(from, to)) return null;
  return `went from ${from} to ${to}`;
}

const SPELL_NUM = ["no", "one", "two", "three", "four", "five", "six"] as const;
const numWord = (n: number) => (n < SPELL_NUM.length ? SPELL_NUM[n] : String(n));

export function buildMarketplaceScript(b: MarketplaceBriefing): ScriptSegment[] {
  const parts: [string, string][] = [];
  const checked = b.market?.counts;
  const when = indexWhen(b.indexGeneratedAt);

  if (b.scope === "marketplace" && checked) {
    parts.push([
      "Marketplace health",
      `Here is the OKX AI marketplace health check, as of ${when}. We probed every listed paid agent service. ` +
        `${checked.healthy} are healthy, ${checked.degraded} are degraded, ${checked.unverified} are unverified, ` +
        `and ${checked.broken + checked.unreachable} are failing.`,
    ]);
    if (b.market?.paidHeadline) {
      parts.push([
        "Paid verification",
        `We made real payments on X Layer: ${b.market.paidHeadline.replace(/^Paid & delivered (\d+) of (\d+).*$/, "$1 of $2 services that settled delivered a real answer")}, using inputs we could verify.`,
      ]);
    }
    const changes = (b.market?.notableChanges ?? [])
      .map((c) => {
        const m = c.match(/^(.*)\s*\(#\d+\):\s*(.*)$/);
        if (!m) return null;
        const spoken = spokenChange(m[2].trim());
        return spoken ? `${m[1].trim()} ${spoken}` : null;
      })
      .filter((c): c is string => c !== null)
      .slice(0, 3);
    if (changes.length) {
      parts.push(["What changed", `Since the last run: ${changes.join(". ")}.`]);
    }
    const deliveries = b.market?.recentDeliveries ?? [];
    if (deliveries.length) {
      const paid = deliveries.filter((d) => d.paid);
      const gate = deliveries.filter((d) => !d.paid);
      let text = "";
      if (paid.length) {
        text =
          `In the last 72 hours, ${numWord(paid.length)} service${paid.length === 1 ? "" : "s"} delivered a real answer ` +
          `to a paid request: ${spokenNameList(paid)}.`;
      }
      if (gate.length) {
        text += `${text ? " " : ""}Also verified at the payment gate: ${spokenNameList(gate)}.`;
      }
      parts.push(["Delivered & verified", text]);
    }
    // Provider issues grouped by kind — one sentence per issue type, with
    // names joined (non-Latin listings collapse into a count for TTS).
    const issues = b.market?.providerIssues ?? [];
    if (issues.length) {
      const domain = issues.filter((i) => i.kind === "domain");
      const paywall = issues.filter((i) => i.kind === "paywall");
      const sentences: string[] = [];
      if (domain.length) {
        sentences.push(
          `${numWord(domain.length)} service${domain.length === 1 ? " declares" : "s declare"} the wrong token details ` +
            `in their payment request, so standard payment clients can't pay them: ${spokenNameList(domain)}.`,
        );
      }
      if (paywall.length) {
        sentences.push(
          `${numWord(paywall.length)} service${paywall.length === 1 ? " returned" : "s returned"} a full response ` +
            `without charging — a provider note, not buyer risk: ${spokenNameList(paywall)}.`,
        );
      }
      parts.push(["Provider issues", `Worth flagging to providers: ${sentences.join(" ")}`]);
    }
  } else {
    parts.push([
      "Your services",
      `You asked about ${b.services.length} marketplace service${b.services.length === 1 ? "" : "s"}, as of ${when}. Here is where each stands.`,
    ]);
    for (const s of b.services.slice(0, 4)) {
      const name = spokenName(s.serviceName || s.agentName, s.agentName);
      const change = spokenChange(s.changeSincePrev);
      const note = s.notes[0] ? ` ${s.notes[0]}` : "";
      const verLine =
        s.paidOutcome === "delivered" || s.paidOutcome === "thin"
          ? "It delivered a real answer to a paid request"
          : (VERIFICATION_SPOKEN[s.verification] ?? "verification unknown");
      parts.push([
        name,
        `${name} is ${STATUS_SPOKEN[s.status]}, ${scoreWords(s.score)}. ` +
          `${verLine.charAt(0).toUpperCase()}${verLine.slice(1)}.` +
          (change ? ` Since the last run it ${change}.` : "") +
          note,
      ]);
    }
    const recs = b.services.filter((s) => s.recommendation !== "keep" || s.reason.includes("alternative available"));
    if (recs.length) {
      parts.push([
        "Recommendations",
        recs
          .slice(0, 3)
          .map((s) => {
            const name = spokenName(s.serviceName || s.agentName, s.agentName);
            const alt = s.recommendation === "switch" && s.alternatives[0]
              ? ` Consider ${s.alternatives[0].serviceName} instead.`
              : "";
            return `${name}: ${s.recommendation} — ${s.reason}.${alt}`;
          })
          .join(" "),
      ]);
    } else {
      parts.push(["Recommendations", "Nothing needs switching. Every service you asked about is a keep."]);
    }
  }

  parts.push([
    "Caveat",
    `One honesty note. When we say a payment gate is verified, that means the paywall checks out. Output quality behind it was only measured for services we marked as delivered.`,
  ]);
  parts.push([
    "On-chain",
    `These scores are published on-chain on X Layer. Any contract can call is safe to pay on the Probe Verdict Registry before paying a service.`,
  ]);

  // Alternate speakers, cap at 10; every text passes the speech sanitiser —
  // no ids, arrows, HTTP codes or protocol jargon make it to audio.
  const capped = parts.slice(0, 10);
  const script = capped.map(([topic, text], i) => {
    let t = sanitizeSpeech(text);
    // Dedupe identical sentences within a segment only — a repeated line
    // across different services ("it delivered…") is correct, not noise.
    const seen = new Set<string>();
    t = t
      .split(/(?<=[.!?])\s+/)
      .filter((sent) => (seen.has(sent) ? false : (seen.add(sent), true)))
      .join(" ");
    return seg(i % 2 === 0 ? "Alex" : "Morgan", topic, t);
  });
  return script;
}

// ── Audio + daily store ────────────────────────────────────────────────────

/** TTS for a marketplace/schema briefing script — same cost-controlled
    settings as the paid route (Flash model + bookends SFX).
    Never throws: TTS is a bonus layer, so any failure (no key, quota,
    provider hang) degrades to `undefined` and the caller returns a
    text-only 200 — a paid call must never 500 or time out over audio. */
export async function synthesizeBriefingAudio(script: ScriptSegment[]): Promise<Buffer | undefined> {
  const rawMode = (process.env.BRIEFING_SFX_MODE ?? "bookends").toLowerCase();
  const sfxMode = rawMode === "full" || rawMode === "none" ? rawMode : "bookends";
  const ttsModel =
    process.env.BRIEFING_TTS_MODEL ?? process.env.ELEVENLABS_TTS_MODEL ?? "eleven_flash_v2_5";
  // Wall-clock budget for TTS inside a paid call — exceeding it degrades to
  // text-only instead of timing out the reviewer's client.
  const timeoutMs = Number(process.env.BRIEFING_TTS_TIMEOUT_MS ?? 25000);
  const withTimeout = <T>(p: Promise<T>, label: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  let audioBuffers: Buffer[];
  try {
    audioBuffers = await withTimeout(
      synthesizeEpisode(script, undefined, sfxMode, ttsModel),
      "briefing TTS",
    );
  } catch (apiError: unknown) {
    const errorMsg = apiError instanceof Error ? apiError.message : String(apiError);
    if (
      errorMsg.includes("402") ||
      errorMsg.includes("payment_required") ||
      errorMsg.includes("paid_plan_required")
    ) {
      try {
        const { synthesizeEpisodeViaWeb } = await import("./audio-engine-providers");
        audioBuffers = await withTimeout(synthesizeEpisodeViaWeb(script), "briefing web TTS");
      } catch (webErr) {
        console.warn("[briefing] TTS unavailable, returning text-only briefing:", webErr);
        return undefined;
      }
    } else {
      console.warn("[briefing] TTS failed, returning text-only briefing:", errorMsg);
      return undefined;
    }
  }
  return Buffer.concat(audioBuffers);
}

/** Persist an MP3 content-addressed under the data dir and return its
    self-hosted URL (served by /api/mcp/briefing/audio/[id]). */
export async function storeBriefingAudio(
  audio: Buffer,
): Promise<{ audioId: string; audioUrl: string } | undefined> {
  try {
    const audioId = createHash("sha256").update(audio).digest("hex");
    const dir = getDataPath("briefing-audio");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${audioId}.mp3`), audio);
    return { audioId, audioUrl: `${PUBLIC_BASE}/api/mcp/briefing/audio/${audioId}` };
  } catch (e) {
    console.warn("[briefing] audio persist failed (non-fatal):", e);
    return undefined;
  }
}

export interface StoredBriefing {
  generatedAt: string;
  audioUrl?: string;
  audioId?: string;
  summary: string;
  keyFindings: string[];
  script: ScriptSegment[];
}

export async function getLatestBriefing(): Promise<StoredBriefing | null> {
  try {
    return JSON.parse(await readFile(BRIEFING_FILE, "utf-8")) as StoredBriefing;
  } catch {
    return null;
  }
}

/**
 * The daily whole-marketplace briefing for humans — generated after a
 * refresh when the last one is >20h old. Same code path as the paid tool.
 */
export async function maybeGenerateDailyBriefing(
  index: MarketplaceIndex,
): Promise<{ generated: boolean; briefing?: StoredBriefing; reason?: string }> {
  const existing = await getLatestBriefing();
  if (
    existing?.generatedAt &&
    Date.now() - new Date(existing.generatedAt).getTime() < BRIEFING_MAX_AGE_MS
  ) {
    return { generated: false, reason: "briefing is fresh" };
  }
  const history = await getMarketplaceHistory();
  const briefing = buildMarketplaceBriefing(index, history, {
    agentIds: [],
    serviceIds: [],
    endpoints: [],
  });
  let audioUrl: string | undefined;
  let audioId: string | undefined;
  try {
    const audio = await synthesizeBriefingAudio(briefing.script);
    if (audio) {
      const stored = await storeBriefingAudio(audio);
      audioUrl = stored?.audioUrl;
      audioId = stored?.audioId;
    }
  } catch (e) {
    console.warn("[briefing] daily TTS failed (non-fatal):", e);
  }
  const stored: StoredBriefing = {
    generatedAt: briefing.generatedAt,
    audioUrl,
    audioId,
    summary: briefing.summary,
    keyFindings: briefing.keyFindings,
    script: briefing.script,
  };
  await mkdir(path.dirname(BRIEFING_FILE), { recursive: true });
  await writeFile(BRIEFING_FILE, JSON.stringify(stored), "utf-8");
  return { generated: true, briefing: stored };
}
