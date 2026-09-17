/**
 * Probe Runner — fetches and measures A2MCP service endpoints.
 *
 * For each candidate, it:
 *   1. Hits the discovery endpoint (GET /tools or the URL itself)
 *   2. Times the response
 *   3. Parses schema richness (inputSchema, description, examples)
 *   4. If the endpoint returns 402, optionally pays via x402 client and retries
 *   5. Returns structured ProbeMetrics for the scorer
 *
 * The runner never fakes results: unreachable endpoints get reachable=false.
 */

import type { ProbeMetrics } from "./probe-scorer";
import { checkLigisCredentials } from "./ligis-client";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProbeCandidate {
  /** Human-readable name for display */
  name: string;
  /** Full URL of the A2MCP endpoint to probe */
  endpoint: string;
  /** Optional discovery URL (defaults to endpoint + "/tools" or the endpoint itself) */
  discoveryUrl?: string;
  /** HTTP method for the probe call (default POST) */
  method?: "GET" | "POST";
  /** Optional JSON body for the probe call */
  body?: Record<string, unknown>;
  /** Known price in USD (from marketplace listing); null if unknown */
  knownPriceUsd?: number | null;
  /** Agent ID on OKX.AI if known */
  agentId?: string;
  /** Agent's wallet/communication address for Ligis credential lookup */
  agentAddress?: string;
}

export interface ProbePayment {
  /** The endpoint returned 402 Payment Required */
  challengeReceived: boolean;
  /** A payment was signed and the retry succeeded */
  paid: boolean;
  /** On-chain settlement tx hash from the PAYMENT-RESPONSE header, when present */
  settlementTx?: string;
  /** USD amount paid (from the challenge or the known price) */
  amountUsd?: number;
  /** Why a challenge could not be paid */
  error?: string;
}

export interface ProbeResult {
  candidate: ProbeCandidate;
  metrics: ProbeMetrics;
  /** Raw response body (truncated) for debugging */
  rawSnippet?: string;
  /** HTTP status of the final response */
  statusCode: number;
  /** Error message if the probe failed */
  error?: string;
  /** x402 payment flow outcome (present only when the endpoint challenged with 402 or was paid) */
  payment?: ProbePayment;
  /** True when served from the 1-hour cache */
  fromCache?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 15_000;
const MAX_BODY_SNIPPET = 2_000;
export const MAX_OUTBOUND_SPEND_USD = 0.50;

// ── Simple in-memory cache (1-hour TTL) ───────────────────────────────────

const probeCache = new Map<string, { result: ProbeResult; expiresAt: number }>();
const CACHE_TTL_MS = 3_600_000; // 1 hour

function cacheKey(candidate: ProbeCandidate, allowPayments: boolean): string {
  const mode = allowPayments ? "paid" : "free";
  return `${mode}:${candidate.method ?? "POST"}:${candidate.endpoint}:${JSON.stringify(candidate.body ?? {})}`;
}

function getCached(key: string): ProbeResult | null {
  const entry = probeCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    probeCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key: string, result: ProbeResult): void {
  probeCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── SSRF guard ─────────────────────────────────────────────────────────────

/** Hostnames / IP ranges the runner must never probe (SSRF + cloud metadata). */
function assertPublicUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid endpoint URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http(s) endpoints can be probed");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host === "[::1]" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^0\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    host === "172.16.0.1"
  ) {
    throw new Error("Private/loopback endpoints cannot be probed");
  }
  // 172.16.0.0/12 private range
  const m = host.match(/^172\.(\d+)\./);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) {
      throw new Error("Private/loopback endpoints cannot be probed");
    }
  }
}

// ── x402 client (lazy-loaded to avoid import cost when not needed) ─────────

type X402ClientModules = {
  x402Client: typeof import("@okxweb3/x402-core/client").x402Client;
  x402HTTPClient: typeof import("@okxweb3/x402-core/client").x402HTTPClient;
  registerExactEvmScheme: typeof import("@okxweb3/x402-evm/exact/client").registerExactEvmScheme;
  toClientEvmSigner: typeof import("@okxweb3/x402-evm").toClientEvmSigner;
  privateKeyToAccount: typeof import("viem/accounts").privateKeyToAccount;
  createPublicClient: typeof import("viem").createPublicClient;
  http: typeof import("viem").http;
};

