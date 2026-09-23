import {
  scoreListing,
  checkListing,
  probeValidCall,
  findServices,
  pickVerifyTargets,
  paidBuckets,
  dailyVerifyBudget,
  OUR_AGENT_ID,
  type ListingCheck,
  type MarketplaceService,
  type MarketplaceIndex,
  type IndexedService,
  type ValidCallProbe,
} from "../src/lib/marketplace-index";

function svc(overrides: Partial<MarketplaceService> = {}): MarketplaceService {
  return {
    serviceId: "s1",
    agentId: "1001",
    agentName: "Test Agent",
    serviceName: "Test Service",
    endpoint: "https://api.example.com/mcp",
    feeUsd: 0,
    online: true,
    category: "Software services",
    description: "A test service",
    ...overrides,
  };
}

function check(overrides: Partial<ListingCheck> = {}): ListingCheck {
  return {
    service: svc(),
    checkedUrl: "https://api.example.com/mcp",
    checkedMethod: "POST",
    templateSubstituted: false,
    status: 200,
    latencyMs: 500,
    contentType: "application/json",
    bodySnippet: "{}",
    bodyJson: {},
    challengeHeader: null,
    challenge: null,
    ...overrides,
  };
}

function probe(overrides: Partial<ValidCallProbe> = {}): ValidCallProbe {
  return {
    inputSource: "rejection",
    attempts: [{ method: "POST", url: "https://api.example.com/mcp", status: 200, snippet: "{}" }],
    status: 200,
    bodyJson: {},
    challenge: null,
    challengeHeader: null,
    request: { method: "POST", url: "https://api.example.com/mcp", body: { symbol: "BTC" } },
    ...overrides,
  };
}

function challenge(overrides: Record<string, unknown> = {}) {
  return {
    network: "eip155:196",
    amountAtomic: 10_000,
    amountUsd: 0.01,
    asset: "0x779d",
    payTo: "0xabc",
    resourceUrl: "https://api.example.com/mcp",
    resourceDescription: "A paid service",
    ...overrides,
  };
}

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

// Free listing, healthy: 200 + JSON + fast → availability + free-integrity known
{
  const v = scoreListing(check(), svc({ feeUsd: 0 }));
  assert(v.score === 100, `free healthy scores 100 (got ${v.score})`);
  assert(v.status === "healthy", "free healthy status");
  assert(v.subScores.paymentIntegrity === 100, "free paymentIntegrity 100");
  assert(v.subScores.delivery === null, "no valid call → delivery unknown");
  assert(v.verification === "none", `no valid call → verification none (got ${v.verification})`);
  assert(v.flags.length === 0, `free healthy has no flags (got ${v.flags.join("|")})`);
}

// Paid listing with a correct challenge → gate verified, healthy
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(check({ status: 402, challenge: challenge(), bodyJson: null }), s);
  assert(v.score === 100, `paid correct challenge scores 100 (got ${v.score})`);
  assert(v.status === "healthy", "paid correct challenge healthy");
  assert(v.verification === "gate", `gate verification (got ${v.verification})`);
  assert(v.subScores.paymentIntegrity === 100, "paymentIntegrity 100");
}

// Charges more than listed → paymentIntegrity dropped + flag
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(check({ status: 402, challenge: challenge({ amountUsd: 0.05 }) }), s);
  assert(v.subScores.paymentIntegrity === 40, `overcharge → 40 (got ${v.subScores.paymentIntegrity})`);
  assert(v.flags.some((f) => f.includes("Charges $0.05, listing says $0.01")), "overcharge flag");
}

// Charges less → smaller penalty
{
  const s = svc({ feeUsd: 0.10 });
  const v = scoreListing(check({ status: 402, challenge: challenge({ amountUsd: 0.02 }) }), s);
  assert(v.subScores.paymentIntegrity === 80, `undercharge → 80 (got ${v.subScores.paymentIntegrity})`);
  assert(v.flags.some((f) => f.startsWith("Charges $0.02")), "undercharge flag");
}

// Free listing demanding payment → integrity 0 → broken
{
  const s = svc({ feeUsd: 0 });
  const v = scoreListing(check({ status: 402, challenge: challenge() }), s);
  assert(v.subScores.paymentIntegrity === 0, "free+402 integrity 0");
  assert(v.status === "broken", "free+402 → broken");
  assert(v.flags.includes("Listed free but demands payment"), "free-demands-payment flag");
}

// Paid listing on a non-196 network → 60
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(check({ status: 402, challenge: challenge({ network: "eip155:1" }) }), s);
  assert(v.subScores.paymentIntegrity === 60, `non-196 → 60 (got ${v.subScores.paymentIntegrity})`);
  assert(v.flags.some((f) => f.includes("eip155:1")), "non-196 flag");
}

// Undecodable challenge → integrity unknown → unverified
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(check({ status: 402, challenge: { undecodable: true } }), s);
  assert(v.subScores.paymentIntegrity === null, "undecodable → integrity null");
  assert(v.flags.some((f) => f.includes("could not be decoded")), "undecodable flag");
  assert(v.status === "unverified", `undecodable → unverified (got ${v.status})`);
}

