/**
 * Marketplace Index — a free, public health index of every A2MCP service
 * listed on the OKX.AI marketplace.
 *
 * The crawler output (src/lib/okx-marketplace.snapshot.json, built locally by
 * scripts/crawl-okx-marketplace.mjs via the authed `onchainos` CLI) is the
 * listing roster. `checkListing` then makes ONE unpaid request per endpoint:
 * an empty JSON POST (retried as GET on 405). It never pays. For paid
 * listings the honest signal is the 402 challenge itself — a well-formed
 * PAYMENT-REQUIRED header proves the endpoint is live and declares its real
 * price, which we compare against the listing's advertised fee. Output
 * quality behind the paywall is NOT measured (except opt-in deep checks,
 * which are clearly labelled and budget-capped).
 *
 * Nothing is faked: unreachable endpoints get score 0 / "unreachable", and
 * every check carries its evidence.
 */
import { promises as fs } from "fs";
import path from "path";
import { getDataPath } from "./data-dir";
import { serial } from "./serial-queue";
import { assertPublicUrl, attemptX402Payment } from "./probe-runner";
import { attestVerdict } from "./probe-attestation";
import { diffForChain, chunkBatches, indexHashOf, publishIndexRun } from "./probe-registry";
import {
  discoverInputs,
  extractFieldNames,
  isSideEffecting,
  isStalePayload,
  synthesizeBody,
  type FieldSpec,
  type McpTool,
} from "./service-inputs";
import snapshot from "./okx-marketplace.snapshot.json";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MarketplaceService {
  serviceId: string;
  agentId: string;
  agentName: string;
  serviceName: string;
  endpoint: string;
  feeUsd: number;
  online: boolean;
  category: string;
  description: string;
}

export interface PaymentChallenge {
  /** Decoded x402 challenge (v2 header or v1-style body accepts). */
  network?: string;
  amountAtomic?: number;
  amountUsd?: number;
  asset?: string;
  payTo?: string;
  resourceUrl?: string;
  resourceDescription?: string;
  /** Header/body existed but could not be decoded. */
  undecodable?: boolean;
}

export interface ListingCheck {
  service: MarketplaceService;
  /** URL actually requested (after template substitution). */
  checkedUrl: string;
  /** HTTP method that produced the captured response (POST, or GET after fallback). */
  checkedMethod: "POST" | "GET";
  templateSubstituted: boolean;
  status: number; // 0 = network error
  latencyMs: number;
  contentType: string;
  bodySnippet: string;
  bodyJson: unknown;
  challengeHeader: string | null;
  challenge: PaymentChallenge | null;
  /** Raw decoded challenge JSON (extensions/inputSchema carriers intact). */
  challengeRaw?: Record<string, unknown> | null;
  error?: string;
  /** Set when the endpoint answered a real MCP (JSON-RPC) handshake. */
  protocol?: "mcp";
  /** result.serverInfo.name from initialize, when known. */
  mcpServerName?: string;
  /** tools the server listed, when tools/list succeeded. */
  toolCount?: number;
  /** Full tools/list entries — input discovery uses their inputSchemas. */
  mcpTools?: McpTool[];
}

export interface CheckScore {
  pass: "pass" | "partial" | "fail";
  detail: string;
}

export interface PaidVerification {
  at: string;
  delivered: boolean;
  status?: number;
  settlementTx?: string;
  amountUsd?: number;
  error?: string;
}

/** One HTTP request we sent during verification, kept as evidence so
    providers can reproduce the call. */
export interface AttemptEvidence {
  method: "POST" | "GET";
  url: string;
  body?: string;
  status: number;
  snippet: string;
  paid?: boolean;
}

export type VerificationLevel = "none" | "gate" | "delivered" | "failed";

export interface SubScores {
  availability: number | null;
  paymentIntegrity: number | null;
  delivery: number | null;
}

export interface IndexedService extends MarketplaceService {
  ours: boolean;
  score: number;
  status: "healthy" | "degraded" | "broken" | "unreachable" | "unverified";
  checks: Record<string, CheckScore>;
  flags: string[];
  latencyMs: number;
  httpStatus: number;
  verification: VerificationLevel;
  /** True when a paid verification ran this run (fresh money spent). */
  paid: boolean;
  subScores: SubScores;
  /** Request/response evidence for every verification attempt. */
  attempts?: AttemptEvidence[];
  /** Last paid verification — this run's or carried forward (≤72h shown). */
  lastPaidVerification?: PaidVerification;
  /** Where the synthesized request's inputs came from. */
  inputSource?: string;
  /** Share of recent runs where this service was healthy or degraded. */
  uptimePct?: number;
  protocol?: "mcp";
  mcpServerName?: string;
  toolCount?: number;
}

export interface MarketplaceIndex {
  kind: "okx-marketplace-index";
  generatedAt: string;
  crawledAt: string;
  aggregates: {
    checked: number;
    healthy: number;
    degraded: number;
    broken: number;
    unreachable: number;
    priceMismatchCount: number;
    freeDemandsPaymentCount: number;
    medianLatency: number | null;
    unverified: number;
    /** Reached a decodable x402 gate with a valid request (unpaid). */
    gateVerified: number;
    /** Valid request got a substantive payload (free or paid). */
    delivered: number;
    /** Paid services whose gate was verified this run or previously. */
    paidVerified: number;
    /** Paid services that delivered a substantive payload after payment. */
    paidDelivered: number;
    /** paidDelivered / paidVerified (null when no paid verifications). */
    deliveryRate: number | null;
    verifySpentUsd: number;
    verifyAttempted: number;
  };
  attestation?: {
    txHash?: string;
    registry?: string;
    txHashes?: string[];
    updated?: number;
    error?: string;
  };
  services: IndexedService[];
}

// ── Constants ──────────────────────────────────────────────────────────────

export const OUR_AGENT_ID = "9878";
const CHECK_TIMEOUT_MS = 10_000;
const MAX_BODY = 2_048;
const SNIPPET_BODY = 300;
const HISTORY_KEEP = 90;
/** Paid verification: max fee per service and daily budget guardrails. */
const VERIFY_MAX_FEE_USD = 0.05;
const VERIFY_DAILY_MAX_USD = 3;
const VERIFY_RECHECK_MS = 72 * 3600 * 1000;

const INDEX_DIR = getDataPath("marketplace-index");
const LATEST_FILE = path.join(INDEX_DIR, "latest.json");
const HISTORY_FILE = path.join(INDEX_DIR, "history.json");
const SPEND_FILE = path.join(INDEX_DIR, "spend.json");
const PAID_VERIFICATIONS_FILE = path.join(INDEX_DIR, "paid-verifications.json");

/** Services from the committed marketplace snapshot. */
export const MARKETPLACE_SERVICES: MarketplaceService[] = (
  snapshot as { services: MarketplaceService[] }
).services;

// ── Challenge decoding ─────────────────────────────────────────────────────

