/**
 * Deterministic unit tests for the fleet (town-hall) analysis engine.
 * No network — fixtures are DataHubDatasetMeta shapes as if read from the GMS.
 * Run with: node --import tsx tests/fleet-analysis.unit.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFleetReport, downstreamCounts } from "../src/lib/fleet-analysis";
import type { DataHubDatasetMeta } from "../src/lib/datahub-adapter";

const urn = (platform: string, name: string, env = "PROD") =>
  `urn:li:dataset:(urn:li:dataPlatform:${platform},${name},${env})`;
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

const datasets: DataHubDatasetMeta[] = [
  {
    urn: urn("postgres", "db.sales.customer"),
    name: "db.sales.customer",
    platform: "postgres",
    description: "Customer master",
    columns: [{ name: "id" }, { name: "email", tags: ["PII.Email"] }, { name: "created_at" }] as unknown as DataHubDatasetMeta["columns"],
    tags: [],
    glossaryTerms: ["customer_data"],
    owner: "jane.chen",
    freshness: daysAgo(0.5),
    qualityTests: [
      { name: "id_not_null", status: "Success" },
      { name: "email_unique", status: "Success" },
    ],
    upstream: [],
    downstream: [urn("postgres", "db.sales.orders")],
  },
  {
    urn: urn("postgres", "db.sales.orders"),
    name: "db.sales.orders",
    platform: "postgres",
    description: "Customer orders",
    columns: [] as unknown as DataHubDatasetMeta["columns"],
    tags: [],
    glossaryTerms: [],
    owner: "jane.chen",
    freshness: daysAgo(0.5),
    qualityTests: [
      { name: "fk_customer", status: "Failed" },
      { name: "total_positive", status: "Success" },
    ],
    upstream: [urn("postgres", "db.sales.customer")],
    downstream: [urn("postgres", "db.sales.order_items"), urn("postgres", "db.sales.payments")],
  },
  {
    urn: urn("postgres", "db.sales.order_items"),
    name: "db.sales.order_items",
    platform: "postgres",
    columns: [] as unknown as DataHubDatasetMeta["columns"],
    tags: [],
    glossaryTerms: [],
    rowCount: 2_000_100,
    freshness: daysAgo(6),
    qualityTests: [],
    upstream: [urn("postgres", "db.sales.orders")],
    downstream: [],
  },
  {
    urn: urn("postgres", "db.sales.payments"),
    name: "db.sales.payments",
    platform: "postgres",
    description: "Payment events linked to orders",
    columns: [] as unknown as DataHubDatasetMeta["columns"],
    tags: [],
    glossaryTerms: [],
    owner: "kofi.amankwah",
    freshness: daysAgo(0.3),
    qualityTests: [{ name: "amount_positive", status: "Success" }],
    upstream: [urn("postgres", "db.sales.orders")],
    downstream: [],
  },
];

describe("downstreamCounts", () => {
  it("computes transitive blast radius", () => {
    const counts = downstreamCounts(datasets);
    // customer -> orders -> {order_items, payments}
    assert.equal(counts.get(urn("postgres", "db.sales.customer")), 3);
    assert.equal(counts.get(urn("postgres", "db.sales.orders")), 2);
    assert.equal(counts.get(urn("postgres", "db.sales.order_items")), 0);
    assert.equal(counts.get(urn("postgres", "db.sales.payments")), 0);
  });

  it("handles cycles without hanging", () => {
    const cyc = [
      { ...datasets[0], urn: "a", name: "a", downstream: ["b"] },
      { ...datasets[1], urn: "b", name: "b", downstream: ["a"] },
    ] as DataHubDatasetMeta[];
    const counts = downstreamCounts(cyc);
    assert.equal(counts.get("a"), 1);
    assert.equal(counts.get("b"), 1);
  });
});

describe("buildFleetReport", () => {
  it("ranks the neglected, high-blast table as top risk", () => {
    const report = buildFleetReport(datasets);
    assert.equal(report.totalTables, 4);
    assert.equal(report.topRisks[0].name, "db.sales.order_items");
    assert.equal(report.ownerless, 1);
    assert.equal(report.untested, 1);
    assert.equal(report.stale, 1);
    assert.equal(report.failingTests, 1);
  });

  it("produces a deterministic town-hall narration", () => {
    const report = buildFleetReport(datasets);
    assert.ok(report.townHall.length >= 3);
    assert.equal(report.townHall[0].speaker, "Alex");
    assert.ok(report.townHall.some((s) => s.topic === "Biggest risk"));
    // Second segment flags the top risk by name.
    const risk = report.townHall.find((s) => s.topic === "Biggest risk")!;
    assert.ok(risk.text.includes("db.sales.order_items"));
  });
});