// Paid listing, 400 error body, no input contract → unverified, no accusation
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 400, bodyJson: { ok: false, code: "ANSWERS_REQUIRED_BEFORE_PAYMENT", error: "answers required" } }),
    s,
  );
  assert(v.subScores.paymentIntegrity === null, "gate-not-reached integrity null");
  assert(v.subScores.delivery === null, "no valid call → delivery null");
  assert(v.status === "unverified", `gate-not-reached → unverified (got ${v.status})`);
  assert(!v.flags.some((f) => f.includes("without requesting")), "no accusation flag");
}

// Valid request STILL rejected → honest "gate not reached" flag
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 400, bodyJson: { error: "symbol is required" } }),
    s,
    probe({ status: 422, bodyJson: { error: "symbol must be uppercase" } }),
  );
  assert(v.status === "unverified", `rejected valid call → unverified (got ${v.status})`);
  assert(
    v.flags.some((f) => f.includes("valid request still rejected (HTTP 422)")),
    `rejected-valid-request flag (got ${v.flags.join("|")})`,
  );
}

// Paid listing, substantive JSON 200, no 402 → provider note, not buyer harm
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(check({ status: 200, bodyJson: { data: [1, 2, 3] } }), s);
  assert(v.subScores.paymentIntegrity === 50, `free content without payment → integrity 50 (got ${v.subScores.paymentIntegrity})`);
  assert(v.status !== "broken", `substantive unpaid payload → not broken (got ${v.status})`);
  assert(
    v.flags.includes("Payment not enforced: returned a full response without payment"),
    `payment-not-enforced flag (got ${v.flags.join("|")})`,
  );
}

// 404 → availability 0 → broken
{
  const v = scoreListing(check({ status: 404 }), svc());
  assert(v.subScores.availability === 0, "404 availability 0");
  assert(v.flags.includes("Endpoint not found (404)"), "404 flag");
  assert(v.status === "broken", `404 → broken (got ${v.status})`);
}

// 5xx → broken + server error flag
{
  const v = scoreListing(check({ status: 503 }), svc());
  assert(v.flags.includes("Server error 503"), "5xx flag");
  assert(v.status === "broken", `5xx → broken (got ${v.status})`);
}

// Network error → unreachable, score 0
{
  const v = scoreListing(check({ status: 0, error: "Timeout after 10000ms" }), svc());
  assert(v.score === 0, "unreachable scores 0");
  assert(v.status === "unreachable", "unreachable status");
  assert(v.verification === "none", "unreachable verification none");
}

// Internal URL in challenge → flag + integrity penalty
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 402, challenge: challenge({ resourceUrl: "https://0.0.0.0:42100/api/x" }) }),
    s,
  );
  assert(v.flags.includes("Payment challenge advertises an internal URL"), "internal URL flag");
  assert(v.subScores.paymentIntegrity === 50, `internal URL → 50 (got ${v.subScores.paymentIntegrity})`);
}

// Template substitution flag
{
  const v = scoreListing(check({ templateSubstituted: true }), svc());
  assert(v.flags.includes("Templated endpoint (checked with BTC)"), "template flag");
}

// ── Delivery & verification levels ────────────────────────────────────────

// Free listing, valid call delivers substantive payload → delivered
{
  const s = svc({ feeUsd: 0 });
  const v = scoreListing(
    check({ status: 400, bodyJson: { error: "symbol is required" } }),
    s,
    probe({ status: 200, bodyJson: { price: 67000, symbol: "BTC", change24h: 1.2 } }),
  );
  assert(v.verification === "delivered", `free delivered (got ${v.verification})`);
  assert(v.subScores.delivery === 100, `delivery 100 (got ${v.subScores.delivery})`);
  assert(v.status === "healthy", `free delivered → healthy (got ${v.status})`);
}

// Paid listing, valid call unpaid reaches the gate → gate (integrity priced)
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 400, bodyJson: { error: "symbol is required" } }),
    s,
    probe({ status: 402, bodyJson: null, challenge: challenge() }),
  );
  assert(v.verification === "gate", `paid gate (got ${v.verification})`);
  assert(v.subScores.paymentIntegrity === 100, "gate reached via valid call → integrity 100");
  assert(v.status === "healthy", `gate → healthy (got ${v.status})`);
}

// Paid + signed payment, then non-substantive → failed verification, broken
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 402, challenge: challenge() }),
    s,
    probe({ status: 402, challenge: challenge() }),
    { record: { at: "2026-09-23T00:00:00Z", delivered: false, status: 500, amountUsd: 0.01 }, bodyJson: null, substantive: false },
  );
  assert(v.verification === "failed", `paid failed (got ${v.verification})`);
  assert(v.subScores.delivery === 0, "paid failed → delivery 0");
  assert(v.status === "broken", `paid failed → broken (got ${v.status})`);
  assert(v.flags.some((f) => f.includes("Payment signed but request returned HTTP 500")), "paid-failed flag");
}