/** Raw decoded challenge object (header base64 or v1-style body), before
    field extraction — discovery needs extensions/inputSchema carriers. */
function rawChallengeOf(
  header: string | null,
  bodyJson: unknown,
): { raw: Record<string, unknown> | null; undecodable: boolean } {
  let raw: unknown = null;
  let undecodable = false;
  if (header) {
    try {
      raw = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
    } catch {
      try {
        raw = JSON.parse(header);
      } catch {
        undecodable = true;
      }
    }
  }
  // v1-style: the 402 body itself may carry {accepts: [...]} / paymentRequirements
  if (raw == null && bodyJson && typeof bodyJson === "object") {
    const b = bodyJson as Record<string, unknown>;
    if (Array.isArray(b.accepts) || Array.isArray(b.paymentRequirements)) {
      raw = b;
    }
  }
  // A 402 body that isn't an accepts envelope still may carry inputSchema —
  // keep it as raw evidence for discovery.
  if (raw == null && bodyJson && typeof bodyJson === "object") {
    raw = bodyJson;
  }
  return { raw: (raw as Record<string, unknown>) ?? null, undecodable };
}

function decodeChallenge(
  header: string | null,
  bodyJson: unknown,
): PaymentChallenge | null {
  const { raw, undecodable } = rawChallengeOf(header, bodyJson);
  if (raw == null) return undecodable ? { undecodable: true } : null;

  const obj = raw as Record<string, unknown>;
  const accepts = (Array.isArray(obj.accepts) ? obj.accepts : undefined) ??
    (Array.isArray(obj.paymentRequirements) ? obj.paymentRequirements : undefined);
  // No accepts envelope → not a challenge (raw body kept only for discovery).
  if (!accepts) return undecodable ? { undecodable: true } : null;
  const first = accepts?.[0] as Record<string, unknown> | undefined;
  const resource = obj.resource as Record<string, unknown> | undefined;

  const amountRaw = first?.amount ?? first?.maxAmountRequired;
  const amountAtomic =
    typeof amountRaw === "string" && /^\d+$/.test(amountRaw)
      ? Number(amountRaw)
      : typeof amountRaw === "number"
        ? amountRaw
        : undefined;

  return {
    network: typeof first?.network === "string" ? first.network : undefined,
    amountAtomic,
    amountUsd: amountAtomic !== undefined ? amountAtomic / 1e6 : undefined,
    asset: typeof first?.asset === "string" ? first.asset : undefined,
    payTo: typeof first?.payTo === "string" ? first.payTo : undefined,
    resourceUrl: typeof resource?.url === "string" ? resource.url : undefined,
    resourceDescription:
      typeof resource?.description === "string" ? resource.description : undefined,
  };
}

function isInternalHost(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "0.0.0.0" ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "[::1]" ||
      host === "::1" ||
      /^127\./.test(host)
    );
  } catch {
    return false;
  }
}

// ── HTTP attempts + MCP (JSON-RPC / Streamable HTTP) machinery ────────────

interface Attempt {
  status: number;
  latencyMs: number;
  contentType: string;
  bodySnippet: string;
  bodyJson: unknown;
  challengeHeader: string | null;
}

/** One HTTP request against a checked URL. GET sends query params; POST a
    JSON body. Never attaches payment — paid calls go through paidAttempt. */
async function sendAttempt(
  url: string,
  method: "POST" | "GET",
  body?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Promise<Attempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  const start = Date.now();
  try {
    let target = url;
    if (method === "GET" && body && Object.keys(body).length > 0) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        qs.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
      }
      target = `${url}${url.includes("?") ? "&" : "?"}${qs.toString()}`;
    }
    const res = await fetch(target, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...extraHeaders,
      },
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
    const snippet = (await res.text()).slice(0, MAX_BODY);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(snippet);
    } catch {
      // not JSON — fine
    }
    return {
      status: res.status,
      latencyMs: Date.now() - start,
      contentType: res.headers.get("content-type") ?? "",
      bodySnippet: snippet,
      bodyJson: parsed,
      challengeHeader:
        res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("payment-required"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

const parseJsonRpc = (snippet: string, parsed: unknown): Record<string, unknown> | null => {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    if (o.jsonrpc === "2.0" || o.result !== undefined || o.error !== undefined) return o;
  }
  // SSE: collect JSON-RPC messages from `data:` lines of the last event block
  for (const line of snippet.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    try {
      const o = JSON.parse(t.slice(5).trim());
      if (o && typeof o === "object" && (o.jsonrpc === "2.0" || o.result !== undefined || o.error !== undefined)) {
        return o as Record<string, unknown>;
      }
    } catch {
      // not a JSON data line
    }
  }
  return null;
};

interface McpAttempt extends Attempt {
  sessionId?: string;
  rpc?: Record<string, unknown> | null;
  settleHeader?: string | null;
}

async function mcpPost(
  url: string,
  payload: unknown,
  sessionId?: string,
  extraHeaders?: Record<string, string>,
): Promise<McpAttempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sessionId ? { "MCP-Session-Id": sessionId } : {}),
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
    });
    const snippet = (await res.text()).slice(0, MAX_BODY);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(snippet);
    } catch {
      // SSE or non-JSON
    }
    return {
      status: res.status,
      latencyMs: Date.now() - start,
      contentType: res.headers.get("content-type") ?? "",
      bodySnippet: snippet,
      bodyJson: parsed,
      challengeHeader: res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("payment-required"),
      sessionId: res.headers.get("mcp-session-id") ?? res.headers.get("Mcp-Session-Id") ?? undefined,
      settleHeader: res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("payment-response"),
      rpc: parseJsonRpc(snippet, parsed),
    };
  } finally {
    clearTimeout(timeout);
  }
}

interface McpOutcome {
  attempt: McpAttempt;
  serverName?: string;
  toolCount?: number;
  tools?: McpTool[];
  sessionId?: string;
}

/** initialize → notifications/initialized → tools/list. A 402 at any step is
    a normal x402 challenge and flows through the same gate/price scoring. */
async function mcpHandshake(url: string): Promise<McpOutcome | null> {
  const init = await mcpPost(url, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "databard-probe", version: "1.0" },
    },
  });
  // A challenge up front still counts — the endpoint IS the paywall.
  if (init.status === 402) return { attempt: init };
  const initResult = init.rpc?.result as Record<string, unknown> | undefined;
  if (!initResult) return null;
  const serverName =
    typeof (initResult.serverInfo as Record<string, unknown> | undefined)?.name === "string"
      ? ((initResult.serverInfo as Record<string, unknown>).name as string)
      : undefined;
  const sessionId = init.sessionId;

  // Tell the server we're ready, then list its tools.
  await mcpPost(url, { jsonrpc: "2.0", method: "notifications/initialized" }, sessionId).catch(() => undefined);
  const tools = await mcpPost(
    url,
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    sessionId,
  );
  if (tools.status === 402) return { attempt: tools, serverName, sessionId };
  const toolsResult = tools.rpc?.result as Record<string, unknown> | undefined;
  const toolList = Array.isArray(toolsResult?.tools)
    ? (toolsResult.tools as McpTool[])
    : undefined;
  return {
    attempt: tools,
    serverName,
    toolCount: toolList?.length,
    tools: toolList,
    sessionId,
  };
}

