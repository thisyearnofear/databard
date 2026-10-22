/**
 * Beam audit lab — server-side pipeline for /labs/beam-audit.
 *
 * Stages:
 *   1. PARSE  — custom DDL: Beam extracts a strict SchemaMeta JSON (agentic
 *               structured output). Fixtures load instantly from the demo set.
 *   2. SCORE  — the production analyzeSchema rubric (deterministic, no LLM).
 *   3. NARRATE — the production script-generator prompts; Beam's reasoning
 *               stream is surfaced alongside the content.
 *
 * Free-tier hygiene: Reflection's free daily allowance caps everything, so
 * results are cached in-process and generation is quota-guarded (global/day
 * + per-IP/day, resetting 00:00 UTC to match Reflection's reset). Exhaustion
 * is reported honestly as a `quota` event — never faked, never retried.
 */
import crypto from "crypto";
import { analyzeSchema, type SchemaInsights } from "./schema-analysis";
import { SYSTEM_PROMPT, EXECUTIVE_SUMMARY_PROMPT, buildUserPrompt } from "./script-generator";
import { beamBudget, parseJsonFromText, type ChatInput } from "./llm-providers";
import { getDemoSchema } from "./market/demo-fixtures";
import type { SchemaMeta, ScriptSegment } from "./types";

const BASE = (process.env.REFLECTION_BASE_URL || "https://api.reflection.ai/openai/v1").replace(/\/+$/, "");
const MODEL = process.env.LOOP_REFLECTION_MODEL || "Beam-1.0-501B-A23B";

export type BeamAuditFormat = "podcast" | "executive-summary";

export interface BeamAuditRequest {
  source: "web3" | "ecommerce" | "custom";
  ddl?: string;
  question?: string;
  format: BeamAuditFormat;
}

export type BeamAuditEvent =
  | { type: "stage"; stage: "parse" | "score" | "narrate"; state: "start" | "done"; note?: string }
  | { type: "reasoning"; delta: string }
  | { type: "content"; delta: string }
  | { type: "schema"; schema: unknown }
  | { type: "insights"; insights: SchemaInsights; schemaName: string; tableCount: number }
  | { type: "segments"; segments: ScriptSegment[] }
  | { type: "shapeFailure"; raw: string }
  | { type: "stats"; usage: Usage | null; elapsedMs: number; cached: boolean; reasoningChars: number }
  | { type: "error"; message: string }
  | { type: "quota"; message: string };

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  completion_tokens_details?: { reasoning_tokens?: number };
}

export function isBeamAuditConfigured(): boolean {
  return Boolean(process.env.REFLECTION_API_KEY);
}

// ---- quota guard (mirrors the Gradio Space's free-tier hygiene) ----

const DAILY_GLOBAL_CAP = 280; // comfortably under Reflection's 1M output-token/day allowance
const DAILY_IP_CAP = 8;

const quota = { day: "", global: 0, ips: new Map<string, number>() };

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function takeQuota(ip: string): { ok: boolean; reason?: string } {
  const day = utcDay();
  if (quota.day !== day) {
    quota.day = day;
    quota.global = 0;
    quota.ips.clear();
  }
  if (quota.global >= DAILY_GLOBAL_CAP) {
    return { ok: false, reason: "The lab's free daily allowance is used up. It resets at 00:00 UTC — the benchmark report and dataset stay live meanwhile." };
  }
  if ((quota.ips.get(ip) ?? 0) >= DAILY_IP_CAP) {
    return { ok: false, reason: "You've hit today's per-visitor allowance. The featured datasets replay from cache — try one of those." };
  }
  quota.global += 1;
  quota.ips.set(ip, (quota.ips.get(ip) ?? 0) + 1);
  return { ok: true };
}

// ---- result cache ----

interface CachedResult {
  schema: SchemaMeta;
  schemaName: string;
  insights: SchemaInsights;
  segments: ScriptSegment[] | null;
  shapeFailureRaw?: string;
  usage: Usage | null;
  elapsedMs: number;
  reasoningChars: number;
}

const cache = new Map<string, CachedResult>();

export function auditCacheKey(req: BeamAuditRequest): string {
  const basis = req.source === "custom"
    ? crypto.createHash("sha1").update(req.ddl ?? "").digest("hex").slice(0, 16)
    : req.source;
  return `${basis}|${req.format}|${(req.question ?? "").trim().toLowerCase().slice(0, 120)}`;
}

export function getCachedAudit(key: string): CachedResult | undefined {
  return cache.get(key);
}

export function setCachedAudit(key: string, value: CachedResult): void {
  if (cache.size > 400) cache.clear(); // crude but bounded
  cache.set(key, value);
}

// ---- Beam streaming client ----

const DDL_PARSE_SYSTEM = `You are DataBard's schema ingestion stage. Convert the user's DDL, CSV headers, or free-text table listing into ONE strict JSON object describing the schema. Do not invent tests, owners, row counts, or descriptions that are not present or directly implied.

Output schema (JSON only, no prose, no code fences):
{
  "name": "<short schema name>",
  "fqn": "<name or catalog.name>",
  "description": "<one sentence or null>",
  "tables": [
    {
      "name": "...",
      "description": "<from COMMENT clauses or obvious-from-name, else null>",
      "owner": null,
      "rowCount": null,
      "freshness": null,
      "piiColumns": ["<columns that look like personal data: email, phone, name, ssn, address, dob, ip_address, ...>"],
      "glossaryTerms": [],
      "columns": [{"name": "...", "dataType": "..."}],
      "tags": [],
      "qualityTests": []
    }
  ],
  "lineage": [{"fromTable": "<schema.table>", "toTable": "<schema.table>"}]
}

Lineage rules: infer an edge parent -> child when a column is named like <parent>_id and a matching table exists. DDL carries no quality tests — leave qualityTests empty; that absence is a real finding, not something to fix up.`;

