/**
 * Monid adapter — runs a discovered Monid endpoint via the `monid` CLI and maps
 * the (arbitrary) result into SchemaMeta, capturing the measured per-run cost as
 * a receipt. Mirrors dune-adapter (result → SchemaMeta, cost sidecar, honest
 * degrade) and coral-adapter (execFile to a binary, never a shell).
 *
 * Monid is generic: the provider + endpoint come from `monid discover`/`inspect`
 * at runtime, so nothing here is hardcoded to one vendor.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import type { SchemaMeta, TableMeta, ColumnMeta, QualityTest, MonidConnection } from "./types";
import { metaCache } from "./store";

const execFileAsync = promisify(execFile);
const MONID_BIN = process.env.MONID_BIN || "monid";
// Must exceed the CLI's max --wait window (120s) so the CLI, not execFile, decides a run is slow.
const MONID_TIMEOUT_MS = Number(process.env.MONID_TIMEOUT_MS) || 130_000;
const MONID_MAX_BUFFER = Number(process.env.MONID_MAX_BUFFER) || 10 * 1024 * 1024; // 10 MB
const SAMPLE_CAP = 500; // rows profiled for column stats; rowCount keeps any reported total

export interface MonidRunResult {
  runId?: string;
  status?: string;
  costUsd?: number;
  rows: Record<string, unknown>[];
  hints?: unknown;
  raw: unknown;
}

/** The measured-cost receipt surfaced by /api/mcp/health-check. */
export interface MonidCostSummary {
  costUsd?: number;
  provider: string;
  endpoint: string;
  runId?: string;
  rowCount: number;
  ok: boolean;
  note?: string;
}

type MonidErrorKind =
  | "not-installed" | "no-key" | "auth" | "balance" | "rate-limit"
  | "timeout" | "bad-request" | "empty" | "exec" | "parse";

/** A Monid CLI failure classified so callers can tell a transient blip from
 *  something the user must act on (no CLI, no key, bad key, no balance). */
export class MonidCliError extends Error {
  constructor(readonly kind: MonidErrorKind, message: string, readonly costUsd?: number) {
    super(message);
    this.name = "MonidCliError";
  }
  /** Setup / auth / payment failures — retrying won't help; surface them. */
  get hard(): boolean {
    return (
      this.kind === "not-installed" || this.kind === "no-key" ||
      this.kind === "auth" || this.kind === "balance" || this.kind === "bad-request"
    );
  }
}

/** Honest, actionable messages. Report what actually happened; never guess at
 *  Monid's pricing or invent a policy. */
export function monidErrorMessage(kind: MonidErrorKind, detail?: string): string {
  switch (kind) {
    case "not-installed":
      return "The Monid CLI (`monid`) isn't installed on the server or isn't on PATH. Install it (`npm i -g @monid-ai/cli`) or set MONID_BIN to its path.";
    case "no-key":
      return "No Monid API key. Set MONID_API_KEY on the server (or run `monid keys add -k <key>`), or pass monid.apiKey in the request.";
    case "auth":
      return "Monid rejected the API key. Re-add it (`monid keys add -k <key>`) and activate it (`monid keys activate`).";
    case "balance":
      return "Monid balance is too low for this metered call. Top up, then retry (`monid balance` shows the current balance).";
    case "rate-limit":
      return "Monid rate limit reached. Wait a moment and retry.";
    case "timeout":
      return "The Monid run didn't finish within the wait window. Retry, or raise MONID_TIMEOUT_MS.";
    case "bad-request":
      return detail
        ? `Monid couldn't run this request: ${detail}`
        : "Monid rejected the inputs (schema mismatch). Run `monid inspect -p <provider> -e <endpoint>` to check required params.";
    case "empty":
      return "The Monid run succeeded but returned no rows.";
    case "parse":
      return detail ? `Couldn't read the Monid run output: ${detail}` : "Couldn't read the Monid run output.";
    case "exec":
    default:
      return detail ? `Monid run failed: ${detail}` : "Monid run failed.";
  }
}

// ── Pure helpers (unit-tested without a live key) ──────────────────────────

/** Canonical FQN for a Monid run: `monid.<provider>.<slug(endpoint)>`. */
export function deriveMonidFqn(conn: MonidConnection): string {
  const slug = String(conn.endpoint ?? "")
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `monid.${conn.provider}.${slug || "run"}`;
}

