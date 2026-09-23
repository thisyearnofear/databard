/**
 * Service input discovery + request synthesis for the marketplace index.
 *
 * "Gate not reached" was the index's biggest blind spot: an empty POST `{}`
 * is not a fair call — most services validate input before the paywall, so
 * the listing check never reached the x402 gate. This module turns whatever
 * evidence a service exposes (MCP inputSchema, 402 challenge carriers, the
 * rejection body from an empty call, or the listing description) into a
 * valid request we can actually send — unpaid first, then paid under the
 * daily verification budget.
 *
 * Nothing here ever invents coverage: when no input contract can be
 * discovered, the service stays "unverified" rather than being scored as if
 * a real call happened.
 */

export interface FieldSpec {
  name: string;
  type?: string;
  required: boolean;
  enum?: unknown[];
  default?: unknown;
  example?: unknown;
  description?: string;
  /** Where the field travels: JSON body (default) or query string. */
  carrier?: "body" | "query";
}

export type InputSource =
  | "mcp_tools"
  | "challenge_schema"
  | "challenge_example"
  | "rejection"
  | "description";

export interface DiscoveredInputs {
  source: InputSource;
  /** MCP tool chosen for the call, when source is mcp_tools. */
  toolName?: string;
  fields: FieldSpec[];
  /** Whole example body from a bazaar-style challenge, when present. */
  exampleBody?: Record<string, unknown>;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

// ── Safety denylist ────────────────────────────────────────────────────────

const SIDE_EFFECT_RE =
  /(transfer|send|swap|withdraw|execute|order|trade|buy|sell|mint|burn|delete|remove|post|publish|submit|write|deploy)/i;

/** True when calling this service/tool could move money or mutate state.
    Check-style names (approve/verify/check) are deliberately allowed. */
export function isSideEffecting(endpoint: string, toolName?: string): boolean {
  try {
    if (SIDE_EFFECT_RE.test(new URL(endpoint).pathname)) return true;
  } catch {
    if (SIDE_EFFECT_RE.test(endpoint)) return true;
  }
  return toolName !== undefined && SIDE_EFFECT_RE.test(toolName);
}

// ── Schema → FieldSpec[] ───────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Accepts a JSON Schema ({properties, required}) or a per-field map
    ({name: {type, description, required, carrier}}) like outputSchema.input. */
function fieldsFromSchema(schema: unknown): FieldSpec[] {
  if (!isObj(schema)) return [];
  const props = isObj(schema.properties) ? schema.properties : schema;
  const requiredArr = Array.isArray(schema.required)
    ? new Set((schema.required as unknown[]).filter((v): v is string => typeof v === "string"))
    : null;
  const out: FieldSpec[] = [];
  for (const [name, raw] of Object.entries(props)) {
    if (!isObj(raw)) continue;
    const example = Array.isArray(raw.examples) && raw.examples.length > 0
      ? raw.examples[0]
      : raw.example;
    out.push({
      name,
      type: typeof raw.type === "string" ? raw.type : undefined,
      required:
        requiredArr !== null
          ? requiredArr.has(name)
          : raw.required === true,
      enum: Array.isArray(raw.enum) ? raw.enum : undefined,
      default: raw.default,
      example,
      description: typeof raw.description === "string" ? raw.description : undefined,
      carrier: raw.carrier === "query" ? "query" : "body",
    });
  }
  return out;
}

/** Walk the carrier locations real 402 challenges use: body.inputSchema,
    body.parameters, body.outputSchema.input, accepts[].extra.inputSchema /
    .extra.input, extensions.bazaar.schema.properties.input.properties.body. */
function schemaFromChallenge(raw: Obj): FieldSpec[] {
  const candidates: unknown[] = [
    raw.inputSchema,
    raw.parameters,
    isObj(raw.outputSchema) ? raw.outputSchema.input : undefined,
    isObj(raw.extra) ? raw.extra.inputSchema ?? raw.extra.input : undefined,
  ];
  const accepts = Array.isArray(raw.accepts) ? raw.accepts : [];
  for (const a of accepts) {
    if (isObj(a) && isObj(a.extra)) candidates.push(a.extra.inputSchema, a.extra.input);
  }
  const bazaar = isObj(raw.extensions) ? raw.extensions.bazaar : undefined;
  if (isObj(bazaar) && isObj(bazaar.schema)) {
    const input = isObj(bazaar.schema.properties) ? bazaar.schema.properties.input : undefined;
    if (isObj(input) && isObj(input.properties)) {
      candidates.push(input.properties.body);
    }
  }
  for (const c of candidates) {
    const fields = fieldsFromSchema(c);
    if (fields.length > 0) return fields;
  }
  return [];
}

/** Bazaar challenges carry a full example body at
    extensions.bazaar.info.input.body — stronger evidence than any schema. */
function exampleFromChallenge(raw: Obj): Record<string, unknown> | null {
  const bazaar = isObj(raw.extensions) ? raw.extensions.bazaar : undefined;
  const info = isObj(bazaar) ? bazaar.info : undefined;
  const input = isObj(info) ? info.input : undefined;
  const body = isObj(input) ? input.body : undefined;
  return isObj(body) && Object.keys(body).length > 0 ? body : null;
}

// ── Field-name extraction from rejection bodies ────────────────────────────

const STOPWORDS = new Set([
  "parameter", "parameters", "param", "params", "field", "fields", "value",
  "input", "body", "request", "argument", "arguments", "the", "a", "an",
  "is", "are", "required", "missing", "invalid", "expected", "must", "be",
  "provide", "provided", "include", "included", "error", "for", "in", "of",
  "to", "and", "or", "not", "no", "was", "string", "number", "object",
  // auth/payment vocabulary — never real input fields; guards against
  // extracting "Payment" from a 402 body like {"error":"Payment required"}.
  "payment", "authentication", "authorization", "signature", "header",
  "headers", "apikey", "key", "unauthorized", "forbidden", "x402",
]);

export function extractFieldNames(body: unknown): string[] {
  // Never mine a payment challenge for field names — its vocabulary is the
  // protocol's, not the service's input contract.
  if (isObj(body) && ("x402Version" in body || "accepts" in body)) return [];
  const names = new Set<string>();
  // Normalise "body.asset", "$.profile", "params[0].x" → usable field names.
  // Dotted names keep their path so synthesizeBody can nest them.
  const addName = (raw: string, context?: string) => {
    let n = raw.trim().replace(/^\$\.?/, "").replace(/\[\d+\]/g, "");
    if (!n) return;
    n = n.replace(/^(body|query|params|arguments|args|input|data)\./i, "");
    const leaf = n.split(".").pop() ?? n;
    if (!/^[A-Za-z_][\w.]*$/.test(n)) return;
    if (STOPWORDS.has(leaf.toLowerCase()) || leaf.length > 40) return;
    // "token"/"key" are real field names, but not when the error is about an
    // invalid/expired credential rather than a missing input.
    if (
      (leaf.toLowerCase() === "token" || leaf.toLowerCase() === "apikey") &&
      context !== undefined &&
      /invalid|expired|unauthorized|incorrect/i.test(context)
    ) return;
    names.add(n);
  };
  const visit = (v: unknown, depth: number) => {
    if (depth > 4 || v == null) return;
    if (typeof v === "string") {
      // "symbol is required", `"symbol" is required`, `missing "chain"`,
      // `expected field 'limit'`, `must include address`,
      // `field "tokenAddress" is not set`, `body.asset: Field required`
      const patterns = [
        /["'`]([A-Za-z_][\w.-]*)["'`]\s+(?:is\s+)?(?:required|missing|invalid|expected|not set|not provided)/gi,
        /\b([A-Za-z_][\w.-]*)\s+(?:is\s+)?(?:required|missing|not provided|must be provided|is not set)\b/gi,
        /(?:missing|required|provide|expected|must include|requires?)\s+(?:\w+\s+){0,2}["'`]([A-Za-z_][\w.-]*)["'`]/gi,
        /\b([A-Za-z_][\w.-]*)\s*:\s*(?:Field\s+)?[Rr]equired\b/g,
      ];
      for (const re of patterns) {
        for (const m of v.matchAll(re)) {
          addName(m[1], v);
        }
      }
      return;
    }
    if (Array.isArray(v)) {
      // zod-style issues: [{path: ["symbol"], code/message...}] or
      // [{path: "targetUrl"|"$.profile"|"body.asset", ...}]
      for (const item of v) {
        if (isObj(item) && Array.isArray(item.path)) {
          const seg = item.path[item.path.length - 1];
          if (typeof seg === "string" && seg) addName(seg);
          else if (typeof seg === "number" && item.path.length > 1) {
            const prev = item.path[item.path.length - 2];
            if (typeof prev === "string") addName(prev);
          }
        } else if (isObj(item) && typeof item.path === "string") {
          addName(item.path);
        } else {
          visit(item, depth + 1);
        }
      }
      return;
    }
    if (isObj(v)) {
      // {errors: {symbol: ["required"]}} / {fields: {...}} keyed by field name
      for (const key of ["errors", "fields", "missing", "required_fields", "requiredFields"]) {
        if (isObj(v[key])) {
          for (const k of Object.keys(v[key] as Obj)) addName(k);
        }
        if (Array.isArray(v[key]) && key !== "errors" && key !== "fields") {
          // {missing: ["symbol", "chain"]} — entries are bare names
          for (const k of v[key] as unknown[]) {
            if (typeof k === "string") addName(k);
          }
        }
      }
      for (const child of Object.values(v)) visit(child, depth + 1);
    }
  };
  visit(body, 0);
  return [...names];
}

// ── Value synthesis ────────────────────────────────────────────────────────

/** A real Ethereum mainnet tx hash (genesis-era), used for tx/txHash fields. */
const SAMPLE_TX_HASH =
  "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060";
const SAMPLE_TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT (Ethereum)
const SAMPLE_WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // vitalik.eth
const SAMPLE_SOL_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC (Solana)

const norm = (name: string) => name.toLowerCase().replace(/[_\-.]/g, "");

function dictionaryValue(name: string, type?: string): unknown {
  const n = norm(name.split(".").pop() ?? name);
  const num = type === "number" || type === "integer";
  const has = (...words: string[]) => words.some((w) => n.includes(w));
  if (has("tokenaddress", "contractaddress", "contract")) return SAMPLE_TOKEN;
  if (n === "mint" || n === "tokenmint" || n === "coinmint") return SAMPLE_SOL_MINT;
  if (has("token")) return SAMPLE_TOKEN;
  if (has("txhash", "transactionhash")) return SAMPLE_TX_HASH;
  if (n === "tx" || has("txnhash")) return SAMPLE_TX_HASH;
  if (has("walletaddress", "wallet")) return SAMPLE_WALLET;
  if (n === "addresses" || n === "wallets") return [SAMPLE_WALLET];
  if (n === "address" || n.endsWith("address") || has("owner")) return SAMPLE_WALLET;
  if (n === "to" || n === "from" || n === "recipient" || n === "target") return SAMPLE_WALLET;
  if (has("stablecoin", "stable")) return "USDC";
  if (has("chainid", "chainindex")) return num ? 1 : "1";
  if (n === "chain" || n === "network" || n.endsWith("chain")) return num ? 1 : "1";
  if (has("symbol", "ticker", "coin", "asset", "pair", "market")) return "BTC";
  if (has("url", "website", "link", "uri", "endpoint")) return "https://www.okx.com";
  if (has("txhash") || n === "hash" || n.endsWith("hash")) return SAMPLE_TX_HASH;
  if (has("query", "question", "prompt", "topic", "text", "input", "message") || n === "q")
    return "BTC market outlook this week";
  if (has("timeframe", "interval", "period")) return "1d";
  if (has("limit", "count", "size", "max", "top")) return 5;
  if (n === "date" || n.endsWith("date") || has("day")) {
    return new Date().toISOString().slice(0, 10);
  }
  if (has("lang", "language", "locale")) return "en";
  if (has("amount", "value", "quantity") || n.endsWith("usd")) return num ? 5 : "1";
  if (has("id") || n.endsWith("id")) return "probe-1";
  return undefined;
}

/** Assign body[a.b.c] = value with nested objects. */
function assignNested(body: Record<string, unknown>, name: string, value: unknown) {
  const parts = name.split(".");
  let cur = body;
  for (const p of parts.slice(0, -1)) {
    if (!isObj(cur[p])) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function typeDefault(type?: string): unknown {
  switch (type) {
    case "number":
    case "integer":
      return 1;
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return {};
    default:
      // Unknown required strings get an obvious placeholder, not a confident
      // "BTC" — a guess-tier fill that marks the request as low-confidence.
      return "n/a";
  }
}

/**
 * Build a JSON body from discovered fields. Precedence per field:
 * example > default > enum[0] > name dictionary > type default.
 * Required fields always; optional fields only when the dictionary knows them
 * or the schema supplies example/default/enum.
 */
export function synthesizeBody(
  fields: FieldSpec[],
  exampleBody?: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.carrier === "query") continue;
    const exampleVal = f.example ?? (exampleBody && exampleBody[f.name]);
    const hasSchemaHint = exampleVal !== undefined || f.default !== undefined || f.enum !== undefined;
    const dict = dictionaryValue(f.name, f.type);
    if (!f.required && !hasSchemaHint && dict === undefined) continue;
    const value =
      exampleVal !== undefined
        ? exampleVal
        : f.default !== undefined
          ? f.default
          : f.enum !== undefined && f.enum.length > 0
            ? f.enum[0]
            : dict !== undefined
              ? dict
              : typeDefault(f.type);
    assignNested(body, f.name, f.type === "array" && !Array.isArray(value) ? [value] : value);
  }
  return body;
}

/** Query-string params for GET-only endpoints (carrier "query" fields, or
    all fields when the service answers GET only). */
export function synthesizeQuery(
  fields: FieldSpec[],
  exampleBody?: Record<string, unknown>,
): Record<string, string> {
  const body = synthesizeBody(
    fields.map((f) => ({ ...f, carrier: "body" as const })),
    exampleBody,
  );
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    out[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  return out;
}

// ── Discovery ──────────────────────────────────────────────────────────────

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

/** Pick the MCP tool to call: only one → it; otherwise best keyword overlap
    between tool name+description and the listing's serviceName+description.
    Side-effecting tools are never picked. */
export function pickMcpTool(
  tools: McpTool[],
  service: { serviceName: string; description: string },
): McpTool | null {
  const safe = tools.filter((t) => !SIDE_EFFECT_RE.test(t.name));
  if (safe.length === 0) return null;
  if (safe.length === 1) return safe[0];
  const wanted = new Set(tokens(`${service.serviceName} ${service.description}`));
  let best: McpTool | null = null;
  let bestHits = 0;
  for (const t of safe) {
    const hits = tokens(`${t.name} ${t.description ?? ""}`).filter((x) => wanted.has(x)).length;
    if (hits > bestHits) {
      best = t;
      bestHits = hits;
    }
  }
  return best ?? safe[0];
}

const DESCRIPTION_FIELDS: [RegExp, string][] = [
  [/symbol|ticker|coin|token|asset|pair/i, "symbol"],
  [/wallet|address/i, "address"],
  [/chain|network/i, "chain"],
  [/tx|transaction|hash/i, "txHash"],
  [/url|website|link/i, "url"],
  [/query|question|prompt|topic|keyword|search/i, "query"],
  [/date|day/i, "date"],
  [/limit|count|top/i, "limit"],
];

/**
 * discoverInputs(service, evidence) — evidence carries whatever the unpaid
 * check already captured: decoded challenge header JSON, the 402/rejection
 * body, MCP tools. Returns null when nothing usable exists.
 */
export function discoverInputs(evidence: {
  serviceName: string;
  description: string;
  challengeRaw?: Obj | null;
  bodyJson?: unknown;
  /** HTTP status the bodyJson came from — 402 bodies are never mined. */
  status?: number;
  mcpTools?: McpTool[] | null;
}): DiscoveredInputs | null {
  // a. MCP tools/list inputSchema
  if (evidence.mcpTools && evidence.mcpTools.length > 0) {
    const tool = pickMcpTool(evidence.mcpTools, evidence);
    if (tool) {
      const fields = fieldsFromSchema(tool.inputSchema);
      if (fields.length > 0 || tool.inputSchema !== undefined) {
        return { source: "mcp_tools", toolName: tool.name, fields };
      }
    }
  }

  // b. 402 challenge carriers (schema first, then whole example body)
  if (evidence.challengeRaw) {
    const fields = schemaFromChallenge(evidence.challengeRaw);
    if (fields.length > 0) {
      return {
        source: "challenge_schema",
        fields,
        exampleBody: exampleFromChallenge(evidence.challengeRaw) ?? undefined,
      };
    }
    const example = exampleFromChallenge(evidence.challengeRaw);
    if (example) {
      return {
        source: "challenge_example",
        fields: Object.keys(example).map((name) => ({ name, required: false })),
        exampleBody: example,
      };
    }
  }

  // c. Field names extracted from the rejection body — but never from a
  // payment challenge (402): its "Payment required" is protocol vocabulary.
  const names =
    evidence.status === 402 ? [] : extractFieldNames(evidence.bodyJson);
  if (names.length > 0) {
    return {
      source: "rejection",
      fields: names.map((name) => ({ name, required: true })),
    };
  }

  // d. Listing description keywords
  const descFields = DESCRIPTION_FIELDS.filter(([re]) =>
    re.test(`${evidence.serviceName} ${evidence.description}`),
  ).map(([, name]) => ({ name, required: true }));
  if (descFields.length > 0) {
    return { source: "description", fields: descFields.slice(0, 3) };
  }

  return null;
}

// ── Input confidence ───────────────────────────────────────────────────────

/** How confident we are that the synthesized request is what the service
    actually wants. Only "exact" and "dictionary" inputs are worth paying
    for; "guess" calls still run unpaid (a 402 there counts as gate-verified)
    but their paid outcomes never feed the delivery headline. */
export type InputConfidence = "exact" | "dictionary" | "guess";

export function classifyInputs(inputs: DiscoveredInputs): InputConfidence {
  if (inputs.source === "description") return "guess";
  if (inputs.source === "challenge_example") return "exact";
  const required = inputs.fields.filter((f) => f.required);
  if (required.length === 0) return "exact";
  let tier: InputConfidence = "exact";
  for (const f of required) {
    const schemaHint =
      f.example !== undefined ||
      f.default !== undefined ||
      (f.enum !== undefined && f.enum.length > 0) ||
      (inputs.exampleBody !== undefined && inputs.exampleBody[f.name] !== undefined);
    if (schemaHint) continue;
    if (dictionaryValue(f.name, f.type) !== undefined) {
      if (tier === "exact") tier = "dictionary";
      continue;
    }
    return "guess";
  }
  return tier;
}

// ── Stale-data detection ───────────────────────────────────────────────────

const DATE_KEYS = new Set([
  "date", "generated_at", "generatedat", "timestamp", "updatedat",
  "asof", "lastupdated", "createdat", "fetchedat",
]);

/** Newest date found in top-level or one-nested date fields, or null. */
export function payloadDate(body: unknown): Date | null {
  if (!isObj(body)) return null;
  const scan = (o: Obj): Date | null => {
    let newest: Date | null = null;
    for (const [k, v] of Object.entries(o)) {
      if (!DATE_KEYS.has(k.toLowerCase())) continue;
      let d: Date | null = null;
      if (typeof v === "number" && v > 1e9) d = new Date(v > 1e12 ? v : v * 1000);
      else if (typeof v === "string") {
        const parsed = Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v);
        if (!Number.isNaN(parsed)) d = new Date(parsed);
      }
      if (d && (!newest || d > newest)) newest = d;
    }
    return newest;
  };
  let d = scan(body);
  if (!d) {
    for (const v of Object.values(body)) {
      if (isObj(v)) {
        d = scan(v);
        if (d) break;
      }
    }
  }
  return d;
}

export const STALE_DAYS = 7;

export function isStalePayload(body: unknown, now = Date.now()): string | null {
  const d = payloadDate(body);
  if (!d) return null;
  if (now - d.getTime() > STALE_DAYS * 24 * 3600 * 1000) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}