// ── Listing check (one unpaid request — never pays) ───────────────────────

export async function checkListing(
  service: MarketplaceService,
): Promise<ListingCheck> {
  // Endpoint templates like /token/{symbol} are checked with a stand-in value.
  let url = service.endpoint;
  const templateSubstituted = /\{[^}]+\}/.test(url);
  if (templateSubstituted) url = url.replace(/\{[^}]+\}/g, "BTC");

  assertPublicUrl(url); // SSRF guard — throws before any network I/O

  let latencyMs = 0;
  let checkedMethod: "POST" | "GET" = "POST";

  const attempt = (method: "POST" | "GET") => sendAttempt(url, method);

  // Some listings are GET-only but don't answer 405 — they 404, or return a
  // JSON body saying the endpoint is unknown for POST. Detect and retry GET.
  const saysWrongMethod = (a: Attempt): boolean => {
    const obj = a.bodyJson && typeof a.bodyJson === "object" ? (a.bodyJson as Record<string, unknown>) : null;
    const errStr = [obj?.error, obj?.message, obj?.msg]
      .filter((v) => typeof v === "string")
      .join(" ");
    return /unknown endpoint|method not allowed|not allowed|for POST|only GET|use GET|cannot POST/i.test(
      errStr,
    );
  };

  const isErrorResponse = (a: Attempt): boolean => {
    if (a.status >= 400) return true;
    const obj = a.bodyJson && typeof a.bodyJson === "object" ? (a.bodyJson as Record<string, unknown>) : null;
    if (!obj) return false;
    if (typeof obj.error === "string" || obj.ok === false || obj.success === false) return true;
    if (typeof obj.code === "string" && /ERROR|REQUIRED|INVALID/i.test(obj.code)) return true;
    return false;
  };

  const looksMcp = (a: Attempt): boolean => {
    try {
      if (/\/mcp\/?$/i.test(new URL(url).pathname)) return true;
    } catch {
      // malformed URL — assertPublicUrl already ran, ignore
    }
    if (a.status === 202) return true;
    const obj = a.bodyJson && typeof a.bodyJson === "object" ? (a.bodyJson as Record<string, unknown>) : null;
    if (obj && (obj.jsonrpc !== undefined || (obj.error !== undefined && obj.id !== undefined))) return true;
    if (a.status >= 200 && a.status < 300 && a.bodyJson === null) return true;
    return false;
  };

  let mcp: McpOutcome | null = null;

  try {
    let a = await attempt("POST");
    if (a.status === 404 || a.status === 405 || (a.status >= 200 && a.status < 500 && saysWrongMethod(a))) {
      const g = await attempt("GET");
      // Keep whichever attempt is more informative: prefer a 402 challenge,
      // then the response that isn't an error.
      const better =
        g.status === 402 ? g :
        a.status === 402 ? a :
        !isErrorResponse(g) && isErrorResponse(a) ? g :
        g;
      a = better;
      checkedMethod = a === g ? "GET" : "POST";
    }
    if (looksMcp(a)) {
      try {
        mcp = await mcpHandshake(url);
      } catch {
        mcp = null; // handshake failed — fall back to the plain check
      }
      if (mcp) {
        a = mcp.attempt;
        checkedMethod = "POST";
      }
    }
    latencyMs = a.latencyMs;
    const challenge = a.status === 402 ? decodeChallenge(a.challengeHeader, a.bodyJson) : null;
    return {
      service,
      checkedUrl: url,
      checkedMethod,
      templateSubstituted,
      status: a.status,
      latencyMs,
      contentType: a.contentType,
      bodySnippet: a.bodySnippet,
      bodyJson: a.bodyJson,
      challengeHeader: a.challengeHeader,
      challenge,
      challengeRaw: a.status === 402 ? rawChallengeOf(a.challengeHeader, a.bodyJson).raw : null,
      ...(mcp
        ? {
            protocol: "mcp" as const,
            mcpServerName: mcp.serverName,
            toolCount: mcp.toolCount,
            mcpTools: mcp.tools,
          }
        : {}),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return {
      service,
      checkedUrl: url,
      checkedMethod,
      templateSubstituted,
      status: 0,
      latencyMs: latencyMs || CHECK_TIMEOUT_MS,
      contentType: "",
      bodySnippet: "",
      bodyJson: null,
      challengeHeader: null,
      challenge: null,
      error: msg.includes("abort") ? `Timeout after ${CHECK_TIMEOUT_MS}ms` : msg,
    };
  }
}

// ── Scoring ────────────────────────────────────────────────────────────────

/** Envelope/protocol keys that don't count as payload content. */
const META_KEYS = new Set([
  "error", "message", "msg", "code", "ok", "success", "status", "statusCode",
  "jsonrpc", "id", "timestamp", "requestId", "request_id", "detail",
]);

/** True only when a 2xx body carries real content: a non-empty array, a
    populated data/result payload, or ≥3 substantive object keys. Thin or
    empty JSON on a paid listing is NOT proof it skipped the paywall. */
/** JSON-RPC/MCP protocol metadata keys — a handshake or tools/list result is
    protocol chatter, not a delivered payload. */
const RPC_META_KEYS = new Set([
  "tools", "resources", "prompts", "serverInfo", "capabilities", "protocolVersion",
]);

function isSubstantiveJson(body: unknown): boolean {
  if (Array.isArray(body)) return body.length > 0;
  if (!body || typeof body !== "object") return false;
  const obj = body as Record<string, unknown>;
  // JSON-RPC envelope: unwrap result, but treat protocol metadata
  // (tools/list, initialize responses) as non-substantive.
  if (obj.jsonrpc === "2.0") {
    const result = obj.result;
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return Array.isArray(result) && result.length > 0;
    }
    const r = result as Record<string, unknown>;
    const keys = Object.keys(r);
    if (keys.length > 0 && keys.every((k) => RPC_META_KEYS.has(k))) return false;
    return isSubstantiveJson(r);
  }
  for (const k of ["data", "result"]) {
    const v = obj[k];
    if (Array.isArray(v) && v.length > 0) return true;
    if (v && typeof v === "object" && Object.keys(v).length > 0) return true;
    if (typeof v === "string" && v.trim().length > 0) return true;
  }
  return Object.keys(obj).filter((k) => !META_KEYS.has(k)).length >= 3;
}

/** True when the response signals an application-level error rather than a
    delivered payload — 4xx, or a 2xx body carrying an error marker. */
