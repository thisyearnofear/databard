/**
 * Unit tests for the paid-briefing live re-check (Option 1: fresh evidence).
 * - Pure parts (fresh flag, freshness computation) run with fixtures.
 * - recheckServicesLive fallback paths run offline: an unroutable endpoint
 *   trips the SSRF guard before any network I/O, exercising the cached
 *   fallback without touching the network.
 *
 * Run: npx tsx tests/briefing-live.unit.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMarketplaceBriefing,
  parseBriefingRequest,
  parseFreshFlag,
} from "../src/lib/marketplace-briefing";
import { recheckServicesLive } from "../src/lib/marketplace-index";
import type {
  HistoryRun,
  IndexedService,
  MarketplaceIndex,
} from "../src/lib/marketplace-index";

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
    generatedAt: "2026-09-24T12:00:00.000Z",
    crawledAt: "2026-09-24T11:00:00.000Z",
    aggregates: {
      checked: services.length,
      healthy: services.filter((s) => s.status === "healthy").length,
      degraded: 0,
      broken: 0,
      unreachable: 0,
      unverified: 0,
      priceMismatchCount: 0,
      freeDemandsPaymentCount: 0,
      medianLatency: 200,
      gateVerified: services.length,
      delivered: services.length,
      paidAttempted: 0,
      paidDelivered: 0,
      paidDeliveredThin: 0,
      paidPaymentRejected: 0,
      paidErrored: 0,
      paidNotSettled: 0,
      paidGuessExcluded: 0,
      paidDeliveredVerified: 0,
      paidSettledVerified: 0,
      settledDeliveryRate: 0,
      verifySpentUsd: 0,
      verifyAttempted: 0,
    },
    services,
  };
}

const hist: HistoryRun[] = [
  {
    runAt: "2026-09-23T12:00:00.000Z",
    results: [{ serviceId: "1", status: "healthy" }],
  },
  {
    runAt: "2026-09-24T12:00:00.000Z",
    results: [{ serviceId: "1", status: "healthy" }],
  },
];

describe("fresh flag parsing", () => {
  it("defaults to live (true) when omitted", () => {
    assert.equal(parseBriefingRequest({}).fresh, true);
    assert.equal(parseBriefingRequest({ agentIds: ["2023"] }).fresh, true);
  });

  it("honours explicit opt-out (fresh:false, live alias, strings)", () => {
    assert.equal(parseBriefingRequest({ fresh: false }).fresh, false);
    assert.equal(parseBriefingRequest({ live: false }).fresh, false);
    assert.equal(parseFreshFlag("false"), false);
    assert.equal(parseFreshFlag("no"), false);
    assert.equal(parseFreshFlag(true), true);
    assert.equal(parseFreshFlag(undefined), true);
  });

  it("fresh alone stays marketplace mode (no schema intent)", () => {
    assert.equal(parseBriefingRequest({ fresh: false }).mode, "marketplace");
  });
});

describe("freshness computation", () => {
  it("no live map → cached, entries marked not fresh", () => {
    const b = buildMarketplaceBriefing(indexWith([svc()]), hist, { agentIds: [], serviceIds: ["1"], endpoints: [] });
    assert.equal(b.freshness, "cached");
    assert.equal(b.services[0]?.fresh, false);
    assert.equal(b.services[0]?.checkedAt, null);
    assert.equal(b.liveNote, undefined);
  });

  it("all rows fresh → live", () => {
    const live = new Map([["1", { fresh: true, checkedAt: "2026-09-25T12:00:00.000Z" }]]);
    const b = buildMarketplaceBriefing(indexWith([svc()]), hist, { agentIds: [], serviceIds: ["1"], endpoints: [] }, live);
    assert.equal(b.freshness, "live");
    assert.equal(b.services[0]?.fresh, true);
    assert.equal(b.services[0]?.checkedAt, "2026-09-25T12:00:00.000Z");
    assert.match(b.summary, /Freshness: live/);
  });

  it("mixed rows → partial", () => {
    const idx = indexWith([
      svc({ serviceId: "1", serviceName: "One" }),
      svc({ serviceId: "2", agentId: "a2", serviceName: "Two" }),
    ]);
    const h: HistoryRun[] = [
      { runAt: "2026-09-23T12:00:00.000Z", results: [{ serviceId: "1", status: "healthy" }, { serviceId: "2", status: "healthy" }] },
      { runAt: "2026-09-24T12:00:00.000Z", results: [{ serviceId: "1", status: "healthy" }, { serviceId: "2", status: "healthy" }] },
    ];
    const live = new Map([
      ["1", { fresh: true, checkedAt: "2026-09-25T12:00:00.000Z" }],
      ["2", { fresh: false, checkedAt: null }],
    ]);
    const b = buildMarketplaceBriefing(idx, h, { agentIds: [], serviceIds: ["1", "2"], endpoints: [] }, live);
    assert.equal(b.freshness, "partial");
    assert.equal(b.services.find((s) => s.serviceId === "1")?.fresh, true);
    assert.equal(b.services.find((s) => s.serviceId === "2")?.fresh, false);
    assert.match(b.summary, /Freshness: partial/);
  });

  it("whole-marketplace scope is always cached", () => {
    const b = buildMarketplaceBriefing(indexWith([svc()]), hist, { agentIds: [], serviceIds: [], endpoints: [] });
    assert.equal(b.scope, "marketplace");
    assert.equal(b.freshness, "cached");
  });
});

describe("recheckServicesLive — offline fallbacks (no network)", () => {
  it("unroutable endpoint degrades to the cached row, never throws", async () => {
    const cached = svc({ serviceId: "9", endpoint: "http://localhost:9/nope" });
    const out = await recheckServicesLive([cached], { timeoutMs: 5000, paidBudgetUsd: 0 });
    assert.equal(out.length, 1);
    assert.equal(out[0]?.fresh, false);
    assert.equal(out[0]?.row.serviceId, "9");
    // Cached row returned untouched (score preserved, not zeroed).
    assert.equal(out[0]?.row.score, 90);
    assert.ok(out[0]?.note);
  });

  it("own services are never self-checked", async () => {
    const cached = svc({ serviceId: "8", ours: true });
    const out = await recheckServicesLive([cached], { timeoutMs: 5000, paidBudgetUsd: 0 });
    assert.equal(out[0]?.fresh, false);
    assert.match(out[0]?.note ?? "", /Own service/);
  });

  it("paidBudgetUsd: 0 disables paid verification without error", async () => {
    const cached = svc({ serviceId: "7", endpoint: "http://localhost:9/nope" });
    const out = await recheckServicesLive([cached], { timeoutMs: 5000, paidBudgetUsd: 0 });
    assert.equal(out[0]?.fresh, false);
    assert.equal(out[0]?.row.paid, false);
  });
});