// Paid + delivered after payment → delivered
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 402, challenge: challenge() }),
    s,
    probe({ status: 402, challenge: challenge() }),
    {
      record: { at: "2026-09-23T00:00:00Z", delivered: true, status: 200, amountUsd: 0.01, settlementTx: "0xabc" },
      bodyJson: { price: 1, symbol: "BTC", ok: true },
      substantive: true,
    },
  );
  assert(v.verification === "delivered", `paid delivered (got ${v.verification})`);
  assert(v.subScores.delivery === 100, "paid delivery 100");
  assert(v.status === "healthy", "paid delivered → healthy");
}

// Thin payload on a valid call → delivery 60
{
  const s = svc({ feeUsd: 0 });
  const v = scoreListing(
    check({ status: 400, bodyJson: { error: "q required" } }),
    s,
    probe({ status: 200, bodyJson: { ok: true } }),
  );
  assert(v.subScores.delivery === 60, `thin payload → 60 (got ${v.subScores.delivery})`);
}

// Stale delivered payload → delivery 50 + flag
{
  const s = svc({ feeUsd: 0 });
  const old = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const v = scoreListing(
    check({ status: 400, bodyJson: { error: "q required" } }),
    s,
    probe({ status: 200, bodyJson: { price: 1, symbol: "BTC", volume: 5, date: old } }),
  );
  assert(v.subScores.delivery === 50, `stale → 50 (got ${v.subScores.delivery})`);
  assert(v.flags.some((f) => f.startsWith("Stale data (dated")), `stale flag (got ${v.flags.join("|")})`);
}

// Free listing that rejects even a valid request → delivery stays unknown → unverified
{
  const s = svc({ feeUsd: 0 });
  const v = scoreListing(
    check({ status: 400, bodyJson: { error: "q required" } }),
    s,
    probe({ status: 400, bodyJson: { error: "still bad" } }),
  );
  assert(v.subScores.delivery === null, "free rejected valid call → delivery unknown");
  assert(v.status === "unverified", `free rejected → unverified (got ${v.status})`);
  assert(v.flags.some((f) => f.startsWith("Couldn't build an accepted request automatically")), "free rejection neutral flag");
}

// Side-effecting service → skipped flag, stays unverified
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 400, bodyJson: { error: "token required" } }),
    s,
    probe({ sideEffectSkipped: true, attempts: [], status: undefined, request: undefined }),
  );
  assert(v.flags.includes("Skipped active call: service may have side effects"), "side-effect flag");
  assert(v.status === "unverified", `skipped → unverified (got ${v.status})`);
}

// Weighted mean excludes nulls: availability only → score = availability
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(check({ status: 418, latencyMs: 500 }), s);
  assert(v.subScores.availability === 100, "418 availability 100");
  assert(v.score === 100, `nulls excluded → score 100 (got ${v.score})`);
  assert(v.status === "unverified", "still unverified");
}

// MCP neutral flag
{
  const s = svc({ feeUsd: 0.5 });
  const v = scoreListing(check({ status: 200, protocol: "mcp", bodyJson: { jsonrpc: "2.0", result: { tools: [] } } }), s);
  assert(v.flags.includes("MCP server — payment is enforced per tool call; listing-level gate not checked"), "mcp neutral flag");
  assert(v.status === "unverified", `mcp gate-not-checked → unverified (got ${v.status})`);
}

// ── pickVerifyTargets / ledger rules ──────────────────────────────────────

const cand = (id: string, feeUsd: number, over: Record<string, unknown> = {}) => ({
  serviceId: id,
  ours: false,
  feeUsd,
  callable: true,
  gateReached: true,
  sideEffectSkipped: false,
  inputConfidence: "exact" as const,
  ...over,
});
const now = Date.now();
const hours = (h: number) => new Date(now - h * 3600 * 1000).toISOString();

{
  const targets = pickVerifyTargets(
    [
      cand("free", 0),
      cand("ours", 0.01, { ours: true }),
      cand("pricey", 0.10),
      cand("nogate", 0.01, { gateReached: false }),
      cand("sidefx", 0.01, { sideEffectSkipped: true }),
      cand("recent", 0.01),
      cand("old", 0.02),
      cand("never", 0.03),
    ],
    { recent: { at: hours(2), delivered: true }, old: { at: hours(80), delivered: false } },
    now,
  );
  const ids = targets.map((t) => t.serviceId);
  assert(ids.length === 2, `eligibility keeps 2 (got ${ids.join(",")})`);
  assert(ids[0] === "never", `never-verified first (got ${ids[0]})`);
  assert(ids[1] === "old", `>72h eligible (got ${ids[1]})`);
  assert(!ids.includes("recent"), "<72h excluded");
}

{
  // oldest verification wins among previously-verified; cheapest breaks ties
  const targets = pickVerifyTargets(
    [cand("b", 0.01), cand("a", 0.05), cand("c", 0.02)],
    { a: { at: hours(100), delivered: true }, b: { at: hours(200), delivered: false }, c: { at: hours(200), delivered: true } },
    now,
  );
  assert(targets.map((t) => t.serviceId).join(",") === "c,b,a" || targets.map((t) => t.serviceId).join(",") === "b,c,a",
    `oldest then cheapest (got ${targets.map((t) => t.serviceId).join(",")})`);
}