function coerceCost(v: unknown, keyHint: string): number | undefined {
  if (v == null) return undefined;
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
  else return undefined;
  if (isNaN(n)) return undefined;
  if (/micro/i.test(keyHint)) n = n / 1e6; // confirm the real field/units in Step 0
  return n;
}

/** Pull the measured cost (USD) out of a run result across common key shapes. */
export function normalizeCost(raw: unknown): number | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const COST_KEYS = ["cost", "costUsd", "cost_usd", "total_cost", "totalCost", "price", "amountCharged", "charged"];
  const holders = [r, r.data, r.result, r.run, r.usage, r.billing]
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object");
  for (const h of holders) {
    for (const k of COST_KEYS) {
      if (k in h) {
        const parsed = coerceCost(h[k], k);
        if (parsed != null) return parsed;
      }
    }
    const costObj = h.cost;
    if (costObj && typeof costObj === "object") {
      const c = costObj as Record<string, unknown>;
      const parsed = coerceCost(c.usd ?? c.USD ?? c.amount ?? c.total, "cost.usd");
      if (parsed != null) return parsed;
    }
  }
  return undefined;
}

function findHeader(holder: Record<string, unknown>): string[] | undefined {
  for (const key of ["columns", "headers", "fields", "column_names", "columnNames", "schema"]) {
    const v = holder[key];
    if (Array.isArray(v) && v.length > 0) {
      const names = v
        .map((c) => (typeof c === "string" ? c : c && typeof c === "object" ? String((c as Record<string, unknown>).name ?? (c as Record<string, unknown>).field ?? "") : ""))
        .filter(Boolean);
      if (names.length === v.length) return names;
    }
  }
  return undefined;
}

function coerceArray(arr: unknown[], header?: string[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const item of arr) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      out.push(item as Record<string, unknown>);
    } else if (Array.isArray(item)) {
      const names = header && header.length >= item.length ? header : item.map((_, i) => `column_${i}`);
      const row: Record<string, unknown> = {};
      item.forEach((v, i) => { row[names[i] ?? `column_${i}`] = v; });
      out.push(row);
    }
    // bare scalars in the array aren't row-like — dropped
  }
  return out;
}

function findFirstObjectArray(node: unknown, depth: number): unknown[] | undefined {
  if (depth <= 0 || node == null || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    const objCount = node.filter((x) => x && typeof x === "object" && !Array.isArray(x)).length;
    return objCount > 0 && objCount >= node.length * 0.5 ? node : undefined;
  }
  for (const v of Object.values(node as Record<string, unknown>)) {
    const found = findFirstObjectArray(v, depth - 1);
    if (found) return found;
  }
  return undefined;
}

const ROW_CONTAINER_KEYS = ["rows", "records", "items", "results", "entries", "hits", "data"];

/** Locate the row records across the arbitrary shapes Monid endpoints return.
 *  Returns [] for a scalar / non-tabular payload (the caller degrades honestly). */
export function extractRows(json: unknown): Record<string, unknown>[] {
  if (json == null) return [];
  if (Array.isArray(json)) return coerceArray(json, undefined).slice(0, SAMPLE_CAP);
  if (typeof json !== "object") return [];

  const root = json as Record<string, unknown>;
  const holders = [root, root.data, root.result, root.results, root.response, root.output]
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object" && !Array.isArray(h));
  for (const holder of holders) {
    for (const key of ROW_CONTAINER_KEYS) {
      const v = holder[key];
      if (Array.isArray(v)) {
        const rows = coerceArray(v, findHeader(holder));
        if (rows.length > 0) return rows.slice(0, SAMPLE_CAP);
      }
    }
  }
  const nested = findFirstObjectArray(root, 4);
  if (nested) return coerceArray(nested, undefined).slice(0, SAMPLE_CAP);
  if (Object.values(root).every((v) => v == null || ["string", "number", "boolean"].includes(typeof v))) {
    return [{ ...root }];
  }
  return [];
}

