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
  error?: string;
}

export interface CheckScore {
  pass: "pass" | "partial" | "fail";
  detail: string;
}

export interface DeepCheck {
  attempted: boolean;
  delivered: boolean;
  status?: number;
  settlementTx?: string;
  amountUsd?: number;
  error?: string;
}

export interface IndexedService extends MarketplaceService {
  ours: boolean;
  score: number;
  status: "healthy" | "degraded" | "broken" | "unreachable";
  checks: Record<string, CheckScore>;
  flags: string[];
  latencyMs: number;
  httpStatus: number;
  deep?: DeepCheck;
  /** Share of recent runs where this service was healthy or degraded. */
  uptimePct?: number;
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
    deepChecked: number;
    deepSpentUsd: number;
  };
  attestation?: { txHash?: string; error?: string };
  services: IndexedService[];
}

// ── Constants ──────────────────────────────────────────────────────────────

export const OUR_AGENT_ID = "9878";
const CHECK_TIMEOUT_MS = 10_000;
const MAX_BODY = 2_048;
const HISTORY_KEEP = 90;
const DEEP_MAX_FEE_USD = 0.02;
const DEEP_HARD_CAP_USD = 0.25;

const INDEX_DIR = getDataPath("marketplace-index");
const LATEST_FILE = path.join(INDEX_DIR, "latest.json");
const HISTORY_FILE = path.join(INDEX_DIR, "history.json");

/** Services from the committed marketplace snapshot. */
export const MARKETPLACE_SERVICES: MarketplaceService[] = (
  snapshot as { services: MarketplaceService[] }
).services;

// ── Challenge decoding ─────────────────────────────────────────────────────