{
  const env = process.env.INDEX_DAILY_VERIFY_BUDGET_USD;
  delete process.env.INDEX_DAILY_VERIFY_BUDGET_USD;
  assert(dailyVerifyBudget() === 1.0, "default budget $1");
  process.env.INDEX_DAILY_VERIFY_BUDGET_USD = "10";
  assert(dailyVerifyBudget() === 3, `hard cap $3 (got ${dailyVerifyBudget()})`);
  process.env.INDEX_DAILY_VERIFY_BUDGET_USD = "0.5";
  assert(dailyVerifyBudget() === 0.5, "env budget honoured");
  if (env === undefined) delete process.env.INDEX_DAILY_VERIFY_BUDGET_USD;
  else process.env.INDEX_DAILY_VERIFY_BUDGET_USD = env;
}

// ── checkListing method fallback (mocked fetch) ──────────────────────────

async function withFetch(
  handler: (method: string, body?: string) => { status: number; body?: string; headers?: Record<string, string | undefined> },
  fn: () => Promise<void>,
) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { method?: string; body?: string }) => {
    const r = handler((init?.method ?? "GET").toUpperCase(), init?.body);
    const headers: Record<string, string> = { "content-type": "application/json" };
    for (const [k, v] of Object.entries(r.headers ?? {})) if (v !== undefined) headers[k] = v;
    return new Response(r.body ?? "", { status: r.status, headers });
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

// ── findServices ─────────────────────────────────────────────────────────

function indexed(overrides: Partial<IndexedService> = {}): IndexedService {
  const base = svc();
  return {
    ...base,
    ours: false,
    score: 90,
    status: "healthy",
    checks: {},
    flags: [],
    latencyMs: 100,
    httpStatus: 200,
    verification: "gate",
    paid: false,
    subScores: { availability: 100, paymentIntegrity: 100, delivery: null },
    ...overrides,
  };
}

const fakeIndex = {
  kind: "okx-marketplace-index",
  generatedAt: "2026-01-01T00:00:00Z",
  crawledAt: "2026-01-01T00:00:00Z",
  aggregates: {} as MarketplaceIndex["aggregates"],
  services: [
    indexed({ serviceId: "a1", agentId: "2023", agentName: "Onchain Data Explorer", serviceName: "Token Metadata", description: "Token metadata API" }),
    indexed({ serviceId: "a2", agentId: "55", serviceName: "Token Security Scan", agentName: "Scanner", description: "Scans tokens for honeypots", score: 70, status: "degraded" }),
    indexed({ serviceId: "a3", agentId: OUR_AGENT_ID, agentName: "DataBard", serviceName: "Health Check", ours: true, score: 99 }),
  ],
} as MarketplaceIndex;

{
  const byAgent = findServices(fakeIndex, { agentId: "2023" });
  assert(byAgent.length === 1 && byAgent[0].serviceId === "a1", "findServices by agentId");

  const byService = findServices(fakeIndex, { serviceId: "a2" });
  assert(byService.length === 1 && byService[0].agentId === "55", "findServices by serviceId");

  const byEndpoint = findServices(fakeIndex, { endpoint: "https://api.example.com/mcp" });
  assert(byEndpoint.length === 3, `endpoint match hits all three (got ${byEndpoint.length})`);

  const byQuery = findServices(fakeIndex, { query: "token security" });
  assert(byQuery.length >= 2, `query match (got ${byQuery.length})`);
  assert(byQuery[0].serviceId === "a2" || byQuery[0].serviceId === "a1", "query ranks token services first");

  const none = findServices(fakeIndex, { agentId: "99999" });
  assert(none.length === 0, "no match → empty");
}

void (async () => {
// POST 404 → retried GET, GET result kept
await withFetch(
  (m) => (m === "POST" ? { status: 404 } : { status: 200, body: '{"ok":true,"data":[]}' }),
  async () => {
    const c = await checkListing(svc({ endpoint: "https://api.example.com/data" }));
    assert(c.checkedMethod === "GET", `404 falls back to GET (got ${c.checkedMethod})`);
    assert(c.status === 200, `GET fallback kept 200 (got ${c.status})`);
  },
);

// POST 200 "Unknown endpoint for POST" → GET fallback
await withFetch(
  (m) =>
    m === "POST"
      ? { status: 200, body: '{"error":"Unknown endpoint for POST"}' }
      : { status: 402, body: "{}", headers: { "payment-required": Buffer.from('{"x402Version":2,"accepts":[{"network":"eip155:196","amount":"10000"}]}').toString("base64") } },
  async () => {
    const c = await checkListing(svc({ feeUsd: 0.01, endpoint: "https://api.example.com/data" }));
    assert(c.checkedMethod === "GET", `wrong-method body falls back to GET (got ${c.checkedMethod})`);
    assert(c.status === 402, `GET 402 challenge captured (got ${c.status})`);
    assert(c.challenge?.network === "eip155:196", "challenge decoded after GET fallback");
  },
);

// POST 404 + GET also 404 → stays 404, checkedMethod GET
await withFetch(
  () => ({ status: 404 }),
  async () => {
    const c = await checkListing(svc({ endpoint: "https://api.example.com/data" }));
    assert(c.status === 404 && c.checkedMethod === "GET", "double-404 recorded");
    const v = scoreListing(c, c.service);
    assert(v.status === "broken", `double-404 → broken (got ${v.status})`);
  },
);

// MCP server on /mcp path — plain {} POST gets JSON-RPC error, handshake lists tools
await withFetch(
  (_m, body) => {
    if (body?.includes('"initialize"')) {
      return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "coin-signal" }, capabilities: {} } }), headers: { "mcp-session-id": "sess1" } };
    }
    if (body?.includes('"tools/list"')) {
      return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "price" }, { name: "signals" }] } }) };
    }
    if (body?.includes('"notifications/initialized"')) return { status: 202, body: "" };
    return { status: 400, body: '{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Invalid Request"}}' };
  },
  async () => {
    const c = await checkListing(svc({ endpoint: "https://api.example.com/mcp", feeUsd: 0.5 }));
    assert(c.protocol === "mcp", `mcp detected (got ${c.protocol})`);
    assert(c.mcpServerName === "coin-signal", `server name (got ${c.mcpServerName})`);
    assert(c.toolCount === 2, `toolCount 2 (got ${c.toolCount})`);
    const v = scoreListing(c, c.service);
    assert(v.flags.includes("MCP server — payment is enforced per tool call; listing-level gate not checked"), "mcp neutral flag");
    assert(!v.flags.some((f) => f.includes("without requesting")), "no accusation on mcp");
  },
);