function bodyHasErrorSignal(check: ListingCheck): boolean {
  if (check.status >= 400 && check.status !== 402) return true;
  const obj =
    check.bodyJson && typeof check.bodyJson === "object"
      ? (check.bodyJson as Record<string, unknown>)
      : null;
  if (!obj) return false;
  if (typeof obj.error === "string" || obj.ok === false || obj.success === false) return true;
  if (typeof obj.code === "string" && /ERROR|REQUIRED|INVALID/i.test(obj.code)) return true;
  return false;
}

// ── Valid-request probe (unpaid — reach the gate or prove delivery) ───────

export interface ValidCallProbe {
  /** Where the request shape came from. */
  inputSource?: string;
  /** Skipped because the tool/endpoint may move money or mutate state. */
  sideEffectSkipped?: boolean;
  /** MCP tool called, when protocol is mcp. */
  toolName?: string;
  /** Evidence of every request we sent. */
  attempts: AttemptEvidence[];
  /** Final synthesized-call outcome. */
  status?: number;
  bodyJson?: unknown;
  challenge?: PaymentChallenge | null;
  challengeHeader?: string | null;
  challengeRaw?: Record<string, unknown> | null;
  /** What to re-send with payment headers. */
  request?: {
    method: "POST" | "GET";
    url: string;
    body?: Record<string, unknown>;
    mcpTool?: string;
    mcpSessionId?: string;
  };
}

/**
 * Build a valid request from whatever the service exposes (MCP inputSchema,
 * 402 challenge carriers, rejection-body field names, listing description)
 * and send it unpaid. Repair once on a 400/422 that names more fields.
 */
export async function probeValidCall(
  service: MarketplaceService,
  check: ListingCheck,
): Promise<ValidCallProbe | null> {
  if (check.status === 0 || check.status === 404 || check.status >= 500) return null;

  const inputs = discoverInputs({
    serviceName: `${service.serviceName} ${service.agentName}`,
    description: service.description,
    challengeRaw: check.challengeRaw,
    bodyJson: check.bodyJson,
    mcpTools: check.mcpTools,
  });
  if (!inputs) {
    // tools/list succeeded but every tool is side-effecting — record the skip
    // so the service isn't silently "no input contract".
    const tools = check.mcpTools ?? [];
    if (tools.length > 0 && tools.every((t) => isSideEffecting("", t.name))) {
      return {
        inputSource: "mcp_tools",
        sideEffectSkipped: true,
        toolName: tools[0].name,
        attempts: [],
      };
    }
    return null;
  }

  const toolName = inputs.toolName;
  if (isSideEffecting(service.endpoint, toolName)) {
    return {
      inputSource: inputs.source,
      sideEffectSkipped: true,
      toolName,
      attempts: [],
    };
  }

  const attempts: AttemptEvidence[] = [];

  // ── MCP: tools/call with synthesized arguments ────────────────────────
  if (check.protocol === "mcp" && toolName) {
    const hs = await mcpHandshake(check.checkedUrl).catch(() => null);
    if (!hs) return null;
    const args = synthesizeBody(inputs.fields, inputs.exampleBody);
    const payload = {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    };
    const res = await mcpPost(check.checkedUrl, payload, hs?.sessionId);
    attempts.push({
      method: "POST",
      url: check.checkedUrl,
      body: JSON.stringify(payload).slice(0, 500),
      status: res.status,
      snippet: res.bodySnippet.slice(0, SNIPPET_BODY),
    });
    const challenge = res.status === 402
      ? decodeChallenge(res.challengeHeader, res.bodyJson)
      : null;
    const bodyJson =
      res.rpc?.result !== undefined
        ? (res.rpc.result as Record<string, unknown>)
        : res.rpc?.error !== undefined
          ? { error: res.rpc.error }
          : res.bodyJson;
    return {
      inputSource: inputs.source,
      toolName,
      attempts,
      status: res.status,
      bodyJson,
      challenge,
      challengeHeader: res.challengeHeader,
      challengeRaw: res.status === 402 ? rawChallengeOf(res.challengeHeader, res.bodyJson).raw : null,
      request: {
        method: "POST",
        url: check.checkedUrl,
        mcpTool: toolName,
        mcpSessionId: hs?.sessionId,
        body: args,
      },
    };
  }

  // ── HTTP: synthesized body (POST) or query (GET) ──────────────────────
  let fields = inputs.fields;
  let body = synthesizeBody(fields, inputs.exampleBody);
  const method = check.checkedMethod;
  let res: Attempt | null = null;
  for (let tries = 0; tries < 2; tries++) {
    res = await sendAttempt(check.checkedUrl, method, body);
    attempts.push({
      method,
      url: check.checkedUrl,
      body: method === "POST" ? JSON.stringify(body).slice(0, 500) : undefined,
      status: res.status,
      snippet: res.bodySnippet.slice(0, SNIPPET_BODY),
    });
    // Repair: a 400/422 naming new missing fields gets one retry with them.
    if ((res.status === 400 || res.status === 422) && tries === 0) {
      const more = extractFieldNames(res.bodyJson).filter(
        (n) => !fields.some((f) => f.name === n),
      );
      if (more.length === 0) break;
      fields = [...fields, ...more.map((name) => ({ name, required: true }) as FieldSpec)];
      body = { ...body, ...synthesizeBody(more.map((name) => ({ name, required: true }))) };
      continue;
    }
    break;
  }
  if (!res) return null;
  const challenge = res.status === 402
    ? decodeChallenge(res.challengeHeader, res.bodyJson)
    : null;
  return {
    inputSource: inputs.source,
    attempts,
    status: res.status,
    bodyJson: res.bodyJson,
    challenge,
    challengeHeader: res.challengeHeader,
    challengeRaw: res.status === 402 ? rawChallengeOf(res.challengeHeader, res.bodyJson).raw : null,
    request: { method, url: check.checkedUrl, body },
  };
}

// ── Paid verification (the $1/day ledger spends here) ─────────────────────

/**
 * Sign the x402 challenge and re-send the valid request with payment
 * headers. Counts as spend only when a settlement tx appears or the service
 * delivered. Returns the verification record + response outcome.
 */