let x402ClientModules: X402ClientModules | null = null;

async function loadX402ClientModules(): Promise<X402ClientModules | null> {
  if (x402ClientModules !== null) return x402ClientModules;
  try {
    // Dynamic imports so the modules load only when a 402 actually needs paying
    const [coreClient, evmClient, evmSigner, accounts, viem] = await Promise.all([
      import("@okxweb3/x402-core/client"),
      import("@okxweb3/x402-evm/exact/client"),
      import("@okxweb3/x402-evm"),
      import("viem/accounts"),
      import("viem"),
    ]);
    x402ClientModules = {
      x402Client: coreClient.x402Client,
      x402HTTPClient: coreClient.x402HTTPClient,
      registerExactEvmScheme: evmClient.registerExactEvmScheme,
      toClientEvmSigner: evmSigner.toClientEvmSigner,
      privateKeyToAccount: accounts.privateKeyToAccount,
      createPublicClient: viem.createPublicClient,
      http: viem.http,
    };
    return x402ClientModules;
  } catch {
    return null;
  }
}

/**
 * Attempt to pay a 402 challenge using the OKX x402 client SDK.
 * Requires PROBE_PAYER_PK env var (private key holding USDT0 on X Layer).
 * Returns the payment headers to replay the request with (PAYMENT-SIGNATURE),
 * or null if payment isn't possible.
 */
async function attemptX402Payment(
  challengeHeader: string
): Promise<Record<string, string> | null> {
  const pk = process.env.PROBE_PAYER_PK;
  if (!pk) return null;

  try {
    const mods = await loadX402ClientModules();
    if (!mods) return null;

    const rpcUrl = process.env.PROBE_RPC_URL || "https://xlayerrpc.okx.com";
    const account = mods.privateKeyToAccount(pk as `0x${string}`);
    const publicClient = mods.createPublicClient({ transport: mods.http(rpcUrl) });
    const signer = mods.toClientEvmSigner(account, publicClient);

    const core = new mods.x402Client();
    mods.registerExactEvmScheme(core, {
      signer,
      schemeOptions: { rpcUrl },
    });
    const httpClient = new mods.x402HTTPClient(core);

    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => (name.toUpperCase() === "PAYMENT-REQUIRED" ? challengeHeader : null)
    );
    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    return httpClient.encodePaymentSignatureHeader(paymentPayload);
  } catch {
    return null;
  }
}

// ── Core probe logic ───────────────────────────────────────────────────────

/**
 * Probe a single A2MCP endpoint and return structured metrics.
 * Checks cache first; respects the cumulative spend cap.
 */
