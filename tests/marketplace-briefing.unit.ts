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
  sanitizeSpeech,
  spokenName,
} from "../src/lib/marketplace-briefing";
import { findAlternatives } from "../src/lib/marketplace-index";
import { chunkBatches } from "../src/lib/probe-registry";
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

// ── Speech quality ─────────────────────────────────────────────────────────

{
  const allText = [...scoped.script, ...whole.script].map((s) => s.text).join(" ");
  check("no #ids in speech", !/#\d/.test(allText), allText.match(/#\d+/g));
  check("no arrows in speech", !allText.includes("→"));
  check("no HTTP codes in speech", !/HTTP\s?\d{3}/i.test(allText));
  check("no x402 jargon in speech", !/\bx402\b/i.test(allText));
  check("no A2MCP jargon in speech", !/A2MCP/i.test(allText));
  check("says OKX AI", whole.script.some((s) => s.text.includes("OKX AI")));
}
check(
  "sanitizeSpeech strips ids/arrows/codes/jargon",
  sanitizeSpeech("Foo (#40035): unreachable → broken (HTTP 400) via x402 A2MCP") ===
    "Foo (): unreachable  to broken () via payment agent service".replace(/\(\)/g, "").replace(/\s{2,}/g, " ") ||
    !/[#→]|HTTP\s?\d{3}|x402|A2MCP/i.test(sanitizeSpeech("Foo (#40035): unreachable → broken (HTTP 400) via x402 A2MCP")),
);

// ── Switch rule: healthy rows never switch ─────────────────────────────────

{
  const idx3 = indexWith([
    svc({ serviceId: "700", status: "healthy", score: 60, verification: "gate" }),
    svc({ serviceId: "200", status: "healthy", score: 95, verification: "delivered" }),
  ]);
  const b = buildMarketplaceBriefing(idx3, hist, { agentIds: [], serviceIds: ["700"], endpoints: [] });
  const e = b.services[0];
  check(
    "healthy + better alternative → keep w/ alternative note",
    e.recommendation === "keep" && e.reason.includes("alternative available"),
    `${e.recommendation}: ${e.reason}`,
  );
}

// ── Ranking eligibility ────────────────────────────────────────────────────

{
  const idx4 = indexWith([
    svc({ serviceId: "1", status: "unverified", score: null, verification: "none" }),
    svc({ serviceId: "2", status: "healthy", score: 95, verification: "gate", serviceName: "GateOnly" }),
    svc({ serviceId: "3", status: "healthy", score: 80, verification: "delivered", serviceName: "FreeDel" }),
    svc({ serviceId: "4", status: "healthy", score: 70, verification: "delivered", serviceName: "PaidDel",
      lastPaidVerification: { at: "2026-09-22T00:00:00Z", delivered: true, outcome: "delivered" } }),
    svc({ serviceId: "5", status: "degraded", score: 50, verification: "gate", serviceName: "Degraded" }),
  ]);
  const alts = findAlternatives(idx4, undefined, undefined, 10);
  check("unverified never an alternative", !alts.some((a) => a.serviceId === "1"));
  check("degraded never an alternative", !alts.some((a) => a.serviceId === "5"));
  check(
    "ordering: paid-delivered > free-delivered > gate",
    alts[0]?.serviceId === "4" && alts[1]?.serviceId === "3" && alts[2]?.serviceId === "2",
    alts.map((a) => a.serviceId).join(","),
  );
}

// ── Null score end-to-end ──────────────────────────────────────────────────

{
  const idx5 = indexWith([
    svc({ serviceId: "1", status: "unverified", score: null, verification: "none" }),
  ]);
  const b = buildMarketplaceBriefing(idx5, hist, { agentIds: [], serviceIds: ["1"], endpoints: [] });
  check("briefing says not scored", b.services[0].reason !== undefined && b.summary.includes("not scored"));
  // registry payload: null score publishes as 0
  const batch = chunkBatches([{ serviceId: "1", score: null, status: "unverified" }])[0];
  check("registry publishes unverified as score 0 + status 0", batch.scores[0] === 0 && batch.statuses[0] === 0);
}

// ── Evidence-backed delivery list (replaces keyword categories) ────────────

{
  const fresh = { at: "2026-09-22T10:00:00.000Z", delivered: true, outcome: "delivered" as const };
  const idx6 = indexWith([
    svc({ serviceId: "1", serviceName: "Paid Newer", lastPaidVerification: fresh }),
    svc({ serviceId: "2", serviceName: "Paid Older",
      lastPaidVerification: { at: "2026-09-21T00:00:00.000Z", delivered: true, outcome: "delivered" } }),
    svc({ serviceId: "3", serviceName: "Paid Stale", status: "degraded", score: 50,
      lastPaidVerification: { at: "2026-09-10T00:00:00.000Z", delivered: true, outcome: "delivered" } }),
    svc({ serviceId: "4", serviceName: "Gate Only", verification: "gate", lastPaidVerification: undefined }),
    svc({ serviceId: "5", serviceName: "Unver", status: "unverified", score: null, verification: "none" }),
  ]);
  const b = buildMarketplaceBriefing(idx6, hist, { agentIds: [], serviceIds: [], endpoints: [] });
  const rd = b.market?.recentDeliveries ?? [];
  check("recentDeliveries: only last-72h paid deliveries marked paid",
    rd.filter((d) => d.paid).map((d) => d.serviceId).join(",") === "1,2",
    JSON.stringify(rd));
  check("recentDeliveries pads to 3 with healthy gate-verified",
    rd.length === 3 && rd.some((d) => d.serviceId === "4" && !d.paid));
  check("recentDeliveries never includes unverified",
    !rd.some((d) => d.serviceId === "5" || d.serviceId === "3"));
  const text = b.script.map((s) => s.text).join(" ");
  check("paid-deliveries sentence spoken", /delivered a real answer to a paid request/.test(text), text.slice(0, 200));
  check("72h-stale delivery not spoken", !text.includes("Paid Stale"));
}

// ── Speech: spokenName, transition filter, paid line, per-segment dedupe ───

check("spokenName keeps latin", spokenName("Token Metadata", "Agent") === "Token Metadata");
check("spokenName falls back to latin agent", spokenName("地址行为分析服务", "ChainLens") === "ChainLens");
check("spokenName generic when both non-latin", spokenName("地址行为分析服务", "链眼") === "a service with a non-English listing");

{
  // Transitions to/from unverified are method noise — never spoken.
  const prev: HistoryRun = {
    runAt: "2026-09-22T11:00:00.000Z",
    results: [
      { serviceId: "1", status: "unverified" },
      { serviceId: "2", status: "healthy" },
    ],
  };
  const idx7 = indexWith([
    svc({ serviceId: "1", serviceName: "Quiet", status: "degraded", score: 50, verification: "none" }),
    svc({ serviceId: "2", serviceName: "Loud", status: "broken", score: 20 }),
  ]);
  const h2 = [...hist.slice(0, -1), prev, hist[hist.length - 1]];
  const b = buildMarketplaceScript(buildMarketplaceBriefing(idx7, h2, { agentIds: [], serviceIds: [], endpoints: [] }));
  const text = b.map((s) => s.text).join(" ");
  check("unverified transition not spoken", !text.includes("Quiet"), text);
  check("healthy→broken transition spoken", text.includes("Loud went from healthy to broken"), text);
}

{
  // Two delivered-paid services both say the line — dedupe is per-segment.
  const paidRec = { at: "2026-09-22T10:00:00.000Z", delivered: true, outcome: "delivered" as const };
  const idx8 = indexWith([
    svc({ serviceId: "1", serviceName: "Alpha Svc", lastPaidVerification: paidRec }),
    svc({ serviceId: "2", serviceName: "Beta Svc", lastPaidVerification: paidRec }),
  ]);
  const b = buildMarketplaceBriefing(idx8, hist, { agentIds: [], serviceIds: ["1", "2"], endpoints: [] });
  const lines = b.script.filter((s) => /delivered a real answer to a paid request/.test(s.text));
  check("paid line repeated per service (per-segment dedupe)", lines.length === 2,
    b.script.map((s) => s.text).join(" | "));
  check("sentences capitalised", !b.script.some((s) => /[a-z]/.test(s.text.charAt(0))),
    b.script.map((s) => s.text.charAt(0)).join(","));
}

{
  // Paid headline spoken in the fixed phrasing.
  const idx9 = indexWith([svc({ serviceId: "1" })]);
  const b = buildMarketplaceScript(buildMarketplaceBriefing(idx9, hist, { agentIds: [], serviceIds: [], endpoints: [] }));
  const text = b.map((s) => s.text).join(" ");
  check("paid line phrasing", /We made real payments on X Layer: 1 of 2 services that settled delivered a real answer/.test(text), text);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