// MCP over SSE — data: lines instead of a JSON body
await withFetch(
  (_m, body) => {
    if (body?.includes('"initialize"')) {
      return { status: 200, body: 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"sse-mcp"},"capabilities":{}}}\n\n', headers: { "content-type": "text/event-stream" } };
    }
    if (body?.includes('"tools/list"')) {
      return { status: 200, body: 'data: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"t1"}]}}\n\n', headers: { "content-type": "text/event-stream" } };
    }
    return { status: 202, body: "" };
  },
  async () => {
    const c = await checkListing(svc({ endpoint: "https://api.example.com/mcp", feeUsd: 0 }));
    assert(c.protocol === "mcp" && c.mcpServerName === "sse-mcp" && c.toolCount === 1, `sse mcp (got ${c.protocol}/${c.mcpServerName}/${c.toolCount})`);
    const v = scoreListing(c, c.service);
    assert(v.status === "healthy", `sse mcp free → healthy (got ${v.status} ${v.score})`);
  },
);

// MCP server that 402s on tools/list → real challenge captured, gate scores normally
await withFetch(
  (_m, body) => {
    if (body?.includes('"initialize"')) {
      return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "paid-mcp" } } }), headers: { "mcp-session-id": "s9" } };
    }
    if (body?.includes('"tools/list"')) {
      const ch = Buffer.from(JSON.stringify({ x402Version: 2, accepts: [{ network: "eip155:196", amount: "500000" }] })).toString("base64");
      return { status: 402, body: "{}", headers: { "payment-required": ch } };
    }
    return { status: 202, body: "" };
  },
  async () => {
    const c = await checkListing(svc({ endpoint: "https://api.example.com/mcp", feeUsd: 0.5 }));
    assert(c.protocol === "mcp" && c.status === 402, `mcp 402 on tools/list (got ${c.status})`);
    assert(c.challenge?.amountUsd === 0.5, "mcp challenge amount");
    const v = scoreListing(c, c.service);
    assert(v.subScores.paymentIntegrity === 100, "mcp 402 integrity 100");
    assert(v.status === "healthy", `mcp+402 → healthy (got ${v.status})`);
  },
);

// 202 empty on a non-/mcp path — handshake attempted, fails, plain check kept
await withFetch(
  (_m, body) => (body?.includes('"initialize"') ? { status: 404 } : { status: 202, body: "" }),
  async () => {
    const c = await checkListing(svc({ endpoint: "https://api.example.com/async", feeUsd: 1 }));
    assert(c.protocol !== "mcp", "failed handshake falls back");
    const v = scoreListing(c, c.service);
    assert(v.status === "unverified", `202-empty → unverified (got ${v.status})`);
    assert(!v.flags.some((f) => f.includes("without requesting")), "no accusation on empty 202");
  },
);

// HTML docs page on a paid listing → unverified, not an accusation
await withFetch(
  () => ({ status: 200, body: "<html><body>API docs</body></html>", headers: { "content-type": "text/html" } }),
  async () => {
    const c = await checkListing(svc({ feeUsd: 2, endpoint: "https://api.example.com/docs" }));
    assert(c.protocol !== "mcp", "html not mcp");
    const v = scoreListing(c, c.service);
    assert(v.subScores.paymentIntegrity === null, "html → integrity unknown");
    assert(v.status === "unverified", `html docs → unverified (got ${v.status})`);
  },
);

