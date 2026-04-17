/**
 * Script generator — turns schema metadata into a two-host podcast script.
 * Alex: enthusiastic data advocate. Morgan: skeptical quality auditor.
 */
import type { SchemaMeta, TableMeta, ScriptSegment } from "./types";

function intro(schema: SchemaMeta): ScriptSegment[] {
  return [
    { speaker: "Alex", topic: "intro", text: `Welcome to DataBard! Today we're diving into the ${schema.name} schema — ${schema.tables.length} tables to explore. Let's get into it.` },
    { speaker: "Morgan", topic: "intro", text: `I've been looking at the quality scores and lineage for this one. There's some interesting stuff — and a few things we need to talk about.` },
  ];
}

function tableDiscussion(table: TableMeta): ScriptSegment[] {
  const segments: ScriptSegment[] = [];
  const colSummary = table.columns.length <= 5
    ? table.columns.map((c) => `${c.name} as ${c.dataType}`).join(", ")
    : `${table.columns.length} columns including ${table.columns.slice(0, 3).map((c) => c.name).join(", ")} and more`;

  segments.push({
    speaker: "Alex",
    topic: table.name,
    text: `Next up is ${table.name}. ${table.description ?? "No description on this one yet."} It has ${colSummary}.`,
  });

  // Tags
  if (table.tags.length > 0) {
    segments.push({
      speaker: "Alex",
      topic: table.name,
      text: `It's tagged with ${table.tags.join(", ")} — so the team has been classifying this one.`,
    });
  }

  // Quality
  const failed = table.qualityTests.filter((t) => t.status === "Failed");
  const passed = table.qualityTests.filter((t) => t.status === "Success");

  if (table.qualityTests.length === 0) {
    segments.push({
      speaker: "Morgan",
      topic: table.name,
      text: `No quality tests on ${table.name}. That's a gap. We're flying blind on data integrity here.`,
    });
  } else if (failed.length > 0) {
    segments.push({
      speaker: "Morgan",
      topic: table.name,
      text: `Red flag on ${table.name}. ${failed.length} of ${table.qualityTests.length} quality tests are failing: ${failed.map((t) => t.name).join(", ")}. ${passed.length} passing. This needs attention.`,
    });
  } else {
    segments.push({
      speaker: "Morgan",
      topic: table.name,
      text: `Good news — all ${table.qualityTests.length} quality tests on ${table.name} are passing. Solid.`,
    });
  }

  return segments;
}

function lineageSection(schema: SchemaMeta): ScriptSegment[] {
  if (schema.lineage.length === 0) {
    return [{ speaker: "Morgan", topic: "lineage", text: `No lineage tracked for this schema yet. That's something to set up — knowing where data flows is critical.` }];
  }

  const edges = schema.lineage.slice(0, 5);
  const desc = edges.map((e) => `${e.fromTable.split(".").pop()} feeds into ${e.toTable.split(".").pop()}`).join(". ");

  return [
    { speaker: "Alex", topic: "lineage", text: `Let's talk data flow. We've got ${schema.lineage.length} lineage connections. ${desc}.` },
    { speaker: "Morgan", topic: "lineage", text: `That lineage map tells you where a problem in one table cascades. Worth reviewing if any of those upstream tables have failing tests.` },
  ];
}

function outro(schema: SchemaMeta): ScriptSegment[] {
  const totalTests = schema.tables.reduce((n, t) => n + t.qualityTests.length, 0);
  const totalFailed = schema.tables.reduce((n, t) => n + t.qualityTests.filter((q) => q.status === "Failed").length, 0);

  return [
    { speaker: "Alex", topic: "outro", text: `That's the ${schema.name} schema — ${schema.tables.length} tables, ${totalTests} quality tests, ${schema.lineage.length} lineage edges. Thanks for listening.` },
    { speaker: "Morgan", topic: "outro", text: totalFailed > 0
      ? `And ${totalFailed} failing tests to go fix. Don't ignore those. Until next time.`
      : `Everything looking healthy on the quality front. Keep those tests running. Until next time.` },
  ];
}

export function generateScript(schema: SchemaMeta): ScriptSegment[] {
  return [
    ...intro(schema),
    ...schema.tables.flatMap(tableDiscussion),
    ...lineageSection(schema),
    ...outro(schema),
  ];
}
