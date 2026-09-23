import {
  synthesizeBody,
  synthesizeQuery,
  extractFieldNames,
  isSideEffecting,
  pickMcpTool,
  discoverInputs,
  classifyInputs,
  isStalePayload,
  type FieldSpec,
} from "../src/lib/service-inputs";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const f = (name: string, over: Partial<FieldSpec> = {}): FieldSpec => ({ name, required: true, ...over });

// ── synthesizeBody precedence: example > default > enum > dictionary > type ──

{
  const body = synthesizeBody([f("symbol", { example: "ETH", default: "SOL" })]);
  assert(body.symbol === "ETH", "example beats default");
}
{
  const body = synthesizeBody([f("symbol", { default: "SOL", enum: ["DOGE"] })]);
  assert(body.symbol === "SOL", "default beats enum");
}
{
  const body = synthesizeBody([f("timeframe", { enum: ["4h", "1d"] })]);
  assert(body.timeframe === "4h", "enum[0] beats dictionary");
}
{
  const body = synthesizeBody([f("token_address")]);
  assert(body.token_address === "0xdAC17F958D2ee523a2206206994597C13D831ec7", `tokenAddress dict (got ${body.token_address})`);
}
{
  const body = synthesizeBody([f("walletAddress")]);
  assert(body.walletAddress === "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "wallet dict");
}
{
  const body = synthesizeBody([f("chainId", { type: "integer" }), f("chain")]);
  assert(body.chainId === 1 && body.chain === "1", `chain numeric vs string (got ${JSON.stringify(body)})`);
}
{
  const body = synthesizeBody([f("query")]);
  assert(body.query === "BTC market outlook this week", "query dict");
}
{
  const body = synthesizeBody([f("frobnicate", { type: "number" })]);
  assert(body.frobnicate === 1, "type fallback for unknown required field");
}
{
  // optional fields only when dictionary/schema knows them
  const body = synthesizeBody([f("mystery", { required: false }), f("limit", { required: false })]);
  assert(!("mystery" in body), "unknown optional skipped");
  assert(body.limit === 5, "known optional included");
}
{
  const body = synthesizeBody(
    [f("symbol"), f("chain")],
    { symbol: "DOGE", chain: "solana" },
  );
  assert(body.symbol === "DOGE" && body.chain === "solana", "exampleBody overrides dictionary");
}
{
  const body = synthesizeBody([f("txHash")]);
  assert(/^0x[0-9a-f]{64}$/.test(body.txHash as string), "txHash dict is a real-shaped hash");
}
{
  const body = synthesizeBody([f("date")]);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(body.date as string), "date → YYYY-MM-DD");
}

// ── synthesizeQuery: GET endpoints ──────────────────────────────────────────

{
  const q = synthesizeQuery([f("symbol"), f("limit", { required: false }), f("mystery", { required: false })]);
  assert(q.symbol === "BTC" && q.limit === "5", `query params (got ${JSON.stringify(q)})`);
  assert(!("mystery" in q), "unknown optional skipped in query");
}

// ── extractFieldNames ───────────────────────────────────────────────────────