function extractReportedCount(json: unknown): number | undefined {
  if (!json || typeof json !== "object") return undefined;
  const r = json as Record<string, unknown>;
  const data = (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>;
  const holders = [r, r.data, r.result, r.results, r.metadata, data.metadata, r.pagination]
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object");
  for (const h of holders) {
    for (const k of ["row_count", "rowCount", "total_row_count", "totalRows", "total_rows", "numResults", "totalResults"]) {
      const v = h[k];
      if (typeof v === "number" && v >= 0) return v;
    }
  }
  return undefined;
}

function toEpochMs(v: unknown): number | null {
  if (typeof v === "number" && v > 1e9 && v < 1e14) return v < 1e12 ? v * 1000 : v; // seconds vs millis
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const t = Date.parse(v);
    return isNaN(t) ? null : t;
  }
  return null;
}

function isTimestampColumn(key: string, values: unknown[]): boolean {
  if (values.length === 0) return false;
  const iso = values.filter((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v as string)).length;
  const epoch = values.filter((v) => typeof v === "number" && (v as number) > 1e9 && (v as number) < 1e14).length;
  const strong = iso > values.length * 0.6 || epoch > values.length * 0.6;
  const nameHint = /(at|time|timestamp|date|created|updated)$/i.test(key);
  return strong || (nameHint && (iso > 0 || epoch > 0));
}

function inferType(key: string, values: unknown[]): string {
  if (values.length === 0) return "string";
  if (isTimestampColumn(key, values)) return "timestamp";
  const types = new Set(values.map((v) => typeof v));
  if (types.size === 1 && types.has("number")) return "number";
  if (types.size === 1 && types.has("boolean")) return "boolean";
  if (types.size === 2 && types.has("number") && types.has("string")) return "number";
  return "string";
}

/** Infer columns from result rows (typeof + date sniff), with a data-aware
 *  description so the script generator can narrate the values. */
export function inferColumns(rows: Record<string, unknown>[]): ColumnMeta[] {
  if (rows.length === 0) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); keys.push(k); }

  return keys.slice(0, 200).map((key) => {
    const values = rows.map((r) => r[key]).filter((v) => v != null);
    const dataType = inferType(key, values);
    const unique = new Set(values.map((v) => String(v)));
    const nullCount = rows.length - values.length;
    const samples = values.slice(0, 5).map((v) => String(v).slice(0, 50));
    const parts: string[] = [];
    if (samples.length > 0) parts.push(`samples: ${samples.join(", ")}`);
    if (unique.size <= 20) parts.push(`${unique.size} unique values`);
    if (nullCount > 0) parts.push(`${nullCount} nulls`);
    return { name: key, dataType, tags: [], description: parts.join("; ") || undefined };
  });
}

function extractFreshness(rows: Record<string, unknown>[], columns: ColumnMeta[]): string | undefined {
  const tsCols = columns.filter((c) => c.dataType === "timestamp").map((c) => c.name);
  if (tsCols.length === 0) return undefined;
  let max = NaN;
  for (const r of rows) for (const name of tsCols) {
    const t = toEpochMs(r[name]);
    if (t != null && (isNaN(max) || t > max)) max = t;
  }
  return isNaN(max) ? undefined : new Date(max).toISOString();
}

function sliceJson(s: string): string {
  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");
  let start: number;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);
  if (start === -1) return s.trim();
  const close = s[start] === "{" ? "}" : "]";
  const end = s.lastIndexOf(close);
  return end > start ? s.slice(start, end + 1) : s.slice(start);
}

function pickString(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const r = obj as Record<string, unknown>;
  const holders = [r, r.data, r.result, r.run].filter((h): h is Record<string, unknown> => !!h && typeof h === "object");
  for (const h of holders) for (const k of keys) {
    const v = h[k];
    if (typeof v === "string" || typeof v === "number") return String(v);
  }
  return undefined;
}

/** Parse `monid run -j` stdout into a normalized result (tolerates a log preamble). */
export function parseMonidRun(stdout: string): MonidRunResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sliceJson(stdout));
  } catch {
    throw new MonidCliError("parse", monidErrorMessage("parse", "output was not valid JSON"));
  }
  const root = parsed as Record<string, unknown> | null;
  const rows = extractRows(parsed);
  const dataHints =
    root?.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>).hints
      : undefined;
  return {
    runId: pickString(parsed, ["runId", "run_id", "id", "executionId", "execution_id"]),
    status: pickString(parsed, ["status", "state", "runStatus"]),
    costUsd: normalizeCost(parsed),
    rows,
    hints: root?.hints ?? dataHints,
    raw: parsed,
  };
}

