import type { SchemaMeta, ResearchCitation } from "./types";
import type { ActionItem, SchemaInsights } from "./schema-analysis";
import { generateActionItems } from "./schema-analysis";
import type { ResearchEvidence, ResearchFocus, ResearchPlanStep, ResearchTrail } from "./types";

function normalizeQuestion(question?: string): string {
  const trimmed = question?.trim();
  return trimmed ? trimmed : "What should we investigate first?";
}

function detectFocus(question: string): ResearchFocus {
  const text = question.toLowerCase();
  if (/(fresh|stale|lag|late|updated|sync)/.test(text)) return "freshness";
  if (/(lineage|upstream|downstream|cascade|dependency|flow)/.test(text)) return "lineage";
  if (/(coverage|untested|missing tests|blind)/.test(text)) return "coverage";
  if (/(pii|governance|access|privacy|owner|ownership|doc|document)/.test(text)) return "governance";
  if (/(coverage|test|failing|quality|break|risk|health)/.test(text)) return "quality";
  return "overview";
}

function buildEvidence(insights: SchemaInsights): ResearchEvidence[] {
  const evidence: ResearchEvidence[] = [];
  let idx = 1;

  const critical = insights.criticalTables[0];
  if (critical) {
    const citations: ResearchCitation[] = [
      {
        source: "quality-test",
        reference: critical.table.qualityTests.filter((test) => test.status === "Failed").map((test) => test.name).join(", ") || "failed tests",
        detail: `${critical.failingTests} failing test${critical.failingTests === 1 ? "" : "s"}`,
      },
    ];
    if (critical.downstreamCount > 0) {
      citations.push({ source: "lineage", reference: `${critical.downstreamCount} downstream dependents`, detail: `Downstream blast radius for ${critical.table.name}` });
    }
    evidence.push({
      id: `e-${idx++}`,
      label: `${critical.table.name} risk`,
      detail: `${critical.failingTests} failing test${critical.failingTests === 1 ? "" : "s"} and ${critical.downstreamCount} downstream dependents`,
      sourceType: "test",
      table: critical.table.name,
      citations,
    });
  }

  if (insights.untestedTables.length > 0) {
    const names = insights.untestedTables.slice(0, 5).join(", ");
    evidence.push({
      id: `e-${idx++}`,
      label: "Coverage gap",
      detail: `${insights.untestedTables.length} table${insights.untestedTables.length === 1 ? "" : "s"} have no tests`,
      sourceType: "coverage",
      table: insights.untestedTables[0],
      citations: [{ source: "coverage", reference: names || "untested tables", detail: "Tables with zero quality checks" }],
    });
  }

  if (insights.ownerlessTables.length > 0) {
    const names = insights.ownerlessTables.slice(0, 5).join(", ");
    evidence.push({
      id: `e-${idx++}`,
      label: "Ownership gap",
      detail: `${insights.ownerlessTables.length} table${insights.ownerlessTables.length === 1 ? "" : "s"} have no owner assigned`,
      sourceType: "ownership",
      table: insights.ownerlessTables[0],
      citations: [{ source: "owner", reference: names || "ownerless tables", detail: "No responsible owner recorded" }],
    });
  }

  if (insights.piiTables.length > 0) {
    const pii = insights.piiTables[0];
    const columns = pii.columns.join(", ");
    evidence.push({
      id: `e-${idx++}`,
      label: "PII exposure",
      detail: `${pii.name} has PII columns: ${pii.columns.join(", ")}`,
      sourceType: "governance",
      table: pii.name,
      citations: [{ source: "column-tag", reference: columns, detail: `PII-classified columns in ${pii.name}` }],
    });
  }

  if (insights.staleTables.length > 0) {
    const stale = insights.staleTables[0];
    evidence.push({
      id: `e-${idx++}`,
      label: "Freshness issue",
      detail: `${stale.name} last updated ${stale.hoursAgo}h ago`,
      sourceType: "freshness",
      table: stale.name,
      citations: [{ source: "freshness-timestamp", reference: stale.freshness, detail: `Last updated ${stale.hoursAgo} hours ago` }],
    });
  }

  if (insights.lineageHotspots.length > 0) {
    const hotspot = insights.lineageHotspots[0];
    evidence.push({
      id: `e-${idx++}`,
      label: "Lineage hotspot",
      detail: `${hotspot.name} participates in ${hotspot.connections} lineage connections`,
      sourceType: "lineage",
      table: hotspot.name,
      citations: [{ source: "lineage", reference: hotspot.name, detail: `${hotspot.connections} lineage connections in the schema graph` }],
    });
  }

  return evidence;
}

