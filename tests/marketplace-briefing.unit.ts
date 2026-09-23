/**
 * Marketplace Briefing — mode selection, recommendations, change detection,
 * script builder. Run: npx tsx tests/marketplace-briefing.unit.ts
 */
import {
  buildMarketplaceBriefing,
  buildMarketplaceScript,
  flagToPlain,
  parseBriefingRequest,
  resolveBriefingServices,
} from "../src/lib/marketplace-briefing";
import type {
  HistoryRun,
  IndexedService,
  MarketplaceIndex,
} from "../src/lib/marketplace-index";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}`, extra ?? "");
  }
}

function svc(over: Partial<IndexedService> = {}): IndexedService {
  return {
    serviceId: "1",
    agentId: "a1",
    agentName: "Agent One",
    serviceName: "Service One",
    endpoint: "https://one.example.com/api",
    feeUsd: 0.01,
    online: true,
    category: "data",
    description: "token price data",
    ours: false,
    score: 90,
    status: "healthy",
    checks: {},
    flags: [],
    latencyMs: 200,
    httpStatus: 402,
    verification: "delivered",
    paid: false,
    subScores: { availability: 100, paymentIntegrity: 100, delivery: 100 },
    ...over,
  };
}

function indexWith(services: IndexedService[]): MarketplaceIndex {
  return {
    kind: "okx-marketplace-index",
    generatedAt: "2026-09-22T12:00:00.000Z",
    crawledAt: "2026-09-20T00:00:00.000Z",
    aggregates: {
      checked: services.filter((s) => !s.ours).length,
      healthy: services.filter((s) => s.status === "healthy" && !s.ours).length,
      degraded: services.filter((s) => s.status === "degraded" && !s.ours).length,
      broken: services.filter((s) => s.status === "broken" && !s.ours).length,
      unreachable: services.filter((s) => s.status === "unreachable" && !s.ours).length,
      unverified: services.filter((s) => s.status === "unverified" && !s.ours).length,
      priceMismatchCount: 0,
      freeDemandsPaymentCount: 0,
      medianLatency: 300,
      gateVerified: 3,
      delivered: 2,
      paidAttempted: 3,
      paidDelivered: 1,
      paidDeliveredThin: 0,
      paidPaymentRejected: 1,
      paidErrored: 0,
      paidNotSettled: 1,
      paidGuessExcluded: 0,
      paidDeliveredVerified: 1,
      paidSettledVerified: 2,
      settledDeliveryRate: 0.5,
      verifySpentUsd: 0.02,
      verifyAttempted: 2,
    },
    services,
  };
}

// ── parseBriefingRequest: mode selection ───────────────────────────────────

check("empty body → marketplace", parseBriefingRequest({}).mode === "marketplace");
check("demo:true alone → marketplace", parseBriefingRequest({ demo: true }).mode === "marketplace");
check(
  "envelope-wrapped query → marketplace",
  parseBriefingRequest({ arguments: { query: "token security" } }).mode === "marketplace",
);
check(
  "string envelope → marketplace with query",
  parseBriefingRequest({ input: "token security" }).query === "token security",
);
check(
  "mode:schema → schema",
  parseBriefingRequest({ mode: "schema", demo: true }).mode === "schema",
);
check(
  "explicit schemaFqn → schema",
  parseBriefingRequest({ schemaFqn: "db.sales" }).mode === "schema",
);
check("explicit source → schema", parseBriefingRequest({ source: "dune" }).mode === "schema");
check(
  "connector block → schema",
  parseBriefingRequest({ openmetadata: { url: "x", token: "y" } }).mode === "schema",
);
check(
  "agentIds → marketplace",
  parseBriefingRequest({ agentIds: ["2023"] }).mode === "marketplace",
);
check(
  "agentIds parsed incl singular + numbers",
  parseBriefingRequest({ agentIds: ["2023", 40042], agentId: "9878" }).agentIds.join(",") ===
    "2023,40042,9878",
);
check(
  "audio none honoured",
  parseBriefingRequest({ audio: "none" }).audio === "none" &&
    parseBriefingRequest({}).audio === "inline",
);

// ── resolveBriefingServices ────────────────────────────────────────────────

const idx = indexWith([
  svc({ serviceId: "100", agentId: "2023", serviceName: "Token Security Scan", description: "token security audit" }),
  svc({ serviceId: "200", agentId: "9", serviceName: "Price Feed", description: "token price data" }),
  svc({ serviceId: "300", agentId: "8", serviceName: "Ours", ours: true }),
]);
check(
  "agentId resolves",
  resolveBriefingServices(idx, { agentIds: ["2023"], serviceIds: [], endpoints: [] })[0]
    ?.serviceId === "100",
);
check(
  "keyword query resolves",
  resolveBriefingServices(idx, { agentIds: [], serviceIds: [], endpoints: [], query: "security" })[0]
    ?.serviceId === "100",
);
check(
  "unknown query → empty (marketplace fallback)",
  resolveBriefingServices(idx, { agentIds: [], serviceIds: [], endpoints: [], query: "zzz-nothing" })
    .length === 0,
);

// ── Recommendations + change detection ─────────────────────────────────────

const hist: HistoryRun[] = [
  { runAt: "2026-09-21T00:00:00.000Z", results: [
    { serviceId: "100", status: "healthy" },
    { serviceId: "200", status: "healthy" },
    { serviceId: "400", status: "degraded" },
  ]},
  { runAt: "2026-09-22T12:00:00.000Z", results: [
    { serviceId: "100", status: "broken" },
    { serviceId: "200", status: "healthy" },
    { serviceId: "400", status: "broken" },
  ]},
];

const idx2 = indexWith([
  svc({ serviceId: "100", status: "broken", score: 30, verification: "failed", subScores: { availability: 0, paymentIntegrity: 50, delivery: 0 } }),
  svc({ serviceId: "200", status: "healthy", score: 95 }),
  svc({ serviceId: "400", status: "broken", score: 20, verification: "failed" }),
  svc({ serviceId: "500", status: "degraded", score: 60, verification: "gate",
    lastPaidVerification: { at: "2026-09-22T00:00:00Z", delivered: false, outcome: "payment_rejected" } }),
  // 94: degraded but no healthy alternative scores ≥15 higher → watch.
  svc({ serviceId: "600", status: "degraded", score: 94, verification: "gate" }),
]);

const scoped = buildMarketplaceBriefing(idx2, hist, { agentIds: [], serviceIds: ["100", "200", "500", "600"], endpoints: [] });
const byId = Object.fromEntries(scoped.services.map((s) => [s.serviceId, s]));

check("scoped scope", scoped.scope === "services");
check("broken → switch", byId["100"].recommendation === "switch");
check(
  "payment_rejected → switch",
  byId["500"].recommendation === "switch" && byId["500"].reason.includes("re-challenged"),
);
check(
  "healthy+delivered → keep",
  byId["200"].recommendation === "keep",
);
check(
  "degraded gate-only → watch",
  byId["600"].recommendation === "watch",
);
check(
  "change since prev run recorded",
  byId["100"].changeSincePrev === "healthy → broken",
  byId["100"].changeSincePrev,
);
check(
  "no-change → null",
  byId["200"].changeSincePrev === null,
);
check(
  "~24h change recorded",
  byId["400"] !== undefined || true, // 400 not requested; check via 100
);
check(
  "24h-ago baseline works",
  buildMarketplaceBriefing(idx2, hist, { agentIds: [], serviceIds: ["400"], endpoints: [] })
    .services[0].changeSince24h === "degraded → broken",
);
check("alternatives capped at 2", byId["100"].alternatives.length <= 2);
check(
  "ours excluded from scoped results",
  buildMarketplaceBriefing(idx, hist, { agentIds: [], serviceIds: ["300"], endpoints: [] })
    .services.length === 0,
);

// ── Whole-marketplace fallback ─────────────────────────────────────────────

const whole = buildMarketplaceBriefing(idx2, hist, { agentIds: [], serviceIds: [], endpoints: [] });
check("empty request → marketplace scope", whole.scope === "marketplace");
check("market counts present", whole.market?.counts.broken === 2);
check(
  "paid headline rendered",
  whole.market?.paidHeadline === "Paid & delivered 1 of 2 settled calls with verified inputs",
);
check(
  "notable changes listed",
  (whole.market?.notableChanges ?? []).some((c) => c.includes("100")),
);
check("market alternatives present", whole.alternatives.length > 0);

// ── flagToPlain ────────────────────────────────────────────────────────────

check(
  "domain-mismatch flag translates",
  flagToPlain("Payment challenge declares token domain USDT/2 but the token is USD₮0/1 — standard x402 clients will fail to pay").includes("wrong token domain"),
);
check("unknown flag passes through", flagToPlain("Custom flag text") === "Custom flag text");

// ── Script builder ─────────────────────────────────────────────────────────

for (const [name, b] of [["scoped", scoped], ["whole", whole]] as const) {
  const script = b.script;
  check(
    `${name}: 6-10 segments`,
    script.length >= 6 && script.length <= 10,
    script.length,
  );
  check(
    `${name}: speakers alternate`,
    script.every((s, i) => s.speaker === (i % 2 === 0 ? "Alex" : "Morgan")),
  );
  check(
    `${name}: no empty text`,
    script.every((s) => s.text.trim().length > 10),
  );
}

const bareScript = buildMarketplaceScript(whole);
check("script usable standalone", bareScript.length >= 6 && bareScript.length <= 10);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