export async function probeEndpoint(
  candidate: ProbeCandidate,
  spendRemaining: { value: number },
  allowPayments = true
): Promise<ProbeResult> {
  // Check cache first
  const key = cacheKey(candidate, allowPayments);
  const cached = getCached(key);
  if (cached) return { ...cached, fromCache: true };

  // Reject non-public URLs before any network I/O (SSRF guard)
  try {
    assertPublicUrl(candidate.endpoint);
  } catch (e) {
    return {
      candidate,
      metrics: {
        reachable: false,
        statusCode: 0,
        latencyMs: 0,
        hasInputSchema: false,
        hasExamples: false,
        hasDescription: false,
        toolCount: 0,
        hasTimestamp: false,
        timestampAgeMinutes: null,
        priceUsd: candidate.knownPriceUsd ?? null,
        responseFieldCount: 0,
        isDemo: false,
        hasError: true,
      },
      statusCode: 0,
      error: e instanceof Error ? e.message : "Invalid endpoint",
    };
  }

  // Skip paid calls if spend cap would be exceeded
  const cost = candidate.knownPriceUsd ?? 0;
  if (cost > 0 && cost > spendRemaining.value) {
    return {
      candidate,
      metrics: {
        reachable: false,
        statusCode: 0,
        latencyMs: 0,
        hasInputSchema: false,
        hasExamples: false,
        hasDescription: false,
        toolCount: 0,
        hasTimestamp: false,
        timestampAgeMinutes: null,
        priceUsd: cost,
        responseFieldCount: 0,
        isDemo: false,
        hasError: false,
      },
      statusCode: 0,
      error: "Skipped: outbound spend cap reached",
    };
  }

  const url = candidate.endpoint;
  const method = candidate.method ?? "POST";
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    const fetchOpts: RequestInit = {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    if (method === "POST" && candidate.body) {
      fetchOpts.body = JSON.stringify(candidate.body);
    } else if (method === "POST") {
      // Send minimal body for POST endpoints that expect one
      fetchOpts.body = JSON.stringify({});
    }

    let response = await fetch(url, fetchOpts);
    clearTimeout(timeout);

    // Handle 402: attempt x402 payment and retry
    const payment: ProbePayment = { challengeReceived: false, paid: false };
    if (response.status === 402) {
      payment.challengeReceived = true;
      const paymentRequired = response.headers.get("PAYMENT-REQUIRED") ||
        response.headers.get("payment-required");

      if (!allowPayments) {
        payment.error = "Payments disabled for this run";
      } else if (paymentRequired) {
        const paymentHeaders = await attemptX402Payment(paymentRequired);
        if (paymentHeaders) {
          // Retry with payment (PAYMENT-SIGNATURE header from the SDK)
          const retryOpts: RequestInit = {
            ...fetchOpts,
            headers: {
              ...(fetchOpts.headers as Record<string, string>),
              ...paymentHeaders,
            },
          };
          const retryController = new AbortController();
          const retryTimeout = setTimeout(
            () => retryController.abort(),
            PROBE_TIMEOUT_MS
          );
          retryOpts.signal = retryController.signal;
          response = await fetch(url, retryOpts);
          clearTimeout(retryTimeout);

          if (response.status < 400) {
            payment.paid = true;
            payment.amountUsd = candidate.knownPriceUsd ?? undefined;
            const settleHeader =
              response.headers.get("PAYMENT-RESPONSE") ||
              response.headers.get("payment-response");
            if (settleHeader) {
              try {
                const settle = JSON.parse(
                  Buffer.from(settleHeader, "base64").toString("utf-8")
                );
                if (typeof settle?.transaction === "string") {
                  payment.settlementTx = settle.transaction;
                }
              } catch {
                // settlement header not parseable — non-fatal
              }
            }
          } else {
            payment.error = `Payment sent but endpoint returned ${response.status}`;
          }
        } else {
          payment.error = "Unable to sign x402 payment (missing PROBE_PAYER_PK or SDK error)";
        }
      } else {
        payment.error = "402 without PAYMENT-REQUIRED header";
      }
    }

    const latencyMs = Date.now() - start;
    const statusCode = response.status;

    // Read body
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      // Stream read failed
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // Not JSON
    }

    // Extract metrics from the response
    const metrics = extractMetrics({
      reachable: true,
      statusCode,
      latencyMs,
      parsed,
      bodyText,
      knownPriceUsd: candidate.knownPriceUsd ?? null,
    });

    // Optional Ligis credential enrichment
    if (candidate.agentAddress) {
      try {
        const ligisResult = await checkLigisCredentials(candidate.agentAddress);
        metrics.credentialVerified = ligisResult.verified;
      } catch {
        metrics.credentialVerified = null;
      }
    }

    // Deduct from spend budget only when we actually paid
    if (payment.paid) {
      spendRemaining.value -= cost;
    }

    const result: ProbeResult = {
      candidate,
      metrics,
      rawSnippet: bodyText.slice(0, MAX_BODY_SNIPPET),
      statusCode,
      ...(payment.challengeReceived || payment.paid ? { payment } : {}),
    };
    setCache(key, result);
    return result;
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const errorMsg =
      err instanceof Error ? err.message : "Unknown probe error";
    const isTimeout = errorMsg.includes("abort") || errorMsg.includes("timeout");

    return {
      candidate,
      metrics: {
        reachable: false,
        statusCode: 0,
        latencyMs,
        hasInputSchema: false,
        hasExamples: false,
        hasDescription: false,
        toolCount: 0,
        hasTimestamp: false,
        timestampAgeMinutes: null,
        priceUsd: candidate.knownPriceUsd ?? null,
        responseFieldCount: 0,
        isDemo: false,
        hasError: true,
      },
      statusCode: 0,
      error: isTimeout ? `Timeout after ${PROBE_TIMEOUT_MS}ms` : errorMsg,
    };
  }
}