// Substantive JSON 200 on paid listing → provider note survives (integrity 50)
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(check({ status: 200, bodyJson: { data: [{ x: 1 }], status: "ok" } }), s);
  assert(v.subScores.paymentIntegrity === 50, "substantive data payload → integrity 50");
  assert(v.flags.some((f) => f.includes("Payment not enforced")), "substantive provider note stays");
}
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(check({ status: 200, bodyJson: { prices: { BTC: 1 }, chains: ["x"], updated: "today" } }), s);
  assert(v.flags.some((f) => f.includes("Payment not enforced")), "3 substantive keys provider note stays");
}
{
  // thin envelope ({ok:true} only) is NOT substantive → stays unverified
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(check({ status: 200, bodyJson: { ok: true } }), s);
  assert(v.subScores.paymentIntegrity === null, "thin body → integrity unknown");
  assert(v.status === "unverified", `thin body → unverified (got ${v.status})`);
}

// ── probeValidCall: synthesized requests, repair, denylist ────────────────

// Rejection body gives field names → synthesized POST reaches the 402 gate
await withFetch(
  (_m, body) => {
    if (body?.includes('"symbol"')) {
      const ch = Buffer.from(JSON.stringify({ x402Version: 2, accepts: [{ network: "eip155:196", amount: "10000" }] })).toString("base64");
      return { status: 402, body: "{}", headers: { "payment-required": ch } };
    }
    return { status: 400, body: '{"error":"symbol is required"}' };
  },
  async () => {
    const c = await checkListing(svc({ feeUsd: 0.01, endpoint: "https://api.example.com/price" }));
    const p = await probeValidCall(c.service, c);
    assert(p !== null, "probe ran");
    assert(p!.inputSource === "rejection", `input from rejection body (got ${p!.inputSource})`);
    assert(p!.status === 402, `synthesized call reached the gate (got ${p!.status})`);
    assert(p!.attempts[0].body?.includes('"symbol":"BTC"') === true, `evidence body (got ${p!.attempts[0].body})`);
    const v = scoreListing(c, c.service, p);
    assert(v.verification === "gate", `verification gate (got ${v.verification})`);
  },
);

// Repair loop: 422 names another missing field → retried once with it
await withFetch(
  (_m, body) => {
    if (body?.includes('"chain"')) {
      const ch = Buffer.from(JSON.stringify({ x402Version: 2, accepts: [{ network: "eip155:196", amount: "10000" }] })).toString("base64");
      return { status: 402, body: "{}", headers: { "payment-required": ch } };
    }
    if (body?.includes('"symbol"')) return { status: 422, body: '{"error":"chain is required"}' };
    return { status: 400, body: '{"error":"symbol is required"}' };
  },
  async () => {
    const c = await checkListing(svc({ feeUsd: 0.01, endpoint: "https://api.example.com/price" }));
    const p = await probeValidCall(c.service, c);
    assert(p !== null && p!.attempts.length === 2, `repair loop → 2 attempts (got ${p?.attempts.length})`);
    assert(p!.status === 402, `repaired call reached gate (got ${p!.status})`);
    assert(p!.attempts[1].body?.includes('"chain":"1"') === true, `repair added chain (got ${p!.attempts[1].body})`);
  },
);

// GET-only endpoint: synthesized params go in the query string
await withFetch(
  (m, body) => {
    if (m === "GET" && !body) return { status: 200, body: '{"ok":true,"price":67000,"symbol":"BTC","volume":5}' };
    return { status: 404 };
  },
  async () => {
    const c = await checkListing(svc({ feeUsd: 0, endpoint: "https://api.example.com/quote", description: "Get a price quote for a symbol" }));
    assert(c.checkedMethod === "GET", "GET-only detected");
    const p = await probeValidCall(c.service, c);
    assert(p !== null && p!.attempts.length > 0, "probe ran on GET endpoint");
    assert(p!.attempts[0].method === "GET", "synthesized call used GET");
  },
);

// Side-effecting tool name → skipped, never called
{
  const c = check({
    protocol: "mcp",
    mcpTools: [{ name: "execute_swap", inputSchema: { properties: { amount: { type: "string" } }, required: ["amount"] } }],
  });
  const p = await probeValidCall(svc({ feeUsd: 0.01 }), c);
  assert(p !== null && p!.sideEffectSkipped === true, "side-effecting tool skipped");
  assert(p!.attempts.length === 0, "no request sent to side-effecting service");
}

