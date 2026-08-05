/**
 * Deterministic unit tests for the DataHub adapter's pure mapping layer.
 * No network — fixtures are typed as if they came from the DataHub GraphQL API.
 * Run with: node --import tsx tests/datahub-adapter.unit.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSchemaMeta,
  deriveSchemaFqn,
  parseDatasetUrn,
  planTableWriteBack,
  stripExistingMarker,
} from "../src/lib/datahub-adapter";
import type { DataHubDatasetMeta } from "../src/lib/datahub-adapter";
import type { TableMeta } from "../src/lib/types";

const customer: DataHubDatasetMeta = {
  urn: "urn:li:dataset:(urn:li:dataPlatform:postgres,db.sales.customer,PROD)",
  name: "db.sales.customer",
  platform: "postgres",
  description: "Customer master",
  columns: [
    { name: "id", dataType: "int", tags: [] },
    { name: "email", dataType: "varchar", tags: ["PII.Email"] },
    { name: "created_at", dataType: "timestamp", tags: [] },
  ],
  tags: ["active"],
  glossaryTerms: ["customer_data"],
  owner: "alice",
  rowCount: 1_234_567,
  freshness: "2026-08-01T00:00:00.000Z",
  qualityTests: [
    { name: "freshness", status: "Failed" },
    { name: "not_null_id", status: "Success" },
  ],
  upstream: [],
  downstream: ["urn:li:dataset:(urn:li:dataPlatform:postgres,db.sales.orders,PROD)"],
};

const orders: DataHubDatasetMeta = {
  urn: "urn:li:dataset:(urn:li:dataPlatform:postgres,db.sales.orders,PROD)",
  name: "db.sales.orders",
  platform: "postgres",
  columns: [
    { name: "id", dataType: "int", tags: [] },
    { name: "customer_id", dataType: "int", tags: [] },
  ],
  tags: [],
  glossaryTerms: [],
  qualityTests: [{ name: "fk_check", status: "Failed" }],
  upstream: ["urn:li:dataset:(urn:li:dataPlatform:postgres,db.sales.customer,PROD)"],
  downstream: [],
};

describe("deriveSchemaFqn", () => {
  it("strips the last segment from a dotted dataset name", () => {
    assert.equal(deriveSchemaFqn("db.sales.customer"), "db.sales");
    assert.equal(deriveSchemaFqn("db.sales.orders"), "db.sales");
  });

  it("returns null for single-segment names", () => {
    assert.equal(deriveSchemaFqn("customer"), null);
  });
});

describe("parseDatasetUrn", () => {
  it("parses a standard DataHub dataset URN", () => {
    assert.deepEqual(
      parseDatasetUrn("urn:li:dataset:(urn:li:dataPlatform:postgres,db.sales.customer,PROD)"),
      { platform: "postgres", name: "db.sales.customer", env: "PROD" }
    );
  });

  it("returns null for non-dataset URNs", () => {
    assert.equal(parseDatasetUrn("urn:li:dataPlatform:postgres"), null);
  });
});

describe("buildSchemaMeta", () => {
  it("maps datasets to tables with health-relevant fields", () => {
    const meta = buildSchemaMeta("db.sales", [customer, orders]);
    assert.equal(meta.name, "sales");
    assert.equal(meta.tables.length, 2);

    const c = meta.tables.find((t) => t.name === "db.sales.customer")!;
    assert.equal(c.owner, "alice");
    assert.deepEqual(c.piiColumns, ["email"]);
    assert.equal(c.rowCount, 1_234_567);
    assert.equal(c.qualityTests.length, 2);
    assert.equal(c.qualityTests.find((q) => q.name === "freshness")?.status, "Failed");
    assert.deepEqual(c.glossaryTerms, ["customer_data"]);

    const o = meta.tables.find((t) => t.name === "db.sales.orders")!;
    assert.equal(o.piiColumns, undefined);
  });

  it("builds readable lineage edges with URN dedupe", () => {
    const meta = buildSchemaMeta("db.sales", [customer, orders]);
    assert.deepEqual(meta.lineage, [
      { fromTable: "db.sales.customer", toTable: "db.sales.orders" },
    ]);
  });

describe("planTableWriteBack", () => {
  const neglected: TableMeta = {
    fqn: "urn:li:dataset:(urn:li:dataPlatform:postgres,db.sales.orphan,PROD)",
    name: "db.sales.orphan",
    columns: [],
    qualityTests: [],
    tags: [],
  };

  it("maps a neglected table to health + defect tags", () => {
    const plan = planTableWriteBack(neglected, "at-risk", "DataBard: health 62/100.");
    assert.deepEqual(plan.tags, [
      "urn:li:tag:DataBard_AtRisk",
      "urn:li:tag:DataBard_Ownerless",
      "urn:li:tag:DataBard_Untested",
      "urn:li:tag:DataBard_Undocumented",
    ]);
    assert.ok(plan.descriptionAppend?.includes("DataBard: health 62/100."));
  });

  it("only tags the health band for a well-governed table", () => {
    const well: TableMeta = {
      fqn: "u",
      name: "well",
      description: "x",
      owner: "bob",
      columns: [],
      qualityTests: [{ name: "t", status: "Success" }],
      tags: [],
    };
    const plan = planTableWriteBack(well, "healthy", "DataBard summary.");
    assert.deepEqual(plan.tags, ["urn:li:tag:DataBard_Healthy"]);
    assert.ok(plan.descriptionAppend);
  });

  it("drops names for preserved tables", () => {
    const plan = planTableWriteBack(neglected, "critical", undefined);
    assert.equal(plan.descriptionAppend, undefined);
  });
});

describe("stripExistingMarker", () => {
  it("removes a previously appended marker block", () => {
    const d = "Customer master\n\n— DataBard AI analyst: DataBard: health 62/100.";
    assert.equal(stripExistingMarker(d), "Customer master");
  });

  it("returns empty for empty / null descriptions", () => {
    assert.equal(stripExistingMarker(null), "");
    assert.equal(stripExistingMarker(""), "");
  });

  it("leaves non-marker descriptions untouched", () => {
    assert.equal(stripExistingMarker("Just a description."), "Just a description.");
  });
});


  it("handles an empty dataset list", () => {
    const meta = buildSchemaMeta("db.empty", []);
    assert.equal(meta.tables.length, 0);
    assert.deepEqual(meta.lineage, []);
  });
});