/**
 * Probe multiple candidates in parallel with a concurrency limit.
 * Enforces a cumulative outbound spend cap across all candidates.
 */
export async function probeAll(
  candidates: ProbeCandidate[],
  opts: { concurrency?: number; allowPayments?: boolean } = {}
): Promise<ProbeResult[]> {
  const { concurrency = 4, allowPayments = true } = opts;
  const results: ProbeResult[] = [];
  const queue = [...candidates];
  const spendRemaining = { value: MAX_OUTBOUND_SPEND_USD };

  async function worker() {
    while (queue.length > 0) {
      const candidate = queue.shift();
      if (!candidate) break;
      results.push(await probeEndpoint(candidate, spendRemaining, allowPayments));
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, candidates.length) },
    () => worker()
  );
  await Promise.all(workers);

  // Preserve original order
  const orderMap = new Map(candidates.map((c, i) => [c.endpoint, i]));
  results.sort((a, b) => (orderMap.get(a.candidate.endpoint) ?? 0) - (orderMap.get(b.candidate.endpoint) ?? 0));

  return results;
}

// ── Metric extraction helpers ──────────────────────────────────────────────

interface ExtractInput {
  reachable: boolean;
  statusCode: number;
  latencyMs: number;
  parsed: unknown;
  bodyText: string;
  knownPriceUsd: number | null;
}

function extractMetrics(input: ExtractInput): ProbeMetrics {
  const { reachable, statusCode, latencyMs, parsed, knownPriceUsd } = input;

  if (!reachable) {
    return {
      reachable: false,
      statusCode,
      latencyMs,
      hasInputSchema: false,
      hasExamples: false,
      hasDescription: false,
      toolCount: 0,
      hasTimestamp: false,
      timestampAgeMinutes: null,
      priceUsd: knownPriceUsd,
      responseFieldCount: 0,
      isDemo: false,
      hasError: true,
    };
  }

  const obj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;

  // Detect A2MCP /tools response shape
  const hasInputSchema = detectInputSchema(obj);
  const hasDescription = detectDescription(obj);
  const hasExamples = detectExamples(obj);
  const toolCount = countTools(obj);

  // Freshness: look for generatedAt, timestamp, createdAt fields
  const { hasTimestamp, timestampAgeMinutes } = detectFreshness(obj);

  // Response richness: count top-level keys (or nested object keys)
  const responseFieldCount = countFields(obj);

  // Demo detection
  const isDemo = obj.demo === true || obj.isDemo === true;

  // Error detection
  const hasError =
    statusCode >= 400 ||
    obj.error !== undefined ||
    obj.ok === false;

  return {
    reachable,
    statusCode,
    latencyMs,
    hasInputSchema,
    hasExamples,
    hasDescription,
    toolCount,
    hasTimestamp,
    timestampAgeMinutes,
    priceUsd: knownPriceUsd,
    responseFieldCount,
    isDemo,
    hasError,
  };
}

function detectInputSchema(obj: Record<string, unknown>): boolean {
  // Check for JSON Schema presence in various shapes
  if (obj.inputSchema && typeof obj.inputSchema === "object") return true;
  if (obj.schema && typeof obj.schema === "object") return true;
  // Check nested tools array
  const tools = obj.tools ?? obj.services ?? obj.endpoints;
  if (Array.isArray(tools) && tools.length > 0) {
    return tools.some(
      (t: any) =>
        t?.inputSchema || t?.schema || t?.parameters || t?.input_schema
    );
  }
  // Check if the object itself has properties/type (JSON Schema shape)
  if (obj.properties && obj.type === "object") return true;
  return false;
}