function buildPlan(focus: ResearchFocus, evidence: ResearchEvidence[]): ResearchPlanStep[] {
  const evidenceIds = evidence.map((item) => item.id);
  const plan: ResearchPlanStep[] = [];

  plan.push({
    id: "step-1",
    title: "Establish the baseline",
    intent: "Measure overall health, coverage, and whether the catalog is stable enough to trust.",
    evidenceIds: evidenceIds.slice(0, 2),
  });

  if (focus === "quality" || focus === "coverage" || focus === "overview") {
    plan.push({
      id: "step-2",
      title: "Find the highest-risk tables",
      intent: "Rank failing or untested tables by downstream impact so the answer focuses on what can break the most.",
      evidenceIds: evidenceIds.filter((id) => id.startsWith("e-1") || id.startsWith("e-2")),
    });
  }

  if (focus === "governance" || focus === "overview") {
    plan.push({
      id: "step-3",
      title: "Check ownership and PII", 
      intent: "See who owns the risky data and whether sensitive columns need policy review.",
      evidenceIds: evidenceIds.filter((id) => id.startsWith("e-3") || id.startsWith("e-4")),
    });
  }

  if (focus === "freshness" || focus === "lineage" || focus === "overview") {
    plan.push({
      id: "step-4",
      title: "Trace propagation risk",
      intent: "Check freshness and lineage so stale or upstream failures do not get mistaken for clean data.",
      evidenceIds: evidenceIds.filter((id) => id.startsWith("e-5") || id.startsWith("e-6")),
    });
  }

  plan.push({
    id: "step-5",
    title: "Turn it into action",
    intent: "Translate the findings into the smallest set of fixes the team can act on now.",
    evidenceIds: evidenceIds.slice(0, 3),
  });

  return plan.filter((step) => step.evidenceIds.length > 0);
}

function summarize(schemaName: string, question: string, insights: SchemaInsights, focus: ResearchFocus): string {
  if (focus === "freshness" && insights.staleTables.length > 0) {
    const stale = insights.staleTables[0];
    return `${stale.name} is the clearest freshness issue, but the broader answer is that the schema needs a more reliable update signal.`;
  }

  if (focus === "governance" && insights.piiTables.length > 0) {
    const pii = insights.piiTables[0];
    return `${pii.name} is the main governance hotspot because it contains sensitive columns that need access and retention checks.`;
  }

  if ((focus === "quality" || focus === "coverage") && insights.criticalTables.length > 0) {
    const critical = insights.criticalTables[0];
    return `${critical.table.name} is the biggest operational risk because it has failing tests and downstream impact.`;
  }

  if (insights.criticalTables.length > 0) {
    const critical = insights.criticalTables[0];
    return `${critical.table.name} is the main risk signal, and the rest of the answer explains why it matters and what to fix first.`;
  }

  return `${schemaName} can answer ${question} from the catalog itself: the schema is mostly healthy, but the biggest opportunities are around coverage, ownership, and freshness.`;
}

function convertActions(actions: ActionItem[]) {
  return actions.slice(0, 4).map((action) => ({
    title: action.title,
    priority: action.priority,
    category: action.category,
    table: action.table,
  }));
}

export function buildResearchTrail(schema: SchemaMeta, insights: SchemaInsights, researchQuestion?: string): ResearchTrail {
  const question = normalizeQuestion(researchQuestion);
  const focus = detectFocus(question);
  const evidence = buildEvidence(insights);
  const plan = buildPlan(focus, evidence);
  const actions = generateActionItems(insights);

  return {
    question,
    focus,
    summary: summarize(schema.name, question, insights, focus),
    plan,
    evidence,
    recommendedActions: convertActions(actions),
  };
}