async function paidVerify(
  probe: ValidCallProbe,
  check: ListingCheck,
  service: MarketplaceService,
): Promise<{ record: PaidVerification; bodyJson: unknown; substantive: boolean }> {
  const record: PaidVerification = {
    at: new Date().toISOString(),
    delivered: false,
    amountUsd: probe.challenge?.amountUsd ?? check.challenge?.amountUsd ?? service.feeUsd,
  };
  const challengeHeader = probe.challengeHeader ?? check.challengeHeader;
  if (!challengeHeader || !probe.request) {
    record.error = "No 402 challenge or request to replay";
    return { record, bodyJson: null, substantive: false };
  }
  const paymentHeaders = await attemptX402Payment(challengeHeader);
  if (!paymentHeaders) {
    record.error = "Could not sign payment (PROBE_PAYER_PK unset or SDK error)";
    return { record, bodyJson: null, substantive: false };
  }
  try {
    let status: number;
    let snippet: string;
    let bodyJson: unknown;
    let settleHeader: string | null;
    if (probe.request.mcpTool) {
      const res = await mcpPost(
        probe.request.url,
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: probe.request.mcpTool, arguments: probe.request.body ?? {} },
        },
        probe.request.mcpSessionId,
        paymentHeaders,
      );
      status = res.status;
      snippet = res.bodySnippet;
      settleHeader = res.settleHeader ?? null;
      bodyJson =
        res.rpc?.result !== undefined
          ? (res.rpc.result as Record<string, unknown>)
          : res.bodyJson;
      probe.attempts.push({
        method: "POST",
        url: probe.request.url,
        body: JSON.stringify({ tool: probe.request.mcpTool, arguments: probe.request.body }).slice(0, 500),
        status,
        snippet: snippet.slice(0, SNIPPET_BODY),
        paid: true,
      });
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
      const req = probe.request;
      let target = req.url;
      if (req.method === "GET" && req.body && Object.keys(req.body).length > 0) {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(req.body)) {
          qs.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
        }
        target = `${req.url}${req.url.includes("?") ? "&" : "?"}${qs.toString()}`;
      }
      const res = await fetch(target, {
        method: req.method,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...paymentHeaders,
        },
        ...(req.method === "POST" ? { body: JSON.stringify(req.body ?? {}) } : {}),
      });
      clearTimeout(timeout);
      status = res.status;
      snippet = (await res.text()).slice(0, MAX_BODY);
      settleHeader = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("payment-response");
      try {
        bodyJson = JSON.parse(snippet);
      } catch {
        bodyJson = null;
      }
      probe.attempts.push({
        method: req.method,
        url: target,
        body: req.method === "POST" ? JSON.stringify(req.body).slice(0, 500) : undefined,
        status,
        snippet: snippet.slice(0, SNIPPET_BODY),
        paid: true,
      });
    }
    if (settleHeader) {
      try {
        const settle = JSON.parse(Buffer.from(settleHeader, "base64").toString("utf-8"));
        if (typeof settle?.transaction === "string") record.settlementTx = settle.transaction;
      } catch {
        // settlement header not parseable — non-fatal
      }
    }
    record.status = status!;
    const substantive = status! < 400 && isSubstantiveJson(bodyJson);
    record.delivered = substantive;
    return { record, bodyJson, substantive };
  } catch (e) {
    record.error = e instanceof Error ? e.message : "Paid verification request failed";
    return { record, bodyJson: null, substantive: false };
  }
}

// ── Scoring v2 — weighted sub-scores; unknowns stay unknown ───────────────

export interface ListingVerdict {
  score: number;
  status: IndexedService["status"];
  checks: Record<string, CheckScore>;
  flags: string[];
  verification: VerificationLevel;
  subScores: SubScores;
}

/**
 * Score a listing from the liveness check plus (when possible) a valid
 * synthesized request and an optional paid verification.
 *
 * Sub-scores are 0–100 or null = unknown — the weighted mean only counts
 * what we actually measured. Hard fails (availability 0, paymentIntegrity 0,
 * delivery 0) pin the status to broken; an available service whose payment
 * and delivery are both unknown is "unverified", not "degraded".
 */