function detectDescription(obj: Record<string, unknown>): boolean {
  if (typeof obj.description === "string" && obj.description.length > 10) return true;
  if (typeof obj.summary === "string" && obj.summary.length > 10) return true;
  const tools = obj.tools ?? obj.services ?? obj.endpoints;
  if (Array.isArray(tools) && tools.length > 0) {
    return tools.some(
      (t: any) => typeof t?.description === "string" && t.description.length > 10
    );
  }
  return false;
}

function detectExamples(obj: Record<string, unknown>): boolean {
  if (obj.examples && (Array.isArray(obj.examples) || typeof obj.examples === "object")) return true;
  if (obj.example) return true;
  const tools = obj.tools ?? obj.services ?? obj.endpoints;
  if (Array.isArray(tools) && tools.length > 0) {
    return tools.some(
      (t: any) => t?.examples || t?.example || t?.inputSchema?.examples
    );
  }
  return false;
}

function countTools(obj: Record<string, unknown>): number {
  const tools = obj.tools ?? obj.services ?? obj.endpoints;
  if (Array.isArray(tools)) return tools.length;
  // If it's a single-tool response, count as 1
  if (obj.tool || obj.name || obj.service) return 1;
  return 0;
}

function detectFreshness(obj: Record<string, unknown>): {
  hasTimestamp: boolean;
  timestampAgeMinutes: number | null;
} {
  const tsFields = ["generatedAt", "timestamp", "createdAt", "updatedAt", "lastUpdated", "checkedAt"];
  for (const field of tsFields) {
    const val = obj[field];
    if (typeof val === "string" || typeof val === "number") {
      const date = typeof val === "number" ? new Date(val) : new Date(val);
      if (!isNaN(date.getTime())) {
        const ageMinutes = (Date.now() - date.getTime()) / 60_000;
        return { hasTimestamp: true, timestampAgeMinutes: Math.max(0, ageMinutes) };
      }
    }
  }
  return { hasTimestamp: false, timestampAgeMinutes: null };
}

function countFields(obj: Record<string, unknown>): number {
  const keys = Object.keys(obj);
  // If there's a data/result payload, count its fields too
  const nested = obj.data ?? obj.result ?? obj.response ?? obj.payload;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return keys.length + Object.keys(nested as object).length;
  }
  if (Array.isArray(nested)) {
    return keys.length + nested.length;
  }
  return keys.length;
}

// ── Default candidates (real OKX.AI A2MCP services) ───────────────────────

export const DEFAULT_CANDIDATES: ProbeCandidate[] = [
  {
    name: "Doxa — Structured Data Validate",
    endpoint: "https://doxa.ivaronix.xyz/a2mcp/schema.validate",
    method: "POST",
    body: { url: "https://example.com" },
    knownPriceUsd: 0.005,
    agentId: "9626",
    agentAddress: "0xcd4db585b9FdCbb44aA06ce57Aa72Bc1a92B8111",
  },
  {
    name: "Onchain Data Explorer — Token Metadata",
    endpoint: "https://www.oklink.com/api/v5/explorer/mcp/x402/get_token_info",
    method: "POST",
    body: { chainIndex: "1", tokenAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
    knownPriceUsd: 0.01,
    agentId: "2023",
    agentAddress: "0x0F1375cF76E56dFD559830183C8ed4EeAE7e7682",
  },
  {
    name: "Atlas Data API — Market Signal",
    endpoint: "https://0m.ar/api/market-insight",
    method: "POST",
    body: { token: "BTC", timeframe: "7d" },
    knownPriceUsd: 0.00001,
    agentId: "11194",
    agentAddress: "0x54F81bEb97546616A0a019ec2543527e7Da30c83",
  },
  {
    name: "PolyDesk — Football Match Live Data",
    endpoint: "https://polydesk-i96m.onrender.com/api/a2mcp/worldcup-live-scores",
    method: "GET",
    knownPriceUsd: 0.1,
    agentId: "5427",
    agentAddress: "0xc81B2dD32CC29B24B7D5aA58e102FDA72dA9c464",
  },
  {
    name: "DataBard — Health Check (self)",
    endpoint: "https://databard.persidian.com/api/mcp/health-check",
    method: "POST",
    body: {},
    knownPriceUsd: 0,
    agentId: "9878",
  },
];