/** Build the SchemaMeta for one Monid run: a single table (one run = one result
 *  set), always carrying ≥1 quality test + a description so the health score is
 *  meaningful and the cost receipt survives into the briefing. */
export function buildMonidSchema(conn: MonidConnection, run: MonidRunResult, execNote?: string): SchemaMeta {
  const fqn = deriveMonidFqn(conn);
  const rows = run.rows;
  const columns = inferColumns(rows);
  const reported = extractReportedCount(run.raw);
  const rowCount = reported ?? rows.length;

  const qualityTests: QualityTest[] = [
    { name: "run_succeeded", status: execNote ? "Failed" : "Success" },
    { name: "run_has_rows", status: rows.length > 0 ? "Success" : "Failed" },
  ];

  const freshness = extractFreshness(rows, columns) ?? new Date().toISOString();
  const target = `${conn.provider}${conn.endpoint}`;
  const costPart = run.costUsd != null ? `Measured cost: $${run.costUsd}.` : "Measured cost: unavailable.";
  const sampled = rows.length === SAMPLE_CAP && rowCount > rows.length ? ` (sampled ${rows.length} of ${rowCount})` : "";

  let description: string;
  if (execNote) {
    description = `Monid metered run against ${target} did not complete — ${execNote} ${costPart} No live rows were analyzed.`;
  } else if (rows.length === 0) {
    description = `Monid metered run against ${target} succeeded but returned no analyzable rows (empty or non-tabular payload). ${costPart}`;
  } else {
    description = `Monid metered run against ${target}. Returned ${rowCount} row(s)${sampled} across ${columns.length} column(s). ${costPart}`;
  }

  const table: TableMeta = {
    fqn: `${fqn}.result`,
    name: target,
    description,
    columns,
    qualityTests,
    tags: ["monid", "metered", conn.provider],
    rowCount,
    freshness,
  };

  return { fqn, name: `Monid: ${target}`, description, tables: [table], lineage: [] };
}

// ── CLI exec (mirrors coral-adapter) ───────────────────────────────────────

// Flag syntax verified against `monid run --help` (CLI 0.1.7): `-p/-e` required,
// `-i` body JSON, `--query`/`--path` take a SINGLE JSON string each (not k=v),
// `-j` JSON out, `--wait` optional timeout in seconds.
export function buildRunArgs(conn: MonidConnection): string[] {
  const args = ["run", "-p", conn.provider, "-e", conn.endpoint, "-j"];
  if (conn.wait !== false) args.push("--wait");
  if (conn.inputs && Object.keys(conn.inputs).length > 0) args.push("-i", JSON.stringify(conn.inputs));
  if (conn.query && Object.keys(conn.query).length > 0) args.push("--query", JSON.stringify(conn.query));
  if (conn.path && Object.keys(conn.path).length > 0) args.push("--path", JSON.stringify(conn.path));
  return args;
}

function classifyExecError(e: unknown): MonidCliError {
  const err = e as { code?: string | number; killed?: boolean; signal?: string; stderr?: string; stdout?: string; message?: string };
  if (err?.code === "ENOENT") return new MonidCliError("not-installed", monidErrorMessage("not-installed"));
  if (err?.killed || err?.signal === "SIGTERM") return new MonidCliError("timeout", monidErrorMessage("timeout"));
  const text = `${err?.stderr ?? ""} ${err?.stdout ?? ""} ${err?.message ?? ""}`.toLowerCase();
  if (/no active api key|no api key|api key required|not authenticated|missing.{0,12}key|no key/.test(text)) return new MonidCliError("no-key", monidErrorMessage("no-key"));
  if (/unauthorized|invalid api key|api key is expired|authentication|forbidden|\b401\b|\b403\b/.test(text)) return new MonidCliError("auth", monidErrorMessage("auth"));
  if (/insufficient|balance|payment required|\b402\b|not enough credit/.test(text)) return new MonidCliError("balance", monidErrorMessage("balance"));
  if (/rate.?limit|too many requests|\b429\b/.test(text)) return new MonidCliError("rate-limit", monidErrorMessage("rate-limit"));
  const detail = (err?.stderr || err?.message || "the monid CLI exited with an error").toString().trim().slice(0, 300);
  return new MonidCliError("exec", monidErrorMessage("exec", detail));
}