export function scoreListing(
  check: ListingCheck,
  service: MarketplaceService,
  probe?: ValidCallProbe | null,
  paidResult?: { record: PaidVerification; bodyJson: unknown; substantive: boolean } | null,
): ListingVerdict {
  const flags: string[] = [];
  const checks: Record<string, CheckScore> = {};
  const feeUsd = service.feeUsd;

  if (check.templateSubstituted) {
    flags.push("Templated endpoint (checked with BTC)");
  }
  if (probe?.sideEffectSkipped) {
    flags.push("Skipped active call: service may have side effects");
  }

  // Network error / SSRF reject → unreachable, score 0.
  if (check.status === 0) {
    checks.availability = { pass: "fail", detail: check.error ?? "No response" };
    return {
      score: 0,
      status: "unreachable",
      checks,
      flags,
      verification: "none",
      subScores: { availability: 0, paymentIntegrity: null, delivery: null },
    };
  }

  // ── availability ───────────────────────────────────────────────────────
  let availability: number;
  if (check.status === 404) {
    availability = 0;
    flags.push("Endpoint not found (404)");
    checks.availability = {
      pass: "fail",
      detail: `HTTP 404 — listing endpoint does not exist${check.checkedMethod === "GET" ? " (POST and GET)" : ""}`,
    };
  } else if (check.status >= 500) {
    availability = 0;
    flags.push(`Server error ${check.status}`);
    checks.availability = { pass: "fail", detail: `HTTP ${check.status}` };
  } else {
    const latencyBonus =
      check.latencyMs <= 1000 ? 40 : check.latencyMs <= 3000 ? 30 : check.latencyMs <= 8000 ? 20 : 10;
    availability = 60 + latencyBonus;
    checks.availability = {
      pass: "pass",
      detail: `HTTP ${check.status} via ${check.checkedMethod} in ${check.latencyMs}ms`,
    };
  }

  // ── effective response = best evidence we have ────────────────────────
  // The synthesized valid call (when it ran) supersedes the bare-{} check:
  // a 402 to a real request is the gate; a 4xx to `{}` is just validation.
  const effStatus = probe?.status ?? check.status;
  const effBody = probe ? probe.bodyJson : check.bodyJson;
  const challenge = probe?.challenge ?? check.challenge;
  const challenged = (probe ? probe.status === 402 : false) || check.status === 402;
  const decodableChallenge = challenged && challenge && !challenge.undecodable;

  // ── paymentIntegrity ──────────────────────────────────────────────────
  let paymentIntegrity: number | null = null;
  if (feeUsd > 0) {
    if (decodableChallenge) {
      paymentIntegrity = 100;
      if (challenge.network !== "eip155:196") {
        paymentIntegrity = 60;
        flags.push(`Payment challenge on ${challenge.network ?? "an unknown network"}, not eip155:196`);
      }
      if (challenge.amountUsd !== undefined) {
        const listed = feeUsd;
        const actual = challenge.amountUsd;
        if (actual > listed * 1.01 + 1e-9) {
          paymentIntegrity = Math.min(paymentIntegrity, 40);
          flags.push(`Charges $${actual}, listing says $${listed}`);
        } else if (actual < listed * 0.99 - 1e-9) {
          paymentIntegrity = Math.min(paymentIntegrity, 80);
          flags.push(`Charges $${actual}, listing says $${listed}`);
        }
      }
      if (isInternalHost(challenge.resourceUrl)) {
        paymentIntegrity = Math.min(paymentIntegrity, 50);
        flags.push("Payment challenge advertises an internal URL");
      }
      checks.paymentIntegrity = {
        pass: paymentIntegrity >= 100 ? "pass" : "partial",
        detail: `x402 challenge decodable${challenge.network === "eip155:196" ? " on X Layer (eip155:196)" : ` on ${challenge.network ?? "?"}`}${challenge.amountUsd !== undefined ? `, asks $${challenge.amountUsd} vs listed $${feeUsd}` : ""}`,
      };
    } else if (challenged) {
      // 402 but undecodable — gate exists, integrity unverifiable.
      flags.push("402 but the payment challenge could not be decoded");
      checks.paymentIntegrity = { pass: "partial", detail: "Undecodable PAYMENT-REQUIRED" };
      paymentIntegrity = null;
    } else if (effStatus >= 200 && effStatus < 300 && isSubstantiveJson(effBody)) {
      // Real payload without payment on a paid listing — the one true
      // accusation, and only on substantive responses.
      paymentIntegrity = 0;
      flags.push(`Listed at $${feeUsd} but returned a response without requesting payment`);
      checks.paymentIntegrity = { pass: "fail", detail: `HTTP ${effStatus}, substantive payload, no 402` };
    } else {
      // Gate never reached — validation errors, docs pages, empty accepts,
      // MCP per-tool paywalls. Unknown, not bad.
      paymentIntegrity = null;
      if (check.protocol === "mcp" && !(probe && probe.status === 402)) {
        flags.push("MCP server — payment is enforced per tool call; listing-level gate not checked");
      } else if (probe && effStatus >= 400) {
        flags.push(`Payment gate not reached — valid request still rejected (HTTP ${effStatus})`);
      }
      checks.paymentIntegrity = {
        pass: "partial",
        detail: "Payment gate not reached — integrity not verifiable",
      };
    }
  } else {
    if (challenged) {
      paymentIntegrity = 0;
      flags.push("Listed free but demands payment");
      checks.paymentIntegrity = { pass: "fail", detail: "402 challenge on a $0 listing" };
    } else {
      paymentIntegrity = 100;
      checks.paymentIntegrity = { pass: "pass", detail: "Free listing, no payment demanded" };
    }
  }

  // ── delivery ───────────────────────────────────────────────────────────
  let delivery: number | null = null;
  let deliveredBody: unknown = null;
  const validCallRan = probe !== null && probe !== undefined && !probe.sideEffectSkipped;
  if (paidResult) {
    if (paidResult.substantive) {
      deliveredBody = paidResult.bodyJson;
      delivery = 100;
    } else {
      delivery = 0;
      checks.delivery = {
        pass: "fail",
        detail: `Paid and ${paidResult.record.error ? `failed: ${paidResult.record.error}` : `returned HTTP ${paidResult.record.status} without a substantive payload`}`,
      };
      flags.push(
        paidResult.record.error
          ? `Paid verification failed: ${paidResult.record.error}`
          : `Payment signed but request returned HTTP ${paidResult.record.status}`,
      );
    }
  }
  if (delivery === null && validCallRan && effStatus >= 200 && effStatus < 300) {
    if (isSubstantiveJson(effBody)) {
      deliveredBody = effBody;
      delivery = 100;
    } else {
      delivery = 60;
    }
  } else if (delivery === null && validCallRan && feeUsd === 0 && effStatus >= 400) {
    // Free listing that fails a best-effort valid request — broken in
    // practice, not merely unknown.
    delivery = 0;
    flags.push(`Free service rejected a synthesized valid request (HTTP ${effStatus})`);
  }
  // Stale data halves delivery credit — honest, dated payload is still a
  // payload but the service isn't fresh.
  if (deliveredBody) {
    const staleDate = isStalePayload(deliveredBody);
    if (staleDate) {
      delivery = 50;
      flags.push(`Stale data (dated ${staleDate})`);
    }
  }
  if (delivery === null && !checks.delivery) {
    checks.delivery = {
      pass: "partial",
      detail: validCallRan
        ? `Valid request returned HTTP ${effStatus} — delivery not proven`
        : probe?.sideEffectSkipped
          ? "Not called — service may have side effects"
          : "No input contract discovered — not called",
    };
  } else if (delivery !== null) {
    checks.delivery = {
      pass: delivery >= 80 ? "pass" : delivery > 0 ? "partial" : "fail",
      detail:
        delivery === 100
          ? `Delivered a substantive payload (HTTP ${effStatus}${paidResult ? ", paid" : ""})`
          : delivery === 60
            ? `HTTP ${effStatus} but thin/empty payload`
            : delivery === 50
              ? "Delivered but data is stale"
              : (checks.delivery?.detail ?? "Delivery failed"),
    };
  }

  // ── verification level ─────────────────────────────────────────────────
  const verification: VerificationLevel =
    paidResult && !paidResult.substantive
      ? "failed"
      : delivery === 100 || (delivery === 60 && feeUsd === 0) || (deliveredBody !== null && delivery !== 0)
        ? "delivered"
        : decodableChallenge
          ? "gate"
          : "none";

  // ── overall ────────────────────────────────────────────────────────────
  const subScores: SubScores = { availability, paymentIntegrity, delivery };
  const weights: [number | null, number][] = [
    [availability, 30],
    [paymentIntegrity, 30],
    [delivery, 40],
  ];
  const known = weights.filter(([v]) => v !== null) as [number, number][];
  const score = known.length
    ? Math.round(known.reduce((s, [v, w]) => s + v * w, 0) / known.reduce((s, [, w]) => s + w, 0))
    : 0;

  const status: IndexedService["status"] =
    availability === 0 || paymentIntegrity === 0 || delivery === 0
      ? "broken"
      : paymentIntegrity === null && delivery === null
        ? "unverified"
        : score >= 80
          ? "healthy"
          : "degraded";

  return { score, status, checks, flags, verification, subScores };
}

// ── Verify ledger ($1/day, keyed by UTC date) ──────────────────────────────

interface SpendLedger {
  [date: string]: { spentUsd: number; entries: { serviceId: string; amountUsd: number; settlementTx?: string }[] };
}

async function readSpend(): Promise<SpendLedger> {
  try {
    return JSON.parse(await fs.readFile(SPEND_FILE, "utf-8"));
  } catch {
    return {};
  }
}

