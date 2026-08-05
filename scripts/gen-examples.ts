/**
 * Generates the examples/ fixtures for the DataHub hackathon submission.
 *
 * These are NOT hand-fabricated — they are produced by running the real DataBard
 * pipeline (buildSchemaMeta -> analyzeSchema -> generateActionItems ->
 * planTableWriteBack) against a representative "db.sales" DataHub dataset set, so
 * a judge can inspect artifacts the actual analysis engine would emit without
 * spinning up a live DataHub instance.
 *
 * Run: npx tsx scripts/gen-examples.ts   (from repo root)
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { DataHubDatasetMeta } from "../src/lib/datahub-adapter";
import { buildSchemaMeta, planTableWriteBack } from "../src/lib/datahub-adapter";
import { analyzeSchema, generateActionItems } from "../src/lib/schema-analysis";

const OUT_DIR = join(process.cwd(), "examples");
mkdirSync(OUT_DIR, { recursive: true });

const urn = (platform: string, name: string, env = "PROD") =>
  `urn:li:dataset:(urn:li:dataPlatform:${platform},${name},${env})`;
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

const datasets: DataHubDatasetMeta[] = [
  {
    urn: urn("postgres", "db.sales.customer"),
    name: "db.sales.customer",
    platform: "postgres",
    description: "Customer master record — source of truth for customer identity.",
    columns: [
      { name: "id", dataType: "int", tags: [] },
      { name: "email", dataType: "varchar", tags: ["PII.Email"] },
      { name: "created_at", dataType: "timestamp", tags: [] },
    ],
    tags: ["primary_source"],
    glossaryTerms: ["customer_data"],
    owner: "jane.chen",
    rowCount: 1_234_567,
    freshness: daysAgo(0.5),
    qualityTests: [
      { name: "customer_id_not_null", status: "Success" },
      { name: "customer_email_unique", status: "Success" },
      { name: "freshness_daily", status: "Success" },
    ],
    upstream: [],
    downstream: [urn("postgres", "db.sales.orders")],
  },
  {
    urn: urn("postgres", "db.sales.orders"),
    name: "db.sales.orders",
    platform: "postgres",
    description: "Customer orders.",
    columns: [
      { name: "id", dataType: "int", tags: [] },
      { name: "customer_id", dataType: "int", tags: [] },
      { name: "total", dataType: "numeric", tags: [] },
      { name: "placed_at", dataType: "timestamp", tags: [] },
    ],
    tags: [],
    glossaryTerms: [],
    owner: "jane.chen",
    rowCount: 812_400,
    freshness: daysAgo(0.5),
    qualityTests: [
      { name: "orders_fk_customer", status: "Failed" },
      { name: "orders_total_positive", status: "Success" },
    ],
    upstream: [urn("postgres", "db.sales.customer")],
    downstream: [urn("postgres", "db.sales.order_items"), urn("postgres", "db.sales.payments")],
  },
  {
    urn: urn("postgres", "db.sales.order_items"),
    name: "db.sales.order_items",
    platform: "postgres",
    columns: [
      { name: "order_id", dataType: "int", tags: [] },
      { name: "product_id", dataType: "int", tags: [] },
      { name: "qty", dataType: "int", tags: [] },
    ],
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
    description: "Payment events linked to orders.",
    columns: [
      { name: "id", dataType: "int", tags: [] },
      { name: "order_id", dataType: "int", tags: [] },
      { name: "amount", dataType: "numeric", tags: [] },
      { name: "card_pan", dataType: "varchar", tags: ["PII.Sensitive"] },
    ],
    tags: [],
    glossaryTerms: [],
    owner: "kofi.amankwah",
    rowCount: 1_100_200,
    freshness: daysAgo(0.3),
    qualityTests: [{ name: "payments_amount_positive", status: "Success" }],
    upstream: [urn("postgres", "db.sales.orders")],
    downstream: [],
  },
];

const schemaFqn = "db.sales";
const schemaMeta = buildSchemaMeta(schemaFqn, datasets);
const insights = analyzeSchema(schemaMeta);
const actions = generateActionItems(insights);

// Mirrors the /api/mcp/health-check response shape.
const healthCheck = {
  ok: true,
  tool: "databard.health-check",
  schemaFqn,
  schemaName: schemaMeta.name,
  tableCount: schemaMeta.tables.length,
  health: {
    score: insights.healthScore,
    label: insights.healthLabel,
    failingTests: insights.failingTests,
    passingTests: insights.passingTests,
    totalTests: insights.totalTests,
    testCoverage: insights.testCoverage,
    docCoverage: insights.docCoverage,
    staleTables: insights.staleTables.length,
    ownerlessTables: insights.ownerlessTables.length,
    undocumentedTables: insights.undocumentedTables.length,
  },
  criticalTables: insights.criticalTables.slice(0, 8).map((ct) => ({
    name: ct.table.name,
    failingTests: ct.failingTests,
    downstreamCount: ct.downstreamCount,
    risk: ct.risk,
  })),
  staleTables: insights.staleTables.slice(0, 8).map((t) => ({ name: t.name, hoursAgo: t.hoursAgo })),
  recommendedActions: actions.slice(0, 12).map((a) => ({
    priority: a.priority,
    category: a.category,
    title: a.title,
    description: a.description,
    table: a.table,
    effort: a.effort,
  })),
};

// Mirrors the summary line the write-back route appends to dataset descriptions.
const parts = [
  `health ${insights.healthScore}/100 (${insights.healthLabel})`,
  `${schemaMeta.tables.length} tables`,
];
if (insights.failingTests > 0) parts.push(`${insights.failingTests} failing tests`);
if (insights.ownerlessTables.length > 0) parts.push(`${insights.ownerlessTables.length} ownerless`);
if (insights.untestedTables.length > 0) parts.push(`${insights.untestedTables.length} untested`);
const summaryLine = `DataBard: ${parts.join(", ")}.`;

// Mirrors the /api/mcp/writeback plan per table.
const writeBack = {
  ok: true,
  tool: "databard.write-back",
  schemaFqn,
  health: { score: insights.healthScore, label: insights.healthLabel },
  summaryLine,
  written: {
    tagsApplied: 0,
    descriptionsUpdated: schemaMeta.tables.length,
    tablesTouched: schemaMeta.tables.length,
    plan: schemaMeta.tables.map((t) => {
      const plan = planTableWriteBack(t, insights.healthLabel, summaryLine);
      return { table: t.name, tags: plan.tags, descriptionAppend: plan.descriptionAppend };
    }),
  },
};

writeFileSync(join(OUT_DIR, "schema-meta.json"), JSON.stringify(schemaMeta, null, 2));
writeFileSync(join(OUT_DIR, "health-check.json"), JSON.stringify(healthCheck, null, 2));
writeFileSync(join(OUT_DIR, "write-back.json"), JSON.stringify(writeBack, null, 2));
console.log("Wrote examples/schema-meta.json, health-check.json, write-back.json");
console.log(`health = ${insights.healthScore}/100 (${insights.healthLabel}) · tables = ${schemaMeta.tables.length}`);