// MCP tools/call: picks the tool matching the listing, sends synthesized args
await withFetch(
  (_m, body) => {
    if (body?.includes('"initialize"')) {
      return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "t" }, capabilities: {} } }), headers: { "mcp-session-id": "sx" } };
    }
    if (body?.includes('"tools/list"')) {
      return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [
        { name: "get_price", description: "token price", inputSchema: { properties: { symbol: { type: "string" } }, required: ["symbol"] } },
        { name: "list_chains", description: "supported chains", inputSchema: { properties: {} } },
      ] } }) }; // eslint-disable-line
    }
    if (body?.includes('"tools/call"')) {
      const isPrice = body.includes('"get_price"');
      return {
        status: 200,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          result: isPrice
            ? { content: [{ type: "text", text: '{"price":67000}' }], data: { price: 67000, symbol: "BTC", ok: true } }
            : { content: [] },
        }),
      };
    }
    return { status: 202, body: "" };
  },
  async () => {
    const c = await checkListing(
      svc({ feeUsd: 0.5, serviceName: "Token Price", description: "price lookup", endpoint: "https://api.example.com/mcp" }),
    );
    assert(c.protocol === "mcp" && c.toolCount === 2, "tools listed");
    const p = await probeValidCall(c.service, c);
    assert(p !== null && p!.toolName === "get_price", `picked get_price (got ${p?.toolName})`);
    assert(p!.status === 200, `tools/call ran (got ${p!.status})`);
    assert(p!.request?.mcpSessionId === "sx", "session id carried to paid replay");
  },
);

// ── rework: honest classification ─────────────────────────────────────────

// Free service rejecting our synthesized request → unverified, NOT broken
{
  const s = svc({ feeUsd: 0 });
  const v = scoreListing(
    check({ status: 400, bodyJson: { error: "profile is required" } }),
    s,
    probe({ status: 422, bodyJson: { error: "profile must be an object" } }),
  );
  assert(v.status === "unverified", `free rejection → unverified (got ${v.status})`);
  assert(v.verification === "none", `free rejection → verification none (got ${v.verification})`);
  assert(v.subScores.delivery === null, "free rejection → delivery unknown");
  assert(
    v.flags.some((f) => f.startsWith("Couldn't build an accepted request automatically")),
    `neutral flag (got ${v.flags.join("|")})`,
  );
}

// MCP tools/call text-only intro on a paid listing → thin delivery, no accusation
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ protocol: "mcp", status: 200, bodyJson: { ok: true } }),
    s,
    probe({
      toolName: "get_started",
      status: 200,
      bodyJson: { content: [{ type: "text", text: "Welcome! Call paid_tool to get your report." }] },
    }),
  );
  assert(v.subScores.delivery === 60, `mcp intro → delivery 60 (got ${v.subScores.delivery})`);
  assert(!v.flags.some((f) => f.includes("Payment not enforced")), "no payment-enforced accusation on mcp intro");
  assert(
    v.flags.some((f) => f.includes("Returned free content (intro/help); paid flow not exercised")),
    `mcp freemium flag (got ${v.flags.join("|")})`,
  );
}

// Paid replay re-challenged with 402 → payment_rejected, degraded, never failed
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 402, challenge: challenge(), bodyJson: null }),
    s,
    probe({ status: 402, challenge: challenge() }),
    {
      record: { at: new Date().toISOString(), delivered: false, status: 402, outcome: "payment_rejected" },
      bodyJson: null,
      substantive: false,
    },
  );
  assert(v.status === "degraded", `payment_rejected → degraded (got ${v.status})`);
  assert(v.verification === "gate", `payment_rejected → gate not failed (got ${v.verification})`);
  assert(
    v.flags.some((f) => f.includes("re-issued the challenge")),
    `inconclusive flag (got ${v.flags.join("|")})`,
  );
}

// Aggregate paid buckets reconcile exactly — headline only counts settled
// calls made with exact/dictionary inputs
{
  const paidAt = new Date().toISOString();
  const pv = (o: Partial<import("../src/lib/marketplace-index").PaidVerification>) =>
    ({ at: paidAt, delivered: false, ...o });
  const rows = [
    // headline: 2 delivered (1 substantive + 1 thin) of 3 settled verified
    indexed({ serviceId: "d1", feeUsd: 0.01, lastPaidVerification: pv({ delivered: true, status: 200, settlementTx: "0x1", outcome: "delivered", inputConfidence: "exact" }) }),
    indexed({ serviceId: "t1", feeUsd: 0.01, lastPaidVerification: pv({ status: 200, settlementTx: "0x2", outcome: "thin", inputConfidence: "dictionary" }) }),
    indexed({ serviceId: "e1", feeUsd: 0.01, lastPaidVerification: pv({ status: 500, settlementTx: "0x3", outcome: "errored", inputConfidence: "exact" }) }),
    // buckets, but out of the headline denominator
    indexed({ serviceId: "r1", feeUsd: 0.01, lastPaidVerification: pv({ status: 402, outcome: "payment_rejected", inputConfidence: "dictionary" }) }),
    indexed({ serviceId: "n1", feeUsd: 0.01, lastPaidVerification: pv({ status: 400, outcome: "not_settled", inputConfidence: "exact" }) }),
    // guess-tier settled attempts never reach the headline
    indexed({ serviceId: "g1", feeUsd: 0.01, lastPaidVerification: pv({ status: 200, settlementTx: "0x4", outcome: "errored", inputConfidence: "guess" }) }),
    indexed({ serviceId: "g2", feeUsd: 0.01, lastPaidVerification: pv({ delivered: true, status: 200, settlementTx: "0x5", outcome: "delivered" }) }), // legacy: no confidence → guess
    indexed({ serviceId: "f1", feeUsd: 0 }),
    indexed({ serviceId: "p1", feeUsd: 0.01 }),
  ];
  const b = paidBuckets(rows);
  assert(b.paidAttempted === 7, `paidAttempted 7 (got ${b.paidAttempted})`);
  assert(b.paidDelivered === 2, `paidDelivered 2 (got ${b.paidDelivered})`);
  assert(b.paidDeliveredThin === 1, `paidDeliveredThin 1 (got ${b.paidDeliveredThin})`);
  assert(b.paidPaymentRejected === 1, `paidPaymentRejected 1 (got ${b.paidPaymentRejected})`);
  assert(b.paidErrored === 2, `paidErrored 2 (got ${b.paidErrored})`);
  assert(b.paidNotSettled === 1, `paidNotSettled 1 (got ${b.paidNotSettled})`);
  assert(b.paidGuessExcluded === 2, `paidGuessExcluded 2 (got ${b.paidGuessExcluded})`);
  assert(b.paidSettledVerified === 3, `headline Y=3 (got ${b.paidSettledVerified})`);
  assert(b.paidDeliveredVerified === 2, `headline X=2 (got ${b.paidDeliveredVerified})`);
  assert(b.settledDeliveryRate === 0.667, `settledDeliveryRate 0.667 (got ${b.settledDeliveryRate})`);
}