async function readPaidVerifications(): Promise<Record<string, PaidVerification>> {
  try {
    return JSON.parse(await fs.readFile(PAID_VERIFICATIONS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function dailyVerifyBudget(): number {
  const n = Number(process.env.INDEX_DAILY_VERIFY_BUDGET_USD);
  const budget = Number.isFinite(n) && n > 0 ? n : 1.0;
  return Math.min(budget, VERIFY_DAILY_MAX_USD);
}

export interface VerifyCandidate {
  serviceId: string;
  ours: boolean;
  feeUsd: number;
  /** A valid request can be replayed with payment headers. */
  callable: boolean;
  /** A decodable x402 challenge was seen this run (probe or plain check). */
  gateReached: boolean;
  sideEffectSkipped: boolean;
}

/**
 * Paid-verification eligibility + ordering: non-ours, fee ≤ $0.05, callable,
 * gate reached, no side effects, not verified in the last 72h. Never-verified
 * first, then oldest verification, then cheapest.
 */
export function pickVerifyTargets(
  candidates: VerifyCandidate[],
  prevPaid: Record<string, PaidVerification>,
  now = Date.now(),
): VerifyCandidate[] {
  return candidates
    .filter((r) => {
      if (r.ours || r.feeUsd <= 0 || r.feeUsd > VERIFY_MAX_FEE_USD) return false;
      if (!r.callable || !r.gateReached || r.sideEffectSkipped) return false;
      const last = prevPaid[r.serviceId];
      if (last && now - Date.parse(last.at) < VERIFY_RECHECK_MS) return false;
      return true;
    })
    .sort((a, b) => {
      const la = prevPaid[a.serviceId]?.at;
      const lb = prevPaid[b.serviceId]?.at;
      if (!la && lb) return -1;
      if (la && !lb) return 1;
      if (la && lb && la !== lb) return la.localeCompare(lb);
      return a.feeUsd - b.feeUsd;
    });
}

// ── Index run ──────────────────────────────────────────────────────────────

async function readHistory(): Promise<{ runAt: string; results: { serviceId: string; status: string }[] }[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function computeUptime(
  history: { runAt: string; results: { serviceId: string; status: string }[] }[],
): Map<string, number> {
  const totals = new Map<string, { up: number; n: number }>();
  for (const run of history) {
    for (const r of run.results) {
      const t = totals.get(r.serviceId) ?? { up: 0, n: 0 };
      t.n += 1;
      if (r.status === "healthy" || r.status === "degraded") t.up += 1;
      totals.set(r.serviceId, t);
    }
  }
  const out = new Map<string, number>();
  for (const [id, t] of totals) out.set(id, Math.round((t.up / t.n) * 100));
  return out;
}

export interface RunIndexOptions {
  /** Paid verification pass under the daily ledger budget. */
  verify?: boolean;
  /** Write the index verdict hash to X Layer. */
  attest?: boolean;
}

export async function runIndex(opts: RunIndexOptions = {}): Promise<MarketplaceIndex> {
  const generatedAt = new Date().toISOString();
  const prevIndex = await getLatestIndex();
  const prevPaid = await readPaidVerifications();
  const spend = await readSpend();
  const today = generatedAt.slice(0, 10);
  const daySpend = spend[today]?.spentUsd ?? 0;
  const budget = dailyVerifyBudget();

  const results: IndexedService[] = [];
  const checkById = new Map<string, ListingCheck>();
  const probeById = new Map<string, ValidCallProbe | null>();
  const queue = [...MARKETPLACE_SERVICES];

  async function worker() {
    for (;;) {
      const service = queue.shift();
      if (!service) break;
      const ours = service.agentId === OUR_AGENT_ID;
      let check: ListingCheck;
      try {
        check = await checkListing(service);
      } catch (e) {
        results.push({
          ...service,
          ours,
          score: 0,
          status: "unreachable",
          checks: {
            availability: { pass: "fail", detail: e instanceof Error ? e.message : "Rejected" },
          },
          flags: [],
          latencyMs: 0,
          httpStatus: 0,
          verification: "none",
          paid: false,
          subScores: { availability: 0, paymentIntegrity: null, delivery: null },
        });
        continue;
      }
      checkById.set(service.serviceId, check);
      // The fair call: synthesize a valid request and try it unpaid. Never
      // runs for dead endpoints or side-effecting services.
      let probe: ValidCallProbe | null = null;
      if (!ours) {
        try {
          probe = await probeValidCall(service, check);
        } catch {
          probe = null;
        }
      }
      probeById.set(service.serviceId, probe);
      const verdict = scoreListing(check, service, probe);
      const prior = prevPaid[service.serviceId];
      results.push({
        ...service,
        ours,
        score: verdict.score,
        status: verdict.status,
        checks: verdict.checks,
        flags: verdict.flags,
        latencyMs: check.latencyMs,
        httpStatus: check.status,
        verification: verdict.verification,
        paid: false,
        subScores: verdict.subScores,
        attempts: probe && probe.attempts.length > 0 ? probe.attempts : undefined,
        inputSource: probe?.inputSource,
        ...(prior ? { lastPaidVerification: prior } : {}),
        ...(check.protocol ? { protocol: check.protocol, mcpServerName: check.mcpServerName, toolCount: check.toolCount } : {}),
      });
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(10, queue.length) }, () => worker()),
  );

  // ── Paid verification, budgeted by the daily ledger ────────────────────
  // Eligible: gate reached this run (or a challenge captured), fee ≤ $0.05,
  // no side effects, not paid-verified in the last 72h. Never-verified
  // first, then oldest, then cheapest. Spend counts only when the payment
  // settled or the service delivered.
  let verifySpent = 0;
  let verifyAttempted = 0;
  const newPaid: Record<string, PaidVerification> = { ...prevPaid };
  const todayEntries: { serviceId: string; amountUsd: number; settlementTx?: string }[] = [
    ...(spend[today]?.entries ?? []),
  ];
  if (opts.verify) {
    const byId = new Map(results.map((r) => [r.serviceId, r]));
    const eligible = pickVerifyTargets(
      results.map((r) => {
        const probe = probeById.get(r.serviceId);
        const gateNow = !!(
          probe &&
          probe.status === 402 &&
          probe.challenge &&
          !probe.challenge.undecodable
        );
        const ch = checkById.get(r.serviceId)?.challenge;
        const gateCheck = r.httpStatus === 402 && !!ch && !ch.undecodable;
        return {
          serviceId: r.serviceId,
          ours: r.ours,
          feeUsd: r.feeUsd,
          callable: !!(probe && probe.request),
          gateReached: gateNow || gateCheck,
          sideEffectSkipped: !!probe?.sideEffectSkipped,
        };
      }),
      prevPaid,
    )
      .map((c) => byId.get(c.serviceId))
      .filter((r): r is IndexedService => !!r);
    for (const svc of eligible) {
      const cost = svc.feeUsd;
      if (daySpend + verifySpent + cost > budget) break;
      const check = checkById.get(svc.serviceId);
      const probe = probeById.get(svc.serviceId);
      if (!check || !probe) continue;
      verifyAttempted += 1;
      const paidResult = await paidVerify(probe, check, svc);
      newPaid[svc.serviceId] = paidResult.record;
      if (paidResult.record.delivered || paidResult.record.settlementTx) {
        const amt = paidResult.record.amountUsd ?? cost;
        verifySpent += amt;
        todayEntries.push({
          serviceId: svc.serviceId,
          amountUsd: amt,
          settlementTx: paidResult.record.settlementTx,
        });
      }
      // Re-score with the paid evidence included.
      const verdict = scoreListing(check, svc, probe, paidResult);
      const row = byId.get(svc.serviceId);
      if (row) {
        row.score = verdict.score;
        row.status = verdict.status;
        row.checks = verdict.checks;
        row.flags = verdict.flags;
        row.verification = verdict.verification;
        row.subScores = verdict.subScores;
        row.paid = true;
        row.attempts = probe.attempts;
        row.lastPaidVerification = paidResult.record;
        if (paidResult.record.delivered) {
          row.flags = [...row.flags, "Paid & delivered"];
        }
      }
    }
  }
  for (const r of results) {
    if (!r.lastPaidVerification && newPaid[r.serviceId]) {
      r.lastPaidVerification = newPaid[r.serviceId];
    }
  }

  // Persist + uptime
  const history = await serial("marketplace-index", async () => {
    await fs.mkdir(INDEX_DIR, { recursive: true });
    const prev = await readHistory();
    prev.push({
      runAt: generatedAt,
      results: results.map((r) => ({ serviceId: r.serviceId, status: r.status })),
    });
    const trimmed = prev.slice(-HISTORY_KEEP);
    await fs.writeFile(HISTORY_FILE, JSON.stringify(trimmed), "utf-8");
    // Paid-verification carry-forward + daily spend ledger.
    await fs.writeFile(PAID_VERIFICATIONS_FILE, JSON.stringify(newPaid), "utf-8");
    spend[today] = {
      spentUsd: Number((daySpend + verifySpent).toFixed(6)),
      entries: todayEntries,
    };
    await fs.writeFile(SPEND_FILE, JSON.stringify(spend), "utf-8");
    return trimmed;
  });
  const uptime = computeUptime(history);
  for (const r of results) r.uptimePct = uptime.get(r.serviceId) ?? (r.status === "healthy" || r.status === "degraded" ? 100 : 0);

  const ranked = results.filter((r) => !r.ours);
  const latencies = ranked.filter((r) => r.httpStatus > 0).map((r) => r.latencyMs).sort((a, b) => a - b);
  const medianLatency = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;

  const index: MarketplaceIndex = {
    kind: "okx-marketplace-index",
    generatedAt,
    crawledAt: (snapshot as { crawledAt: string }).crawledAt,
    aggregates: {
      checked: ranked.length,
      healthy: ranked.filter((r) => r.status === "healthy").length,
      degraded: ranked.filter((r) => r.status === "degraded").length,
      broken: ranked.filter((r) => r.status === "broken").length,
      unreachable: ranked.filter((r) => r.status === "unreachable").length,
      unverified: ranked.filter((r) => r.status === "unverified").length,
      priceMismatchCount: ranked.filter((r) => r.flags.some((f) => f.startsWith("Charges $"))).length,
      freeDemandsPaymentCount: ranked.filter((r) => r.flags.includes("Listed free but demands payment")).length,
      medianLatency,
      gateVerified: ranked.filter((r) => r.verification === "gate" || r.verification === "delivered" || r.verification === "failed").length,
      delivered: ranked.filter((r) => r.verification === "delivered").length,
      paidVerified: ranked.filter((r) => r.feeUsd > 0 && r.lastPaidVerification).length,
      paidDelivered: ranked.filter((r) => r.feeUsd > 0 && r.lastPaidVerification?.delivered).length,
      deliveryRate: (() => {
        const v = ranked.filter((r) => r.feeUsd > 0 && r.lastPaidVerification);
        return v.length
          ? Number((v.filter((r) => r.lastPaidVerification?.delivered).length / v.length).toFixed(3))
          : null;
      })(),
      verifySpentUsd: Number(verifySpent.toFixed(6)),
      verifyAttempted,
    },
    services: results.sort((a, b) => b.score - a.score || a.agentId.localeCompare(b.agentId)),
  };

  const compactResults = {
    kind: "okx-marketplace-index",
    generatedAt,
    services: results.map((r) => ({ serviceId: r.serviceId, score: r.score, status: r.status })),
  };

  if (opts.attest) {
    const registry = process.env.PROBE_REGISTRY_ADDRESS;
    if (registry) {
      // On-chain registry: publish only what changed since the last run —
      // other contracts gate payments on scoreOf / isSafeToPay.
      try {
        // Diff against what this registry last published, not the previous
        // index — a prev run without a matching registry attestation means
        // nothing is on-chain yet, so publish all non-ours services.
        const prevOnChain =
          prevIndex?.attestation?.registry?.toLowerCase() === registry.toLowerCase()
            ? prevIndex.services
            : null;
        const changed = diffForChain(results, prevOnChain);
        const batches = chunkBatches(changed);
        const pub = await publishIndexRun(
          indexHashOf(compactResults),
          generatedAt,
          ranked.length,
          batches,
        );
        index.attestation = pub;
      } catch (e) {
        index.attestation = { error: e instanceof Error ? e.message : "Registry publish failed" };
      }
    } else {
      try {
        const att = await attestVerdict(compactResults);
        index.attestation = { txHash: att.txHash };
      } catch (e) {
        index.attestation = { error: e instanceof Error ? e.message : "Attestation failed" };
      }
    }
  }

  await serial("marketplace-index", async () => {
    await fs.mkdir(INDEX_DIR, { recursive: true });
    await fs.writeFile(LATEST_FILE, JSON.stringify(index), "utf-8");
  });

  return index;
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function getLatestIndex(): Promise<MarketplaceIndex | null> {
  try {
    const raw = await fs.readFile(LATEST_FILE, "utf-8");
    return JSON.parse(raw) as MarketplaceIndex;
  } catch {
    return null;
  }
}

export interface FindQuery {
  agentId?: string;
  serviceId?: string;
  endpoint?: string;
  query?: string;
}

/**
 * Locate indexed services by exact ids / endpoint, or by keyword overlap
 * over name + description. Exact matches rank first; keyword matches are
 * scored by token hits.
 */
export function findServices(
  index: MarketplaceIndex,
  q: FindQuery,
): IndexedService[] {
  const out: { svc: IndexedService; rank: number }[] = [];
  const tokens = (q.query ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  const endpointNorm = q.endpoint?.toLowerCase().replace(/\/+$/, "");

  for (const svc of index.services) {
    if (q.serviceId && svc.serviceId === q.serviceId) out.push({ svc, rank: 100 });
    else if (q.agentId && svc.agentId === q.agentId) out.push({ svc, rank: 90 });
    else if (endpointNorm && svc.endpoint.toLowerCase().replace(/\/+$/, "") === endpointNorm)
      out.push({ svc, rank: 80 });
    else if (endpointNorm && svc.endpoint.toLowerCase().includes(endpointNorm.replace(/^https?:\/\//, "")))
      out.push({ svc, rank: 60 });
    else if (tokens.length) {
      const hay = `${svc.agentName} ${svc.serviceName} ${svc.description} ${svc.category}`.toLowerCase();
      const hits = tokens.filter((t) => hay.includes(t)).length;
      if (hits > 0) out.push({ svc, rank: hits });
    }
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.rank - a.rank || b.svc.score - a.svc.score)
    .map((o) => o.svc)
    .filter((s) => (seen.has(s.serviceId) ? false : (seen.add(s.serviceId), true)));
}