{
  const names = extractFieldNames({ error: "symbol is required" });
  assert(names.includes("symbol"), `JSON error extraction (got ${names.join(",")})`);
}
{
  const names = extractFieldNames("missing required parameter 'chain'");
  assert(names.includes("chain"), `plain text extraction (got ${names.join(",")})`);
}
{
  const names = extractFieldNames({
    issues: [
      { path: ["symbol"], code: "invalid_type", message: "Required" },
      { path: ["args", "limit"], message: "Too small" },
    ],
  });
  assert(names.includes("symbol") && names.includes("limit"), `zod issues (got ${names.join(",")})`);
}
{
  const names = extractFieldNames({ errors: { walletAddress: ["must be provided"], amount: ["required"] } });
  assert(names.includes("walletAddress") && names.includes("amount"), `keyed errors (got ${names.join(",")})`);
}
{
  const names = extractFieldNames({ error: "bad request" });
  assert(names.length === 0, `generic error yields nothing (got ${names.join(",")})`);
}
{
  // `field "tokenAddress" is not set` (xerpa-style)
  const names = extractFieldNames({ success: false, code: 5001002, msg: 'field "tokenAddress" is not set' });
  assert(names.includes("tokenAddress"), `is-not-set extraction (got ${names.join(",")})`);
}
{
  // `body.asset: Field required` (fastapi-style)
  const names = extractFieldNames({ error: "invalid_request: body.asset: Field required; body.position_usd: Field required" });
  assert(names.includes("asset") && names.includes("position_usd"), `colon-required extraction (got ${names.join(",")})`);
}
{
  // errors array of full sentences must not become field names
  const names = extractFieldNames({ errors: ["demand.partNumber is required.", "demand.quantity must be a positive number."] });
  assert(names.includes("demand.partNumber"), `dotted path extracted (got ${names.join(",")})`);
  assert(!names.some((n) => n.includes(" ")), `no sentence-as-name (got ${names.join(",")})`);
}
{
  // string-form zod paths and $. prefixes
  const names = extractFieldNames({ issues: [{ path: "targetUrl", message: "Required" }, { path: "$.profile", message: "must be an object" }] });
  assert(names.includes("targetUrl") && names.includes("profile"), `string paths (got ${names.join(",")})`);
}
{
  // dotted names synthesize nested objects
  const body = synthesizeBody([f("demand.partNumber"), f("demand.quantity", { type: "number" })]);
  const d = body.demand as Record<string, unknown>;
  // "partNumber" isn't a dictionary name — unknown strings get the honest
  // placeholder, not a confident "BTC".
  assert(d?.partNumber === "n/a" && d?.quantity === 5, `nested synthesis (got ${JSON.stringify(body)})`);
}
{
  const body = synthesizeBody([f("addresses", { type: "array" }), f("mint"), f("stablecoin"), f("to")]);
  assert(Array.isArray(body.addresses), "addresses → array");
  assert(body.mint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "mint → solana USDC");
  assert(body.stablecoin === "USDC", "stablecoin dict");
  assert(body.to === "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "to → wallet");
}

// ── isSideEffecting ─────────────────────────────────────────────────────────

assert(isSideEffecting("https://x.com/api/transfer"), "transfer endpoint denied");
assert(isSideEffecting("https://x.com/api", "execute_swap"), "swap tool denied");
assert(isSideEffecting("https://x.com/trade/buy"), "buy path denied");
assert(!isSideEffecting("https://x.com/api/check", "verify_contract"), "check/verify allowed");
assert(!isSideEffecting("https://x.com/mcp", "get_price"), "read tool allowed");

// ── pickMcpTool ─────────────────────────────────────────────────────────────

{
  const one = pickMcpTool([{ name: "get_price" }], { serviceName: "Price", description: "" });
  assert(one?.name === "get_price", "single tool picked");
}
{
  const t = pickMcpTool(
    [
      { name: "get_price", description: "token price lookup", inputSchema: {} },
      { name: "list_chains", description: "supported networks", inputSchema: {} },
      { name: "swap_tokens", description: "token price swap", inputSchema: {} }, // denied
    ],
    { serviceName: "Token Price Oracle", description: "price feeds" },
  );
  assert(t?.name === "get_price", `best overlap picked, side-effect skipped (got ${t?.name})`);
}
{
  const t = pickMcpTool([{ name: "transfer_funds" }, { name: "mint_token" }], { serviceName: "x", description: "y" });
  assert(t === null, "all side-effecting → null");
}

// ── discoverInputs priority ─────────────────────────────────────────────────

{
  const d = discoverInputs({
    serviceName: "Price",
    description: "token price",
    mcpTools: [{ name: "get_price", inputSchema: { properties: { symbol: { type: "string" } }, required: ["symbol"] } }],
    challengeRaw: { inputSchema: { properties: { q: { type: "string" } }, required: ["q"] } },
    bodyJson: { error: "x is required" },
  });
  assert(d?.source === "mcp_tools" && d?.toolName === "get_price", "mcp tools win");
}
{
  const d = discoverInputs({
    serviceName: "Price",
    description: "token price",
    challengeRaw: {
      accepts: [{ extra: { inputSchema: { properties: { address: { type: "string" } }, required: ["address"] } } }],
    },
    bodyJson: { error: "x is required" },
  });
  assert(d?.source === "challenge_schema" && d.fields[0].name === "address", `challenge schema (got ${d?.source}/${d?.fields[0]?.name})`);
}
{
  const d = discoverInputs({
    serviceName: "Price",
    description: "token price",
    challengeRaw: { extensions: { bazaar: { info: { input: { body: { symbol: "ETH" } } } } } },
  });
  assert(d?.source === "challenge_example" && d.exampleBody?.symbol === "ETH", "bazaar example body");
}
{
  const d = discoverInputs({
    serviceName: "Price",
    description: "token price",
    bodyJson: { error: "symbol is required" },
  });
  assert(d?.source === "rejection" && d.fields[0].name === "symbol", "rejection extraction");
}
{
  const d = discoverInputs({ serviceName: "Token Price", description: "Provide a wallet address to analyse" });
  assert(d?.source === "description" && d.fields.some((x) => x.name === "address"), `description fallback (got ${d?.source})`);
}
{
  const d = discoverInputs({ serviceName: "zzz", description: "nothing usable here" });
  assert(d === null, "no evidence → null");
}

// ── stale payload ───────────────────────────────────────────────────────────

{
  const old = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  assert(isStalePayload({ date: old }) === old, "top-level stale date");
  assert(isStalePayload({ result: { generatedAt: old } }) === old, "nested stale date");
  assert(isStalePayload({ date: new Date().toISOString().slice(0, 10) }) === null, "fresh date not stale");
  assert(isStalePayload({ price: 1 }) === null, "no date → not stale");
}

// ── extraction never mines payment challenges ─────────────────────────────

{
  const names = extractFieldNames({ error: "Payment required", x402Version: 2 });
  assert(names.length === 0, `x402 body → no fields (got ${names.join(",")})`);
}
{
  // even without the x402Version key, "Payment" is a stopword
  const names = extractFieldNames({ error: "Payment required" });
  assert(names.length === 0, `payment-required text → no fields (got ${names.join(",")})`);
}
{
  const names = extractFieldNames({ error: "signature verification failed: token is invalid" });
  assert(!names.includes("token"), `invalid-token error doesn't yield "token" (got ${names.join(",")})`);
}
{
  // a real missing-token error still extracts (missing, not invalid)
  const names = extractFieldNames({ error: "token is required" });
  assert(names.includes("token"), `token-is-required still extracts (got ${names.join(",")})`);
}

// discoverInputs: 402 status bodies skip rejection mining entirely
{
  const d = discoverInputs({
    serviceName: "Svc",
    description: "nothing usable",
    status: 402,
    bodyJson: { error: "Payment required", x402Version: 2 },
  });
  assert(d === null || d.source !== "rejection", `402 body → no rejection source (got ${d?.source})`);
}

// ── input confidence tiers ────────────────────────────────────────────────

{
  assert(
    classifyInputs({ source: "challenge_schema", fields: [f("symbol", { example: "ETH" })] }) === "exact",
    "schema example → exact",
  );
  assert(
    classifyInputs({ source: "rejection", fields: [f("symbol")] }) === "dictionary",
    "rejection name in dictionary → dictionary",
  );
  assert(
    classifyInputs({ source: "rejection", fields: [f("mysteryField")] }) === "guess",
    "unknown required field → guess",
  );
  assert(
    classifyInputs({ source: "description", fields: [f("symbol")] }) === "guess",
    "description source → guess",
  );
  assert(
    classifyInputs({ source: "challenge_example", fields: [{ name: "x", required: false }] }) === "exact",
    "example body → exact",
  );
  assert(
    classifyInputs({
      source: "challenge_schema",
      fields: [f("symbol", { enum: ["BTC"] }), f("name")],
    }) === "guess",
    "one unknown required field drags to guess",
  );
}
{
  // unknown string fields get an honest placeholder, not "BTC"
  const body = synthesizeBody([f("mystery")]);
  assert(body.mystery === "n/a", `unknown string → n/a (got ${JSON.stringify(body)})`);
}

// ── Regression: OKLink validator messages ──────────────────────────────────
{
  // "chainIndex must not be blank; tokenAddress must not be blank"
  const names = extractFieldNames({
    code: "400",
    msg: "参数校验失败: chainIndex must not be blank; tokenAddress must not be blank",
  });
  assert(
    names.includes("chainIndex") && names.includes("tokenAddress"),
    `must-not-be-blank names extracted (got ${JSON.stringify(names)})`,
  );
}
{
  // "chainIndex chainIndex 不能为空" — duplicated name + Chinese validator
  const names = extractFieldNames({ code: "400", msg: "参数校验失败: chainIndex chainIndex 不能为空" });
  assert(
    names.length === 1 && names[0] === "chainIndex",
    `不能为空 names extracted (got ${JSON.stringify(names)})`,
  );
}
{
  const names = extractFieldNames({ code: "400", msg: "参数校验失败: tokenAddress tokenAddress 不能为空" });
  assert(
    names.includes("tokenAddress"),
    `duplicated 不能为空 name (got ${JSON.stringify(names)})`,
  );
}

// ── Description literal field names ────────────────────────────────────────
{
  const inputs = discoverInputs({
    serviceName: "Token Metadata",
    description:
      'Token metadata — POST.\nPOST only (GET=405). Requires chainIndex, tokenAddress. Returns name, symbol, decimals.\ne.g. POST {"chainIndex":"1","tokenAddress":"0x..."}',
    status: 200,
  });
  assert(
    inputs?.source === "description" && inputs.literalNames === true,
    `literal description names (got ${JSON.stringify(inputs)})`,
  );
  const names = inputs!.fields.map((f) => f.name);
  assert(
    names.includes("chainIndex") && names.includes("tokenAddress") && !names.includes("symbol"),
    `literal fields = provider names (got ${names})`,
  );
  const body = synthesizeBody(inputs!.fields);
  assert(
    body.chainIndex === "1" && body.tokenAddress === "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    `dictionary fills literal names (got ${JSON.stringify(body)})`,
  );
  assert(
    classifyInputs(inputs!) === "dictionary",
    `literal dictionary-matched names → dictionary (got ${classifyInputs(inputs!)})`,
  );
}
{
  // Single-name "Required: tokenAddress" form — parenthetical not a field
  const inputs = discoverInputs({
    serviceName: "Meme Token Overview",
    description: "Required: tokenAddress (EVM address or Solana mint). Optional: chainIndex (1/56/501).",
    status: 200,
  });
  const names = inputs!.fields.map((f) => f.name);
  assert(
    names.includes("tokenAddress") && !names.includes("EVM") && !names.includes("Solana"),
    `single required name, no parenthetical junk (got ${names})`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