// Paid "thin" (settled 2xx, nothing substantive) → delivery 60, not failed
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 402, challenge: challenge(), bodyJson: null }),
    s,
    probe({ status: 402, challenge: challenge(), inputConfidence: "exact" }),
    {
      record: { at: new Date().toISOString(), delivered: false, status: 200, settlementTx: "0xt", outcome: "thin", inputConfidence: "exact" },
      bodyJson: { ok: true },
      substantive: false,
    },
  );
  assert(v.subScores.delivery === 60, `thin paid → delivery 60 (got ${v.subScores.delivery})`);
  assert(v.verification === "delivered", `thin paid → delivered (got ${v.verification})`);
  assert(v.status !== "broken", `thin paid → not broken (got ${v.status})`);
}

// Paid not_settled → degraded, never failed/broken
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 402, challenge: challenge(), bodyJson: null }),
    s,
    probe({ status: 402, challenge: challenge(), inputConfidence: "exact" }),
    {
      record: { at: new Date().toISOString(), delivered: false, status: 400, outcome: "not_settled", inputConfidence: "exact" },
      bodyJson: { error: "bad input" },
      substantive: false,
    },
  );
  assert(v.status === "degraded", `not_settled → degraded (got ${v.status})`);
  assert(v.verification === "gate", `not_settled → gate (got ${v.verification})`);
}

// Paid call on guess inputs → never downgrades the row
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 402, challenge: challenge(), bodyJson: null }),
    s,
    probe({ status: 402, challenge: challenge(), inputConfidence: "guess" }),
    {
      record: { at: new Date().toISOString(), delivered: false, status: 422, settlementTx: "0xg", outcome: "errored", inputConfidence: "guess" },
      bodyJson: { error: "wrong params" },
      substantive: false,
    },
  );
  assert(v.subScores.delivery === null, `guess paid → delivery unknown (got ${v.subScores.delivery})`);
  assert(v.status === "healthy", `guess paid → not downgraded (got ${v.status})`);
  assert(v.flags.some((f) => f.includes("guessed inputs")), "guess flag");
}

// pickVerifyTargets: guess inputs are never paid; force bypasses cooldown+confidence
{
  const cand = (id: string, over: Partial<Parameters<typeof pickVerifyTargets>[0][0]> = {}) => ({
    serviceId: id, ours: false, feeUsd: 0.01, callable: true, gateReached: true,
    sideEffectSkipped: false, ...over,
  });
  const now = Date.now();
  const fresh = { at: new Date(now - 60_000).toISOString(), delivered: false };
  const picked = pickVerifyTargets(
    [
      cand("exact", { inputConfidence: "exact" }),
      cand("dict", { inputConfidence: "dictionary" }),
      cand("guess", { inputConfidence: "guess" }),
      cand("cooldown", { inputConfidence: "exact" }),
    ],
    { cooldown: fresh },
    now,
  );
  const ids = picked.map((c) => c.serviceId);
  assert(ids.includes("exact") && ids.includes("dict"), "exact+dictionary eligible");
  assert(!ids.includes("guess"), "guess never paid");
  assert(!ids.includes("cooldown"), "72h cooldown respected");
  const forced = pickVerifyTargets(
    [cand("guess", { inputConfidence: "guess" }), cand("cooldown", { inputConfidence: "exact" })],
    { cooldown: fresh },
    now,
    new Set(["guess", "cooldown"]),
  );
  assert(forced.length === 2, `force bypasses cooldown+confidence (got ${forced.length})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
})();
