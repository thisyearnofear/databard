import {
  scoreListing,
  checkListing,
  findServices,
  OUR_AGENT_ID,
  type ListingCheck,
  type MarketplaceService,
  type MarketplaceIndex,
  type IndexedService,
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

// Free listing, healthy: 200 + JSON + fast → full marks
{
  const v = scoreListing(check(), svc({ feeUsd: 0 }));
  assert(v.score === 95, `free healthy scores 95 (got ${v.score})`); // {} body isn't self-describing
  assert(v.status === "healthy", "free healthy status");
  assert(v.flags.length === 0, `free healthy has no flags (got ${v.flags.join("|")})`);
}

// Paid listing with a correct challenge → healthy
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 402, challenge: challenge(), bodyJson: null }),
    s,
  );
  assert(v.score === 100, `paid correct challenge scores 100 (got ${v.score})`);
  assert(v.status === "healthy", "paid correct challenge healthy");
}

// Charges more than listed → priceMatch fail + flag
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 402, challenge: challenge({ amountUsd: 0.05 }) }),
    s,
  );
  assert(v.checks.priceMatch.pass === "fail", "overcharge fails priceMatch");
  assert(v.flags.some((f) => f.includes("Charges $0.05, listing says $0.01")), "overcharge flag");
}

// Charges less → partial
{
  const s = svc({ feeUsd: 0.10 });
  const v = scoreListing(
    check({ status: 402, challenge: challenge({ amountUsd: 0.02 }) }),
    s,
  );
  assert(v.checks.priceMatch.pass === "partial", "undercharge partial priceMatch");
  assert(v.flags.some((f) => f.startsWith("Charges $0.02")), "undercharge flag");
}

// Free listing demanding payment → gate fail
{
  const s = svc({ feeUsd: 0 });
  const v = scoreListing(check({ status: 402, challenge: challenge() }), s);
  assert(v.checks.paymentGate.pass === "fail", "free+402 fails gate");
  assert(v.flags.includes("Listed free but demands payment"), "free-demands-payment flag");
}

// Paid listing on a non-196 network → partial gate
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 402, challenge: challenge({ network: "eip155:1" }) }),
    s,
  );
  assert(v.checks.paymentGate.pass === "partial", "non-196 gate partial");
  assert(v.flags.some((f) => f.includes("eip155:1")), "non-196 flag");
}

// Undecodable challenge → gate fail, flag
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 402, challenge: { undecodable: true } }),
    s,
  );
  assert(v.checks.paymentGate.pass === "fail", "undecodable gate fails");
  assert(v.flags.some((f) => f.includes("could not be decoded")), "undecodable flag");
}

// Paid listing, 400 error body → gate not reached (neutral, partial)
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({
      status: 400,
      bodyJson: { ok: false, code: "ANSWERS_REQUIRED_BEFORE_PAYMENT", error: "answers required" },
    }),
    s,
  );
  assert(v.checks.paymentGate.pass === "partial", "gate-not-reached 400 partial");
  assert(v.checks.priceMatch.pass === "partial", "gate-not-reached priceMatch partial");
  assert(
    v.flags.includes("Payment gate not reached — service rejects empty input before payment"),
    `gate-not-reached flag (got ${v.flags.join("|")})`,
  );
  assert(!v.flags.some((f) => f.includes("did not request payment") || f.includes("without requesting")), "no accusation flag");
}

// Paid listing, 2xx with ok:false → gate not reached
{
  const s = svc({ feeUsd: 0.5 });
  const v = scoreListing(check({ status: 200, bodyJson: { ok: false, error: "bad args" } }), s);
  assert(v.checks.paymentGate.pass === "partial", "2xx ok:false gate partial");
  assert(v.flags.some((f) => f.startsWith("Payment gate not reached")), "2xx error flag neutral");
}

// Paid listing, 2xx clean JSON body, no 402 → the real finding
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(check({ status: 200, bodyJson: { data: [1, 2, 3] } }), s);
  assert(v.checks.paymentGate.pass === "fail", "free content without payment fails gate");
  assert(
    v.flags.includes("Listed at $0.01 but returned a response without requesting payment"),
    `no-payment flag (got ${v.flags.join("|")})`,
  );
}

// 404 → capped at 40 → broken
{
  const v = scoreListing(check({ status: 404 }), svc());
  assert(v.checks.responds.pass === "fail", "404 responds fails");
  assert(v.flags.includes("Endpoint not found (404)"), "404 flag");
  assert(v.score <= 40, `404 capped to <=40 (got ${v.score})`);
  assert(v.status === "broken", `404 → broken (got ${v.status})`);
}

// 5xx → capped broken + server error flag
{
  const v = scoreListing(check({ status: 503 }), svc());
  assert(v.flags.includes("Server error 503"), "5xx flag");
  assert(v.score <= 40 && v.status === "broken", `5xx → broken (got ${v.status}, ${v.score})`);
}

// Network error → 0 unreachable
{
  const v = scoreListing(check({ status: 0, error: "Timeout after 10000ms" }), svc());
  assert(v.score === 0, "unreachable scores 0");
  assert(v.status === "unreachable", "unreachable status");
}

// Internal URL in challenge → flag
{
  const s = svc({ feeUsd: 0.01 });
  const v = scoreListing(
    check({ status: 402, challenge: challenge({ resourceUrl: "https://0.0.0.0:42100/api/x" }) }),
    s,
  );
  assert(
    v.flags.includes("Payment challenge advertises an internal URL"),
    "internal URL flag",
  );
}

// Template substitution flag
{
  const v = scoreListing(check({ templateSubstituted: true }), svc());
  assert(v.flags.includes("Templated endpoint (checked with BTC)"), "template flag");
}

// ── checkListing method fallback (mocked fetch) ──────────────────────────

async function withFetch(
  handler: (method: string) => { status: number; body?: string; headers?: Record<string, string> },
  fn: () => Promise<void>,
) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { method?: string }) => {
    const r = handler((init?.method ?? "GET").toUpperCase());
    return new Response(r.body ?? "", {
      status: r.status,
      headers: { "content-type": "application/json", ...(r.headers ?? {}) },
    });
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
    const c = await checkListing(svc());
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
    const c = await checkListing(svc({ feeUsd: 0.01 }));
    assert(c.checkedMethod === "GET", `wrong-method body falls back to GET (got ${c.checkedMethod})`);
    assert(c.status === 402, `GET 402 challenge captured (got ${c.status})`);
    assert(c.challenge?.network === "eip155:196", "challenge decoded after GET fallback");
  },
);

// POST 404 + GET also 404 → stays 404, checkedMethod GET
await withFetch(
  () => ({ status: 404 }),
  async () => {
    const c = await checkListing(svc());
    assert(c.status === 404 && c.checkedMethod === "GET", "double-404 recorded");
    const v = scoreListing(c, c.service);
    assert(v.status === "broken", `double-404 → broken (got ${v.status})`);
  },
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
})();
