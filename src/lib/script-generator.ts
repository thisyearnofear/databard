/**
 * Script generator — turns schema metadata into a two-host podcast script.
 * Uses LLM when OPENAI_API_KEY is set, falls back to templates otherwise.
 *
 * Alex: enthusiastic data advocate. Morgan: skeptical quality auditor.
 */
import type { SchemaMeta, ScriptSegment } from "./types";
import type { ResearchTrail } from "./types";
import { analyzeSchema, type SchemaInsights } from "./schema-analysis";
import { scriptCache } from "./store";

interface ScriptContext {
  researchQuestion?: string;
  researchTrail?: ResearchTrail;
}

/** Simple hash for cache keys */
function hashSchema(schema: SchemaMeta, context?: ScriptContext): string {
  const sig = `${schema.fqn}:${schema.tables.length}:${schema.tables.map((t) =>
    `${t.name}:${t.qualityTests.length}:${t.qualityTests.filter((q) => q.status === "Failed").length}:${t.columns.length}`
  ).join(",")}`;
  const questionSig = context?.researchQuestion?.trim() ? `|q:${context.researchQuestion.trim().toLowerCase()}` : "";
  const trailSig = context?.researchTrail?.summary ? `|r:${context.researchTrail.summary.toLowerCase()}` : "";
  let h = 0;
  const value = `${sig}${questionSig}${trailSig}`;
  for (let i = 0; i < value.length; i++) h = ((h << 5) - h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const SYSTEM_PROMPT = `You are a script writer for DataBard, a question-first analytics experience that turns data catalogs into a podcast-style answer. Write a conversational two-host podcast script.

HOSTS:
- Alex: Enthusiastic data advocate. Gets excited about well-designed schemas, interesting column names, and good documentation. Speaks naturally, uses analogies.
- Morgan: Skeptical quality auditor. Focuses on what could go wrong — missing tests, failing quality checks, undocumented tables. Dry humor, direct.

RULES:
- Output ONLY a JSON array of segments: [{"speaker":"Alex"|"Morgan","topic":"string","text":"string"}]
- Start with a brief intro that mentions the health score and overall vibe
- Lead with the most critical/interesting findings — don't bury the lede
- Discuss critical tables first (failing tests + many downstream dependents = cascading risk)
- Call out documentation and test coverage gaps as patterns, not per-table
- For lineage hotspots, explain WHY they matter ("if this table breaks, 8 others go down")
- If PII columns exist, Morgan MUST flag them and discuss governance implications
- If tables have owners, mention who's responsible for critical issues
- If tables are stale (not updated recently), flag freshness concerns
- If glossary terms exist, Alex should highlight the business context they provide
- For large schemas (15+ tables), group by theme/domain and summarize
- Keep each segment's text to 1-3 sentences — these get synthesized to speech
- Make it sound like two people actually talking. Interruptions, reactions, disagreements are good
- Total script should be 12-25 segments depending on schema size
- If a research question is provided, answer it directly and keep it in view throughout the script
- No markdown, no code blocks — just the JSON array`;

function buildUserPrompt(schema: SchemaMeta, insights: SchemaInsights, context?: ScriptContext): string {
  const tables = schema.tables.map((t) => ({
    name: t.name,
    description: t.description,
    owner: t.owner,
    rowCount: t.rowCount,
    freshness: t.freshness,
    piiColumns: t.piiColumns,
    glossaryTerms: t.glossaryTerms,
    columnCount: t.columns.length,
    columnSample: t.columns.slice(0, 5).map((c) => `${c.name} (${c.dataType})`),
    tags: t.tags,
    tests: {
      total: t.qualityTests.length,
      failing: t.qualityTests.filter((q) => q.status === "Failed").map((q) => q.name),
      passing: t.qualityTests.filter((q) => q.status === "Success").length,
    },
  }));

  const lineage = schema.lineage.slice(0, 20).map((e) => ({
    from: e.fromTable.split(".").pop(),
    to: e.toTable.split(".").pop(),
  }));

  return JSON.stringify({
    researchQuestion: context?.researchQuestion?.trim() || undefined,
    researchTrail: context?.researchTrail,
    schema: schema.name,
    fqn: schema.fqn,
    description: schema.description,
    tableCount: schema.tables.length,
    tables,
    lineageEdges: schema.lineage.length,
    lineageSample: lineage,
    insights: {
      healthScore: insights.healthScore,
      healthLabel: insights.healthLabel,
      testCoverage: `${insights.testCoverage}%`,
      docCoverage: `${insights.docCoverage}%`,
      failingTests: insights.failingTests,
      untestedTables: insights.untestedTables,
      undocumentedTables: insights.undocumentedTables,
      criticalTables: insights.criticalTables.map((c) => ({
        name: c.table.name, failingTests: c.failingTests,
        downstreamDependents: c.downstreamCount, risk: c.risk,
      })),
      lineageHotspots: insights.lineageHotspots,
      externalDeps: insights.externalDeps.length,
      owners: insights.owners,
      ownerlessTables: insights.ownerlessTables,
      piiTables: insights.piiTables,
      glossaryTerms: insights.glossaryTerms,
      staleTables: insights.staleTables,
      largestTables: insights.largestTables,
    },
  });
}

async function generateWithLLM(schema: SchemaMeta, insights: SchemaInsights, context?: ScriptContext): Promise<ScriptSegment[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(schema, insights, context) },
      ],
      temperature: 0.8,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) throw new Error(`LLM API error: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");

  const parsed = JSON.parse(content);
  const segments: ScriptSegment[] = Array.isArray(parsed) ? parsed : parsed.segments ?? parsed.script;

  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error("LLM returned invalid script format");
  }

  return segments.map((s) => ({
    speaker: s.speaker === "Morgan" ? "Morgan" : "Alex",
    topic: s.topic || "discussion",
    text: String(s.text),
  }));
}

/** Template fallback — structured around insights, not raw table list */
function generateTemplate(schema: SchemaMeta, insights: SchemaInsights, context?: ScriptContext): ScriptSegment[] {
  const segments: ScriptSegment[] = [];

  const questionLead = context?.researchQuestion?.trim()
    ? ` We started with the question: ${context.researchQuestion.trim()}`
    : "";

  // Intro with health score
  segments.push({
    speaker: "Alex", topic: "intro",
    text: `Welcome to DataBard! Today we're looking at the ${schema.name} schema — ${schema.tables.length} tables, health score ${insights.healthScore} out of 100.${questionLead} Let's dig in.`,
  });
  if (context?.researchTrail) {
    segments.push({
      speaker: "Morgan", topic: "research",
      text: `We answered this in ${context.researchTrail.plan.length} steps and found ${context.researchTrail.evidence.length} concrete evidence points.`,
    });
    segments.push({
      speaker: "Alex", topic: "research",
      text: context.researchTrail.summary,
    });
  }
  segments.push({
    speaker: "Morgan", topic: "intro",
    text: insights.healthLabel === "critical"
      ? `This one needs work. ${insights.failingTests} failing tests and only ${insights.testCoverage}% test coverage. Let's talk about what's broken.`
      : insights.healthLabel === "at-risk"
      ? `Mixed bag here. ${insights.testCoverage}% test coverage, ${insights.docCoverage}% documented. Some gaps to address.`
      : `Looking pretty solid — ${insights.testCoverage}% test coverage, ${insights.passingTests} tests all green. Let's see what's under the hood.`,
  });

  // Critical tables first (most interesting for listeners)
  if (insights.criticalTables.length > 0) {
    segments.push({
      speaker: "Morgan", topic: "critical",
      text: `Let's start with the fires. ${insights.criticalTables.length === 1 ? "There's one table" : `There are ${insights.criticalTables.length} tables`} I'm worried about.`,
    });

    for (const ct of insights.criticalTables.slice(0, 3)) {
      const t = ct.table;
      segments.push({
        speaker: "Morgan", topic: t.name,
        text: ct.risk === "critical"
          ? `${t.name} is critical — ${ct.failingTests} failing tests and ${ct.downstreamCount} tables depend on it. If this breaks, it cascades.`
          : `${t.name} has ${ct.failingTests} failing test${ct.failingTests > 1 ? "s" : ""}${ct.downstreamCount > 0 ? ` and ${ct.downstreamCount} downstream dependents` : ""}. Needs attention.`,
      });
      if (t.description) {
        segments.push({ speaker: "Alex", topic: t.name, text: `For context, ${t.name} is described as: ${t.description}` });
      }
    }
  }

  // Coverage gaps as patterns
  if (insights.untestedTables.length > 0) {
    const pct = 100 - insights.testCoverage;
    segments.push({
      speaker: "Morgan", topic: "coverage",
      text: insights.untestedTables.length <= 3
        ? `${insights.untestedTables.join(", ")} — zero quality tests. That's ${pct}% of the schema flying blind.`
        : `${insights.untestedTables.length} tables have no tests at all — that's ${pct}% of the schema with no quality checks.`,
    });
  }

  if (insights.undocumentedTables.length > 0 && insights.docCoverage < 80) {
    segments.push({
      speaker: "Alex", topic: "documentation",
      text: insights.undocumentedTables.length <= 3
        ? `Documentation gap: ${insights.undocumentedTables.join(", ")} have no description. Only ${insights.docCoverage}% coverage.`
        : `Only ${insights.docCoverage}% of tables are documented. ${insights.undocumentedTables.length} tables have no description at all.`,
    });
  }

  // Highlight a few well-documented/healthy tables (balance the negativity)
  const healthyTables = schema.tables.filter((t) =>
    t.qualityTests.length > 0 &&
    t.qualityTests.every((q) => q.status === "Success") &&
    t.description
  );
  if (healthyTables.length > 0) {
    const names = healthyTables.slice(0, 3).map((t) => t.name).join(", ");
    segments.push({
      speaker: "Alex", topic: "highlights",
      text: `On the bright side — ${names} ${healthyTables.length === 1 ? "is" : "are"} well-documented with all tests passing. That's the standard to aim for.`,
    });
  }

  // PII / Governance
  if (insights.piiTables.length > 0) {
    const piiSummary = insights.piiTables.map((t) => `${t.name} (${t.columns.join(", ")})`).join("; ");
    segments.push({
      speaker: "Morgan", topic: "governance",
      text: `Governance flag: ${insights.piiTables.length} table${insights.piiTables.length > 1 ? "s have" : " has"} PII-classified columns — ${piiSummary}. Make sure access policies and retention rules cover these.`,
    });
  }

  // Owners
  if (insights.owners.length > 0) {
    const ownerSummary = insights.owners.slice(0, 3).map((o) => `${o.name} owns ${o.tables.join(", ")}`).join(". ");
    segments.push({
      speaker: "Alex", topic: "ownership",
      text: `Ownership: ${ownerSummary}.${insights.ownerlessTables.length > 0 ? ` But ${insights.ownerlessTables.length} tables have no owner assigned.` : ""}`,
    });
  } else if (insights.ownerlessTables.length > 0) {
    segments.push({
      speaker: "Morgan", topic: "ownership",
      text: `No table owners assigned in this schema. When something breaks, who's responsible? That needs to be defined.`,
    });
  }

  // Freshness
  if (insights.staleTables.length > 0) {
    const stale = insights.staleTables[0];
    segments.push({
      speaker: "Morgan", topic: "freshness",
      text: `Freshness concern: ${stale.name} hasn't been updated in ${stale.hoursAgo} hours.${insights.staleTables.length > 1 ? ` ${insights.staleTables.length - 1} other tables are also stale.` : ""} Are the pipelines running?`,
    });
  }

  // Glossary terms
  if (insights.glossaryTerms.length > 0) {
    segments.push({
      speaker: "Alex", topic: "glossary",
      text: `Nice — this schema uses glossary terms: ${insights.glossaryTerms.slice(0, 5).join(", ")}. That's business context baked right into the metadata.`,
    });
  }

  // Row counts
  if (insights.largestTables.length > 0) {
    const top = insights.largestTables[0];
    const fmt = top.rowCount > 1_000_000 ? `${(top.rowCount / 1_000_000).toFixed(1)}M` : top.rowCount > 1000 ? `${(top.rowCount / 1000).toFixed(0)}K` : `${top.rowCount}`;
    segments.push({
      speaker: "Alex", topic: "scale",
      text: `Scale check: ${top.name} is the largest table at ${fmt} rows.${insights.largestTables.length > 1 ? ` Followed by ${insights.largestTables[1].name}.` : ""}`,
    });
  }

  // Lineage
  if (insights.lineageHotspots.length > 0) {
    const top = insights.lineageHotspots[0];
    segments.push({
      speaker: "Alex", topic: "lineage",
      text: `Data flow: ${schema.lineage.length} lineage connections. ${top.name} is the busiest node with ${top.connections} connections.`,
    });
    segments.push({
      speaker: "Morgan", topic: "lineage",
      text: insights.externalDeps.length > 0
        ? `${insights.externalDeps.length} dependencies cross schema boundaries. If something breaks upstream, you'll feel it here.`
        : `All lineage is internal to this schema. That's good for isolation, but make sure upstream sources are monitored.`,
    });
  } else if (schema.lineage.length === 0) {
    segments.push({
      speaker: "Morgan", topic: "lineage",
      text: `No lineage tracked. That's a blind spot — you can't trace where data flows or where failures cascade.`,
    });
  }

  // Outro
  segments.push({
    speaker: "Alex", topic: "outro",
    text: `That's the ${schema.name} schema — health score ${insights.healthScore}, ${schema.tables.length} tables, ${insights.totalTests} tests. Thanks for listening.`,
  });
  segments.push({
    speaker: "Morgan", topic: "outro",
    text: insights.failingTests > 0
      ? `Priority one: fix those ${insights.failingTests} failing tests. Priority two: get test coverage above ${insights.testCoverage}%. Until next time.`
      : insights.testCoverage < 50
      ? `No failures, but ${insights.testCoverage}% test coverage is thin. Add tests before something slips through. Until next time.`
      : `Clean bill of health. Keep those tests running and that documentation fresh. Until next time.`,
  });

  return segments;
}

export async function generateScript(schema: SchemaMeta, context?: ScriptContext): Promise<ScriptSegment[]> {
  // Check script cache — same schema content = same script
  const schemaHash = hashSchema(schema, context);
  const cacheKey = schemaHash;
  const cached = scriptCache.get<ScriptSegment[]>(cacheKey);
  if (cached) return cached;

  const insights = analyzeSchema(schema);
  let script: ScriptSegment[];

  if (process.env.OPENAI_API_KEY) {
    try {
      script = await generateWithLLM(schema, insights, context);
    } catch (e) {
      console.warn("LLM script generation failed, falling back to templates:", e);
      script = generateTemplate(schema, insights, context);
    }
  } else {
    script = generateTemplate(schema, insights, context);
  }

  scriptCache.set(cacheKey, script, 3600); // 1hr cache — regenerate picks up schema changes
  return script;
}