interface StreamResult {
  text: string;
  reasoningChars: number;
  usage: Usage | null;
}

/** Stream a Beam chat call, invoking callbacks per delta. Throws Error with an honest message. */
async function beamStream(
  system: string,
  user: string,
  input: Partial<ChatInput>,
  cb: { onReasoning?: (delta: string) => void; onContent?: (delta: string) => void },
  signal?: AbortSignal
): Promise<StreamResult> {
  const apiKey = process.env.REFLECTION_API_KEY;
  if (!apiKey) throw new Error("REFLECTION_API_KEY is not configured on this deployment.");
  const budgeted = beamBudget({ system, user, maxTokens: input.maxTokens ?? 8000, ...input } as ChatInput);

  for (const jsonMode of input.json ? [true, false] : [false]) {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: budgeted.maxTokens,
        temperature: budgeted.temperature ?? 0.4,
        stream: true,
        stream_options: { include_usage: true },
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (jsonMode && /response_format/i.test(body)) continue; // retry without response_format
      throw new Error(`Beam API ${res.status}: ${body.slice(0, 200)}`);
    }
    if (!res.body) throw new Error("Beam API returned no stream body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const content: string[] = [];
    let reasoningChars = 0;
    let usage: Usage | null = null;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload);
          if (chunk.usage) usage = chunk.usage as Usage;
          for (const choice of chunk.choices ?? []) {
            const delta = choice.delta ?? {};
            if (delta.reasoning_content) {
              reasoningChars += delta.reasoning_content.length;
              cb.onReasoning?.(delta.reasoning_content);
            }
            if (delta.content) {
              content.push(delta.content);
              cb.onContent?.(delta.content);
            }
          }
        } catch {
          /* partial line — ignore */
        }
      }
    }
    const text = content.join("").trim();
    if (!text) throw new Error("Beam returned no visible content (reasoning consumed the budget).");
    return { text, reasoningChars, usage };
  }
  throw new Error("Beam API rejected the request.");
}

// ---- pipeline stages ----

export async function loadFixtureSchema(source: "web3" | "ecommerce"): Promise<{ schema: SchemaMeta; label: string; audio: string | null }> {
  const schema = await getDemoSchema(source);
  const label = source === "web3" ? "Uniswap V3 subgraph" : "Acme e-commerce warehouse";
  const audio = source === "web3" ? "/demo-episode-dune.mp3" : "/demo-episode.mp3";
  return { schema, label, audio };
}

export async function parseDdlWithBeam(
  ddl: string,
  cb: { onReasoning?: (d: string) => void; onContent?: (d: string) => void },
  signal?: AbortSignal
): Promise<{ schema: SchemaMeta; result: StreamResult }> {
  const { text, reasoningChars, usage } = await beamStream(
    DDL_PARSE_SYSTEM,
    `Extract the schema from this:\n\n${ddl}`,
    { maxTokens: 8000, temperature: 0.1, json: true, timeoutMs: 120_000 },
    cb,
    signal
  );
  const parsed = parseJsonFromText(text) as SchemaMeta;
  if (!parsed || !Array.isArray(parsed.tables) || parsed.tables.length === 0) {
    throw new Error("Beam found no tables in that input — try CREATE TABLE statements or a CSV header row.");
  }
  if (!parsed.name) parsed.name = "your schema";
  if (!parsed.fqn) parsed.fqn = parsed.name;
  if (!Array.isArray(parsed.lineage)) parsed.lineage = [];
  return { schema: parsed, result: { text, reasoningChars, usage } };
}

export function narrationPrompts(
  schema: SchemaMeta,
  insights: SchemaInsights,
  format: BeamAuditFormat,
  question?: string
): { system: string; user: string } {
  return {
    system: format === "executive-summary" ? EXECUTIVE_SUMMARY_PROMPT : SYSTEM_PROMPT,
    user: buildUserPrompt(schema, insights, {
      researchQuestion: question?.trim() || undefined,
      format,
    }),
  };
}

export async function narrateWithBeam(
  schema: SchemaMeta,
  insights: SchemaInsights,
  format: BeamAuditFormat,
  question: string | undefined,
  cb: { onReasoning?: (d: string) => void; onContent?: (d: string) => void },
  signal?: AbortSignal
): Promise<{ segments: ScriptSegment[] | null; shapeFailureRaw?: string; result: StreamResult }> {
  const { system, user } = narrationPrompts(schema, insights, format, question);
  const { text, reasoningChars, usage } = await beamStream(
    system,
    user,
    { maxTokens: 8000, temperature: 0.8, json: true, timeoutMs: 180_000 },
    cb,
    signal
  );
  try {
    const parsed = parseJsonFromText(text) as ScriptSegment[] | { segments?: ScriptSegment[]; script?: ScriptSegment[] };
    const rawSegments = Array.isArray(parsed) ? parsed : parsed?.segments ?? parsed?.script;
    if (!Array.isArray(rawSegments) || rawSegments.length === 0) throw new Error("not a segment array");
    const segments = rawSegments.map((s) => ({
      speaker: s?.speaker === "Morgan" ? ("Morgan" as const) : ("Alex" as const),
      topic: s?.topic || "discussion",
      text: String(s?.text ?? ""),
    }));
    return { segments, result: { text, reasoningChars, usage } };
  } catch {
    return { segments: null, shapeFailureRaw: text.slice(0, 4000), result: { text, reasoningChars, usage } };
  }
}

export { DDL_PARSE_SYSTEM };