async function runMonidCli(args: string[], apiKey?: string): Promise<string> {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
  // monid CLI v0.1.x does NOT read MONID_API_KEY — it reads an active key from
  // `<XDG_CONFIG_HOME|~/.config>/monid/config.yaml` + `credentials.yaml` (mode
  // 0600, YAML, verified against the CLI source). To honour an env-provided or
  // per-request key, materialise a throwaway credential store and point
  // XDG_CONFIG_HOME at it for this one exec.
  const key = apiKey ?? process.env.MONID_API_KEY; // env-first, body override
  let tmpDir: string | undefined;
  if (key) {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "databard-monid-"));
    const monidDir = path.join(tmpDir, "monid");
    await mkdir(monidDir, { recursive: true });
    const q = (s: string) => JSON.stringify(s); // a JSON string is a valid YAML double-quoted scalar
    await writeFile(path.join(monidDir, "config.yaml"), `version: "0.1.7"\nactive_key: databard\n`);
    await writeFile(
      path.join(monidDir, "credentials.yaml"),
      `keys:\n  databard:\n    key: ${q(key)}\n    prefix: ""\n    added_at: ${q(new Date().toISOString())}\n`,
      { mode: 0o600 },
    );
    env.XDG_CONFIG_HOME = tmpDir;
  }
  try {
    const { stdout } = await execFileAsync(MONID_BIN, args, { timeout: MONID_TIMEOUT_MS, maxBuffer: MONID_MAX_BUFFER, env });
    return stdout;
  } catch (e) {
    throw classifyExecError(e);
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Cost sidecar (mirrors getDuneTableStats) ───────────────────────────────

const monidCostCache = new Map<string, MonidCostSummary>();

/** Retrieve (and consume) the measured-cost receipt for a schema FQN. */
export function getMonidCost(fqn: string): MonidCostSummary | undefined {
  const cost = monidCostCache.get(fqn);
  if (cost) monidCostCache.delete(fqn);
  return cost;
}

// ── Public adapter API ─────────────────────────────────────────────────────

/** Monid is a single-run source — return its derived FQN so the wizard can proceed. */
export function listMonidSchemas(conn: MonidConnection): string[] {
  return [deriveMonidFqn(conn)];
}

export async function fetchMonidMeta(conn: MonidConnection, schemaFqn?: string): Promise<SchemaMeta> {
  if (!conn || !conn.provider || !conn.endpoint) {
    throw new MonidCliError("bad-request", monidErrorMessage("bad-request", "provider and endpoint are required — run `monid discover` then `monid inspect` first"));
  }
  // Key the receipt by the FQN the caller used, so health-check's getMonidCost(schemaFqn) finds it.
  const sidecarKey = schemaFqn ?? deriveMonidFqn(conn);
  const cacheKey = `monid:run:${createHash("sha256").update(JSON.stringify(conn)).digest("hex").slice(0, 24)}`;

  const cached = metaCache.get<{ meta: SchemaMeta; cost: MonidCostSummary }>(cacheKey);
  if (cached) {
    monidCostCache.set(sidecarKey, cached.cost); // re-set the receipt even on a cache hit
    return cached.meta;
  }

  let run: MonidRunResult;
  let execNote: string | undefined;
  try {
    run = parseMonidRun(await runMonidCli(buildRunArgs(conn), conn.apiKey));
  } catch (e) {
    // Hard setup/auth/payment failures are the user's to act on — surface them.
    if (e instanceof MonidCliError && e.hard) throw e;
    // Soft failures (timeout, transient exec, parse) degrade honestly, keeping the receipt.
    execNote = e instanceof Error ? e.message : String(e);
    run = { rows: [], costUsd: e instanceof MonidCliError ? e.costUsd : undefined, raw: null };
  }

  const meta = buildMonidSchema(conn, run, execNote);
  const cost: MonidCostSummary = {
    costUsd: run.costUsd,
    provider: conn.provider,
    endpoint: conn.endpoint,
    runId: run.runId,
    rowCount: run.rows.length,
    ok: !execNote && run.rows.length > 0,
    note: execNote,
  };
  monidCostCache.set(sidecarKey, cost);
  metaCache.set(cacheKey, { meta, cost }, 300);
  return meta;
}
