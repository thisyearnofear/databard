/**
 * Script generator — turns schema metadata into a two-host podcast script.
 * Uses LLM when OPENAI_API_KEY is set, falls back to templates otherwise.
 *
 * Alex: enthusiastic data advocate. Morgan: skeptical quality auditor.
 */
import type { SchemaMeta, ScriptSegment } from "./types";

const SYSTEM_PROMPT = `You are a script writer for DataBard, a podcast about data catalogs. Write a conversational two-host podcast script.

HOSTS:
- Alex: Enthusiastic data advocate. Gets excited about well-designed schemas, interesting column names, and good documentation. Speaks naturally, uses analogies.
- Morgan: Skeptical quality auditor. Focuses on what could go wrong — missing tests, failing quality checks, undocumented tables. Dry humor, direct.

RULES:
- Output ONLY a JSON array of segments: [{"speaker":"Alex"|"Morgan","topic":"string","text":"string"}]
- Start with a brief intro, discuss tables (group related ones together), cover lineage, end with a summary
- Keep each segment's text to 1-3 sentences — these get synthesized to speech
- Be specific — reference actual table names, column names, test names, and quality results from the metadata
- For large schemas (15+ tables), group tables by theme/domain and summarize groups rather than discussing each individually
- Make it sound like two people actually talking, not reading a report. Interruptions, reactions, and disagreements are good
- Total script should be 12-25 segments depending on schema size
- No markdown, no code blocks — just the JSON array`;

function buildUserPrompt(schema: SchemaMeta): string {
  const tables = schema.tables.map((t) => ({
    name: t.name,
    description: t.description,
    columns: t.columns.length <= 8
      ? t.columns.map((c) => `${c.name} (${c.dataType})`)
      : `${t.columns.length} columns: ${t.columns.slice(0, 5).map((c) => `${c.name} (${c.dataType})`).join(", ")}...`,
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
    schema: schema.name,
    fqn: schema.fqn,
    description: schema.description,
    tableCount: schema.tables.length,
    tables,
    lineageEdges: schema.lineage.length,
    lineageSample: lineage,
  });
}

async function generateWithLLM(schema: SchemaMeta): Promise<ScriptSegment[]> {
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
        { role: "user", content: buildUserPrompt(schema) },
      ],
      temperature: 0.8,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");

  const parsed = JSON.parse(content);
  // Handle both { segments: [...] } and direct array
  const segments: ScriptSegment[] = Array.isArray(parsed) ? parsed : parsed.segments ?? parsed.script;

  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error("LLM returned invalid script format");
  }

  // Validate each segment has required fields
  return segments.map((s) => ({
    speaker: s.speaker === "Morgan" ? "Morgan" : "Alex",
    topic: s.topic || "discussion",
    text: String(s.text),
  }));
}

/** Template fallback — used when no LLM key is configured */
function generateTemplate(schema: SchemaMeta): ScriptSegment[] {
  const segments: ScriptSegment[] = [
    { speaker: "Alex", topic: "intro", text: `Welcome to DataBard! Today we're diving into the ${schema.name} schema — ${schema.tables.length} tables to explore. Let's get into it.` },
    { speaker: "Morgan", topic: "intro", text: `I've been looking at the quality scores and lineage for this one. There's some interesting stuff — and a few things we need to talk about.` },
  ];

  // For large schemas, summarize instead of listing each table
  const tables = schema.tables.length > 15
    ? schema.tables.slice(0, 10)
    : schema.tables;

  if (schema.tables.length > 15) {
    segments.push({
      speaker: "Alex",
      topic: "overview",
      text: `This is a big one — ${schema.tables.length} tables. Let's focus on the most interesting ones.`,
    });
  }

  for (const table of tables) {
    const colSummary = table.columns.length <= 5
      ? table.columns.map((c) => `${c.name} as ${c.dataType}`).join(", ")
      : `${table.columns.length} columns including ${table.columns.slice(0, 3).map((c) => c.name).join(", ")} and more`;

    segments.push({
      speaker: "Alex",
      topic: table.name,
      text: `Next up is ${table.name}. ${table.description ?? "No description on this one yet."} It has ${colSummary}.`,
    });

    if (table.tags.length > 0) {
      segments.push({
        speaker: "Alex",
        topic: table.name,
        text: `It's tagged with ${table.tags.join(", ")} — so the team has been classifying this one.`,
      });
    }

    const failed = table.qualityTests.filter((t) => t.status === "Failed");
    if (table.qualityTests.length === 0) {
      segments.push({ speaker: "Morgan", topic: table.name, text: `No quality tests on ${table.name}. That's a gap. We're flying blind on data integrity here.` });
    } else if (failed.length > 0) {
      segments.push({ speaker: "Morgan", topic: table.name, text: `Red flag on ${table.name}. ${failed.length} of ${table.qualityTests.length} quality tests are failing: ${failed.map((t) => t.name).join(", ")}. This needs attention.` });
    } else {
      segments.push({ speaker: "Morgan", topic: table.name, text: `Good news — all ${table.qualityTests.length} quality tests on ${table.name} are passing. Solid.` });
    }
  }

  // Lineage
  if (schema.lineage.length === 0) {
    segments.push({ speaker: "Morgan", topic: "lineage", text: `No lineage tracked for this schema yet. That's something to set up — knowing where data flows is critical.` });
  } else {
    const edges = schema.lineage.slice(0, 5);
    const desc = edges.map((e) => `${e.fromTable.split(".").pop()} feeds into ${e.toTable.split(".").pop()}`).join(". ");
    segments.push({ speaker: "Alex", topic: "lineage", text: `Let's talk data flow. We've got ${schema.lineage.length} lineage connections. ${desc}.` });
    segments.push({ speaker: "Morgan", topic: "lineage", text: `That lineage map tells you where a problem in one table cascades. Worth reviewing if any of those upstream tables have failing tests.` });
  }

  // Outro
  const totalTests = schema.tables.reduce((n, t) => n + t.qualityTests.length, 0);
  const totalFailed = schema.tables.reduce((n, t) => n + t.qualityTests.filter((q) => q.status === "Failed").length, 0);
  segments.push({ speaker: "Alex", topic: "outro", text: `That's the ${schema.name} schema — ${schema.tables.length} tables, ${totalTests} quality tests, ${schema.lineage.length} lineage edges. Thanks for listening.` });
  segments.push({
    speaker: "Morgan", topic: "outro",
    text: totalFailed > 0
      ? `And ${totalFailed} failing tests to go fix. Don't ignore those. Until next time.`
      : `Everything looking healthy on the quality front. Keep those tests running. Until next time.`,
  });

  return segments;
}

export async function generateScript(schema: SchemaMeta): Promise<ScriptSegment[]> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateWithLLM(schema);
    } catch (e) {
      console.warn("LLM script generation failed, falling back to templates:", e);
    }
  }
  return generateTemplate(schema);
}