function decodeChallenge(
  header: string | null,
  bodyJson: unknown,
): PaymentChallenge | null {
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
  if (raw == null) return undecodable ? { undecodable: true } : null;

  const obj = raw as Record<string, unknown>;
  const accepts = (Array.isArray(obj.accepts) ? obj.accepts : undefined) ??
    (Array.isArray(obj.paymentRequirements) ? obj.paymentRequirements : undefined);
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

// ── Listing check (one unpaid request — never pays) ───────────────────────

export async function checkListing(
  service: MarketplaceService,
): Promise<ListingCheck> {
  // Endpoint templates like /token/{symbol} are checked with a stand-in value.
  let url = service.endpoint;
  const templateSubstituted = /\{[^}]+\}/.test(url);
  if (templateSubstituted) url = url.replace(/\{[^}]+\}/g, "BTC");

  assertPublicUrl(url); // SSRF guard — throws before any network I/O

  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  let latencyMs = 0;
  let checkedMethod: "POST" | "GET" = "POST";

  interface Attempt {
    status: number;
    latencyMs: number;
    contentType: string;
    bodySnippet: string;
    bodyJson: unknown;
    challengeHeader: string | null;
  }

  async function attempt(method: "POST" | "GET"): Promise<Attempt> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    const start = Date.now();
    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers,
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      const latency = Date.now() - start;
      const snippet = (await res.text()).slice(0, MAX_BODY);
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(snippet);
      } catch {
        // not JSON — fine
      }
      return {
        status: res.status,
        latencyMs: latency,
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
    latencyMs = a.latencyMs;
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
      challenge: a.status === 402 ? decodeChallenge(a.challengeHeader, a.bodyJson) : null,
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

export interface ListingVerdict {
  score: number;
  status: IndexedService["status"];
  checks: Record<string, CheckScore>;
  flags: string[];
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

export function scoreListing(
  check: ListingCheck,
  service: MarketplaceService,
): ListingVerdict {
  const flags: string[] = [];
  const checks: Record<string, CheckScore> = {};
  const feeUsd = service.feeUsd;

  if (check.templateSubstituted) {
    flags.push("Templated endpoint (checked with BTC)");
  }

  // Network error / SSRF reject → unreachable, score 0.
  if (check.status === 0) {
    checks.responds = { pass: "fail", detail: check.error ?? "No response" };
    return { score: 0, status: "unreachable", checks, flags };
  }

  // ── responds (25) ──────────────────────────────────────────────────────
  let responds = 0;
  let dead = false;
  if (check.status === 404) {
    dead = true;
    flags.push("Endpoint not found (404)");
    checks.responds = {
      pass: "fail",
      detail: `HTTP 404 — listing endpoint does not exist${check.checkedMethod === "GET" ? " (POST and GET)" : ""}`,
    };
  } else if (check.status >= 500) {
    dead = true;
    flags.push(`Server error ${check.status}`);
    checks.responds = { pass: "fail", detail: `HTTP ${check.status}` };
  } else {
    // Any non-5xx, non-404 response counts — including a 402 challenge and a
    // 400/422 JSON complaint about our empty body (we sent no arguments).
    responds = 25;
    checks.responds = {
      pass: "pass",
      detail: `HTTP ${check.status} via ${check.checkedMethod} in ${check.latencyMs}ms`,
    };
  }

  // ── paymentGate (30) ───────────────────────────────────────────────────
  let gate = 0;
  const challenged = check.status === 402;
  const ch = check.challenge;
  /** Paid listing whose response errored before reaching the payment gate —
      neutral: input validation before payment is a legitimate design. */
  let gateNotReached = false;
  if (feeUsd > 0) {
    if (!challenged) {
      if (bodyHasErrorSignal(check)) {
        gateNotReached = true;
        gate = 15;
        flags.push("Payment gate not reached — service rejects empty input before payment");
        checks.paymentGate = {
          pass: "partial",
          detail: `HTTP ${check.status} with an error body — input validation may precede the paywall`,
        };
      } else {
        flags.push(`Listed at $${feeUsd} but returned a response without requesting payment`);
        checks.paymentGate = { pass: "fail", detail: `HTTP ${check.status}, no 402 challenge` };
      }
    } else if (ch?.undecodable || !ch) {
      flags.push("402 but the payment challenge could not be decoded");
      checks.paymentGate = { pass: "fail", detail: "Undecodable PAYMENT-REQUIRED" };
    } else if (ch.network === "eip155:196") {
      gate = 30;
      checks.paymentGate = { pass: "pass", detail: "x402 exact challenge on X Layer (eip155:196)" };
    } else {
      gate = 15;
      flags.push(`Payment challenge on ${ch.network ?? "an unknown network"}, not eip155:196`);
      checks.paymentGate = { pass: "partial", detail: `Network ${ch.network ?? "?"}` };
    }
  } else {
    if (challenged) {
      flags.push("Listed free but demands payment");
      checks.paymentGate = { pass: "fail", detail: "402 challenge on a $0 listing" };
    } else {
      gate = 30;
      checks.paymentGate = { pass: "pass", detail: "Free listing, no payment demanded" };
    }
  }

  // ── priceMatch (15) ────────────────────────────────────────────────────
  let price = 0;
  if (feeUsd > 0) {
    if (gateNotReached) {
      price = 7.5;
      checks.priceMatch = { pass: "partial", detail: "Not verifiable — gate not reached" };
    } else if (challenged && ch && !ch.undecodable && ch.amountUsd !== undefined) {
      const listed = feeUsd;
      const actual = ch.amountUsd;
      if (actual > listed * 1.01 + 1e-9) {
        flags.push(`Charges $${actual}, listing says $${listed}`);
        checks.priceMatch = { pass: "fail", detail: `Charged $${actual} vs listed $${listed}` };
      } else if (actual < listed * 0.99 - 1e-9) {
        price = 7.5;
        flags.push(`Charges $${actual}, listing says $${listed}`);
        checks.priceMatch = { pass: "partial", detail: `Charged $${actual} vs listed $${listed}` };
      } else {
        price = 15;
        checks.priceMatch = { pass: "pass", detail: `Charged $${actual} ≈ listed $${listed}` };
      }
    } else {
      checks.priceMatch = { pass: "fail", detail: "No decodable challenge to compare price" };
    }
  } else {
    if (!challenged) {
      price = 15;
      checks.priceMatch = { pass: "pass", detail: "Free as listed" };
    } else {
      checks.priceMatch = { pass: "fail", detail: "Free listing demanded payment" };
    }
  }

  // ── latency (15) ───────────────────────────────────────────────────────
  const latency =
    check.latencyMs <= 1000 ? 15 : check.latencyMs <= 3000 ? 10 : check.latencyMs <= 8000 ? 5 : 0;
  checks.latency = {
    pass: latency === 15 ? "pass" : latency > 0 ? "partial" : "fail",
    detail: `${check.latencyMs}ms`,
  };

  // ── json (10) ──────────────────────────────────────────────────────────
  const isJson = check.bodyJson !== null || (challenged && ch !== null && !ch.undecodable);
  checks.json = {
    pass: isJson ? "pass" : "fail",
    detail: isJson ? "JSON response" : "Non-JSON body",
  };

  // ── selfDescribing (5) ─────────────────────────────────────────────────
  let selfDescribing = false;
  if (ch?.resourceDescription && ch.resourceDescription.trim()) {
    selfDescribing = true;
  } else if (check.bodyJson && typeof check.bodyJson === "object") {
    const b = check.bodyJson as Record<string, unknown>;
    selfDescribing =
      typeof b.description === "string" ||
      typeof b.error === "string" ||
      b.schema !== undefined ||
      b.inputSchema !== undefined ||
      b.tools !== undefined;
  }
  checks.selfDescribing = {
    pass: selfDescribing ? "pass" : "fail",
    detail: selfDescribing ? "Response describes itself" : "No description/schema in response",
  };

  if (isInternalHost(ch?.resourceUrl)) {
    flags.push("Payment challenge advertises an internal URL");
  }

  let score = Math.round(responds + gate + price + latency + (isJson ? 10 : 0) + (selfDescribing ? 5 : 0));
  // A dead endpoint must never pass for degraded — cap it to "broken".
  if (dead) score = Math.min(score, 40);
  const status: IndexedService["status"] =
    score >= 80 ? "healthy" : score >= 50 ? "degraded" : "broken";
  return { score, status, checks, flags };
}

// ── Deep check (opt-in paid verification, hard-capped) ────────────────────

async function deepCheck(
  check: ListingCheck,
  service: MarketplaceService,
): Promise<DeepCheck> {
  const deep: DeepCheck = { attempted: true, delivered: false };
  if (!check.challengeHeader || check.status !== 402) {
    deep.error = "No 402 challenge to pay";
    return deep;
  }
  const paymentHeaders = await attemptX402Payment(check.challengeHeader);
  if (!paymentHeaders) {
    deep.error = "Could not sign payment (PROBE_PAYER_PK unset or SDK error)";
    return deep;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    const res = await fetch(check.checkedUrl, {
      method: check.checkedMethod,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...paymentHeaders,
      },
      ...(check.checkedMethod === "POST" ? { body: "{}" } : {}),
    });
    clearTimeout(timeout);
    deep.status = res.status;
    deep.delivered = res.status < 400;
    deep.amountUsd = check.challenge?.amountUsd ?? service.feeUsd;
    const settleHeader =
      res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("payment-response");
    if (settleHeader) {
      try {
        const settle = JSON.parse(Buffer.from(settleHeader, "base64").toString("utf-8"));
        if (typeof settle?.transaction === "string") deep.settlementTx = settle.transaction;
      } catch {
        // settlement header not parseable — non-fatal
      }
    }
    await res.text(); // drain
  } catch (e) {
    deep.error = e instanceof Error ? e.message : "Deep check request failed";
  }
  return deep;
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
  /** USD budget for paid deep checks on ≤$0.02 services. 0 = unpaid run only. */
  deepBudgetUsd?: number;
  /** Write the index verdict hash to X Layer. */
  attest?: boolean;
}

export async function runIndex(opts: RunIndexOptions = {}): Promise<MarketplaceIndex> {
  const deepBudget = Math.min(Math.max(opts.deepBudgetUsd ?? 0, 0), DEEP_HARD_CAP_USD);
  const generatedAt = new Date().toISOString();

  const results: IndexedService[] = [];
  const checkById = new Map<string, ListingCheck>();
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
            responds: { pass: "fail", detail: e instanceof Error ? e.message : "Rejected" },
          },
          flags: [],
          latencyMs: 0,
          httpStatus: 0,
        });
        continue;
      }
      checkById.set(service.serviceId, check);
      const verdict = scoreListing(check, service);
      results.push({
        ...service,
        ours,
        score: verdict.score,
        status: verdict.status,
        checks: verdict.checks,
        flags: verdict.flags,
        latencyMs: check.latencyMs,
        httpStatus: check.status,
      });
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(10, queue.length) }, () => worker()),
  );

  // Optional deep checks: cheapest paid listings first, within budget.
  let deepSpent = 0;
  let deepChecked = 0;
  if (deepBudget > 0) {
    const byId = new Map(results.map((r) => [r.serviceId, r]));
    const eligible = results
      .filter((r) => !r.ours && r.httpStatus === 402 && r.feeUsd > 0 && r.feeUsd <= DEEP_MAX_FEE_USD)
      .sort((a, b) => a.feeUsd - b.feeUsd);
    for (const svc of eligible) {
      const cost = svc.feeUsd;
      if (deepSpent + cost > deepBudget) break;
      const check = checkById.get(svc.serviceId);
      if (!check) continue;
      const deep = await deepCheck(check, svc);
      deepChecked += 1;
      if (deep.delivered || deep.settlementTx) deepSpent += deep.amountUsd ?? cost;
      const row = byId.get(svc.serviceId);
      if (row) {
        row.deep = deep;
        if (deep.delivered) {
          row.flags = [...row.flags, "Paid & delivered"];
        } else if (deep.status) {
          row.flags = [...row.flags, `Payment signed but request returned ${deep.status}`];
        }
      }
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
      priceMismatchCount: ranked.filter((r) => r.flags.some((f) => f.startsWith("Charges $"))).length,
      freeDemandsPaymentCount: ranked.filter((r) => r.flags.includes("Listed free but demands payment")).length,
      medianLatency,
      deepChecked,
      deepSpentUsd: Number(deepSpent.toFixed(6)),
    },
    services: results.sort((a, b) => b.score - a.score || a.agentId.localeCompare(b.agentId)),
  };

  if (opts.attest) {
    try {
      const att = await attestVerdict({
        kind: "okx-marketplace-index",
        generatedAt,
        services: results.map((r) => ({ serviceId: r.serviceId, score: r.score, status: r.status })),
      });
      index.attestation = { txHash: att.txHash };
    } catch (e) {
      index.attestation = { error: e instanceof Error ? e.message : "Attestation failed" };
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
