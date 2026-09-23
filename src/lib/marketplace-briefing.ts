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
  const audio: BriefingRequest["audio"] =
    audioRaw === "url" || audioRaw === "none" ? audioRaw : "inline";

  return {
    mode: schemaIntent ? "schema" : "marketplace",
    audio,
    demo: record.demo === true,
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
    topHealthy: { category: string; picks: { serviceId: string; serviceName: string; score: number }[] }[];
    providerIssues: string[];
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
): BriefingServiceEntry {
  const alts = findAlternatives(index, svc, undefined, ALTERNATIVE_CAP);
  const { rec, reason } = recommend(svc, alts);
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

const CATEGORY_KEYWORDS: { category: string; include: RegExp; exclude?: RegExp }[] = [
  {
    category: "token data",
    include: /\b(token|contract|metadata|price feed|chain info|holder)\b/i,
    exclude: /\b(card|pokemon|pokémon|sealed|property|apartment)\b/i,
  },
  {
    category: "security",
    include: /\b(security|audit|risk|honeypot|scam|phishing|approval)\b/i,
  },
  {
    category: "market signals",
    include: /\b(signal|signals|market|sentiment|trend|trends|alpha)\b/i,
    exclude: /\b(card|cards|pokemon|pokémon|sealed|property|apartment)\b/i,
  },
];

function marketView(index: MarketplaceIndex, prev: Map<string, string>): NonNullable<MarketplaceBriefing["market"]> {
  const agg = index.aggregates;
  const notableChanges = index.services
    .filter((s) => !s.ours)
    .map((s) => ({ s, change: changeLabel(s, prev) }))
    .filter((x): x is { s: IndexedService; change: string } => x.change !== null)
    .sort((a, b) => (a.s.score ?? -1) - (b.s.score ?? -1))
    .slice(0, 5)
    .map((x) => `${x.s.serviceName || x.s.agentName} (#${x.s.serviceId}): ${x.change}`);

  // Word-boundary keyword sets on name+description, with exclusions — a
  // "Pokémon card" service is not "token data". Skip a category rather than
  // pad it with weak matches.
  const topHealthy = CATEGORY_KEYWORDS.map(({ category, include, exclude }) => ({
    category,
    picks: index.services
      .filter((s) => {
        if (s.ours || s.status !== "healthy") return false;
        if (s.verification !== "delivered" && s.verification !== "gate") return false;
        const hay = `${s.serviceName} ${s.description}`;
        return include.test(hay) && !(exclude && exclude.test(hay));
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.latencyMs - b.latencyMs)
      .slice(0, 3)
      .map((s) => ({ serviceId: s.serviceId, serviceName: s.serviceName, score: s.score ?? 0 })),
  })).filter((c) => c.picks.length > 0);

  const providerIssues = index.services
    .filter((s) => !s.ours)
    .flatMap((s) =>
      s.flags
        .filter((f) => f.startsWith("Payment challenge declares") || f.startsWith("Payment not enforced"))
        .map((f) => `${s.serviceName || s.agentName} (#${s.serviceId}): ${f}`),
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
    topHealthy,
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

  const services = matched.map((s) => serviceEntry(s, index, prev, dayAgo));
  const market = scoped ? undefined : marketView(index, prev);

  const agg = index.aggregates;
  const summary = scoped
    ? `${services.length} marketplace service${services.length === 1 ? "" : "s"}: ` +
      services.map((s) => `${s.serviceName || s.agentName} is ${s.status} (${s.score === null ? "not scored" : `${s.score}/100`}, ${s.recommendation})`).join("; ") +
      ` — index from ${index.generatedAt}.`
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
        ...(market?.providerIssues.slice(0, 2).map((p) => `Provider issue — ${p}`) ?? []),
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
/** "healthy → broken" in JSON becomes "went from healthy to broken" aloud. */
function spokenChange(change: string | null): string | null {
  if (!change) return null;
  const [from, to] = change.split("→").map((x) => x.trim());
  return from && to ? `went from ${from} to ${to}` : change;
}

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
        `On the paid side, we made real payments on X Layer. ${b.market.paidHeadline}, counting only calls built on verified inputs.`,
      ]);
    }
    const changes = (b.market?.notableChanges ?? []).slice(0, 3);
    if (changes.length) {
      parts.push([
        "What changed",
        `Since the last run: ${changes
          .map((c) => {
            const m = c.match(/^(.*)\s*\(#\d+\):\s*(.*)$/);
            if (!m) return c;
            return `${m[1].trim()} ${spokenChange(m[2].trim()) ?? m[2].trim()}`;
          })
          .join(". ")}.`,
      ]);
    }
    for (const cat of (b.market?.topHealthy ?? []).slice(0, 3)) {
      if (!cat.picks.length) continue;
      parts.push([
        `Top picks — ${cat.category}`,
        `For ${cat.category}, the strongest verified services are ${cat.picks
          .map((p) => `${p.serviceName} at ${p.score}`)
          .join(", ")}.`,
      ]);
    }
    const issues = (b.market?.providerIssues ?? []).slice(0, 2);
    if (issues.length) {
      parts.push([
        "Provider issues",
        `Worth flagging to providers: ${issues
          .map((i) => {
            const m = i.match(/^(.*)\s*\(#\d+\):\s*(.*)$/);
            const name = m ? m[1].trim() : "One service";
            const flag = m ? m[2] : i;
            return `${name}: ${flagToPlain(flag)}`;
          })
          .join(" ")}`,
      ]);
    }
  } else {
    parts.push([
      "Your services",
      `You asked about ${b.services.length} marketplace service${b.services.length === 1 ? "" : "s"}, as of ${when}. Here is where each stands.`,
    ]);
    for (const s of b.services.slice(0, 4)) {
      const name = s.serviceName || s.agentName;
      const change = spokenChange(s.changeSincePrev);
      const note = s.notes[0] ? ` ${s.notes[0]}` : "";
      const verLine =
        s.verification === "delivered" && (s.paidOutcome === "delivered" || s.paidOutcome === "thin")
          ? "it delivered a real answer to a paid request"
          : (VERIFICATION_SPOKEN[s.verification] ?? "verification unknown");
      parts.push([
        name,
        `${name} is ${STATUS_SPOKEN[s.status]}, ${scoreWords(s.score)}. ` +
          `${verLine}.` +
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
            const name = s.serviceName || s.agentName;
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
  const seen = new Set<string>();
  const script = capped.map(([topic, text], i) => {
    let t = sanitizeSpeech(text);
    // Dedupe identical sentences within a segment (translated flags can repeat).
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
    settings as the paid route (Flash model + bookends SFX). */
export async function synthesizeBriefingAudio(script: ScriptSegment[]): Promise<Buffer | undefined> {
  const rawMode = (process.env.BRIEFING_SFX_MODE ?? "bookends").toLowerCase();
  const sfxMode = rawMode === "full" || rawMode === "none" ? rawMode : "bookends";
  const ttsModel =
    process.env.BRIEFING_TTS_MODEL ?? process.env.ELEVENLABS_TTS_MODEL ?? "eleven_flash_v2_5";
  let audioBuffers: Buffer[];
  try {
    audioBuffers = await synthesizeEpisode(script, undefined, sfxMode, ttsModel);
  } catch (apiError: unknown) {
    const errorMsg = apiError instanceof Error ? apiError.message : String(apiError);
    if (
      errorMsg.includes("402") ||
      errorMsg.includes("payment_required") ||
      errorMsg.includes("paid_plan_required")
    ) {
      const { synthesizeEpisodeViaWeb } = await import("./audio-engine-providers");
      audioBuffers = await synthesizeEpisodeViaWeb(script);
    } else {
      throw apiError;
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
