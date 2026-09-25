import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * A2MCP service discovery — lists the tools this ASP exposes, with JSON Schema
 * for each tool's input and output. Used by the marketplace listing and by
 * caller agents that introspect available capabilities before invoking.
 *
 * Self-check (must return HTTP 200):
 *   curl -i https://databard.persidian.com/api/mcp/tools
 */

const connectionSchema = {
  type: "object",
  description:
    "Data source connection spec. `source` selects the adapter; populate the matching connector block. If you do NOT have access to a live data source, you may omit everything (or send an empty object) — DataBard returns a clearly-labelled demo analysis of a sample schema instead of an error, so every invocation succeeds.",
  properties: {
    source: {
      type: "string",
      enum: ["openmetadata", "dbt-cloud", "dbt-local", "the-graph", "dune", "coral", "datahub", "monid"],
      default: "openmetadata",
    },
    schemaFqn: {
      type: "string",
      description:
        "Fully-qualified schema name, e.g. \"db.sales\", \"prod.analytics\", \"dune.uniswap\" or \"monid.<provider>.<endpoint>\". If omitted, a demo schema is analysed.",
    },
    demo: {
      type: "boolean",
      description: "Set true to force the labelled demo analysis without contacting any data source.",
    },
    openmetadata: {
      type: "object",
      description: "OpenMetadata connection: server URL (e.g. http://localhost:8585/api) and a bot/personal-access token.",
      properties: { url: { type: "string" }, token: { type: "string" } },
      required: ["url", "token"],
    },
    datahub: {
      type: "object",
      description:
        "DataHub GMS GraphQL connection. serverUrl is the DataHub base URL (e.g. http://localhost:8080); token is a DataHub personal access token (optional for open deployments).",
      properties: { serverUrl: { type: "string" }, token: { type: "string" } },
      required: ["serverUrl"],
    },
    dbtCloud: {
      type: "object",
      properties: { accountId: { type: "string" }, projectId: { type: "string" }, token: { type: "string" } },
      required: ["accountId", "projectId", "token"],
    },
    dbtLocal: {
      type: "object",
      properties: { manifestPath: { type: "string" }, manifestContent: { type: "string" } },
    },
    theGraph: {
      type: "object",
      properties: { subgraphUrl: { type: "string" }, apiKey: { type: "string" } },
      required: ["subgraphUrl"],
    },
    dune: {
      type: "object",
      properties: { apiKey: { type: "string" }, namespace: { type: "string" } },
      required: ["apiKey"],
    },
    coral: {
      type: "object",
      properties: {
        query: { type: "string" },
        localFiles: { type: "array", items: { type: "object", properties: { path: { type: "string" }, name: { type: "string" } } } },
      },
      required: ["query"],
    },
    monid: {
      type: "object",
      description:
        "Monid metered endpoint (the OpenRouter for agent tools). provider + endpoint come from `monid discover` then `monid inspect`; inputs is the JSON request body, query/path are extra params. apiKey is optional — the server's MONID_API_KEY is used when omitted. Each run reports its measured cost.",
      properties: {
        apiKey: { type: "string" },
        provider: { type: "string" },
        endpoint: { type: "string" },
        inputs: { type: "object", additionalProperties: true },
        query: { type: "object", additionalProperties: { type: "string" } },
        path: { type: "object", additionalProperties: { type: "string" } },
        wait: { type: "boolean" },
      },
      required: ["provider", "endpoint"],
    },
  },
  required: ["source", "schemaFqn"],
  examples: [
    {
      // No credentials? A bare call still succeeds with a labelled demo analysis.
      demo: true,
    },
    {
      source: "openmetadata",
      schemaFqn: "db.sales",
      openmetadata: { url: "http://your-openmetadata:8585/api", token: "<token>" },
    },
    { source: "datahub", schemaFqn: "db.sales", datahub: { serverUrl: "http://your-datahub:8080" } },
  ],
} as const;

const healthOutputSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    tool: { type: "string", const: "databard.health-check" },
    serviceVersion: { type: "number" },
    generatedAt: { type: "string" },
    schemaFqn: { type: "string" },
    schemaName: { type: "string" },
    summary: { type: "string", description: "Plain-text takeaway the calling agent can quote verbatim." },
    keyFindings: { type: "array", items: { type: "string" }, description: "Top findings as short strings." },
    nextStep: { type: "string", description: "The single most urgent recommended action." },
    upgrade: {
      type: "object",
      description:
        "Paid follow-up: the databard_briefing tool turns this free score into a two-speaker script plus narrated MP3 ($1.00/call, x402).",
      properties: {
        tool: { type: "string", const: "databard_briefing" },
        endpoint: { type: "string" },
        priceUsd: { type: "string" },
        includes: { type: "array", items: { type: "string" } },
        howToCall: { type: "string" },
      },
    },
    tableCount: { type: "number" },
    health: {
      type: "object",
      properties: {
        score: { type: "number", minimum: 0, maximum: 100 },
        label: { type: "string", enum: ["healthy", "at-risk", "critical"] },
        failingTests: { type: "number" },
        passingTests: { type: "number" },
        totalTests: { type: "number" },
        testCoverage: { type: "number" },
        docCoverage: { type: "number" },
        staleTables: { type: "number" },
        ownerlessTables: { type: "number" },
        undocumentedTables: { type: "number" },
      },
    },
    criticalTables: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          failingTests: { type: "number" },
          downstreamCount: { type: "number" },
          risk: { type: "string", enum: ["low", "medium", "high", "critical"] },
        },
      },
    },
    staleTables: { type: "array", items: { type: "object", properties: { name: { type: "string" }, hoursAgo: { type: "number" } } } },
    recommendedActions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
          category: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          table: { type: "string" },
          effort: { type: "string" },
        },
      },
    },
    monidCost: {
      type: "object",
      description:
        "Present only when source is \"monid\": the measured per-run cost receipt for the endpoint that produced this health score.",
      properties: {
        costUsd: { type: "number", description: "Measured cost of the run in USD (omitted when Monid didn't report one)." },
        provider: { type: "string" },
        endpoint: { type: "string" },
        runId: { type: "string" },
        rowCount: { type: "number" },
        ok: { type: "boolean" },
        note: { type: "string", description: "Set when the run degraded (timeout / empty / non-tabular) instead of returning live rows." },
      },
    },
  },
} as const;

const briefingOutputSchema = {
  ...healthOutputSchema,
  properties: {
    ...healthOutputSchema.properties,
    tool: { type: "string", const: "databard.briefing" },
    researchQuestion: { type: "string" },
    outputFormat: { type: "string", enum: ["podcast", "executive-summary"] },
    freshness: {
      type: "string",
      enum: ["live", "cached", "partial"],
      description: "live = every scoped row re-verified this call; cached = index rows only; partial = some rows fresh (see liveNote).",
    },
    liveNote: { type: "string", nullable: true, description: "Set when freshness is partial or the live re-check was unavailable." },
    script: {
      type: "array",
      items: {
        type: "object",
        properties: { speaker: { type: "string" }, topic: { type: "string" }, text: { type: "string" } },
      },
    },
    audio: { type: "string", nullable: true, description: "Base64-encoded MP3 (only when audioDelivery is \"inline\").", contentEncoding: "base64" },
    audioFormat: { type: "string", nullable: true, const: "mp3" },
    audioDelivery: { type: "string", enum: ["inline", "url", "none"] },
    audioUrl: { type: "string", nullable: true, description: "Hosted MP3 URL on this API (GET /api/mcp/briefing/audio/{id}) when audio was generated." },
    groveUrl: { type: "string", nullable: true, description: "Grove/IPFS URL — pinned asynchronously after the response; null while pending." },
    groveStatus: { type: "string", enum: ["pending", "skipped"], description: "\"pending\" = IPFS pin in progress in the background; \"skipped\" = no audio generated." },
    monidCost: { type: "object", description: "Measured per-run cost receipt (monid source only)." },
  },
} as const;

const writebackInputSchema = {
  ...connectionSchema,
  properties: {
    ...connectionSchema.properties,
    writeDescriptions: {
      type: "boolean",
      description: "Append an AI summary line to each dataset's description (default true).",
    },
  },
  required: ["source", "schemaFqn"],
} as const;

const writebackOutputSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    tool: { type: "string", const: "databard.write-back" },
    schemaFqn: { type: "string" },
    health: {
      type: "object",
      properties: { score: { type: "number" }, label: { type: "string" } },
    },
    summaryLine: { type: "string" },
    written: {
      type: "object",
      properties: {
        tablesTouched: { type: "number" },
        tagsApplied: { type: "number" },
        descriptionsUpdated: { type: "number" },
        errors: { type: "number" },
      },
    },
  },
} as const;

const fleetOutputSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    report: {
      type: "object",
      properties: {
        totalTables: { type: "number" },
        fleetScore: { type: "number", minimum: 0, maximum: 100 },
        ownerless: { type: "number" },
        untested: { type: "number" },
        undocumented: { type: "number" },
        stale: { type: "number" },
        failingTests: { type: "number" },
        totalTests: { type: "number" },
        health: {
          type: "object",
          properties: { healthy: { type: "number" }, atRisk: { type: "number" }, critical: { type: "number" } },
        },
        hotspots: {
          type: "array",
          items: { type: "object", properties: { name: { type: "string" }, downstream: { type: "number" } } },
        },
        townHall: {
          type: "array",
          items: { type: "object", properties: { speaker: { type: "string" }, topic: { type: "string" }, text: { type: "string" } } },
        },
      },
    },
  },
} as const;

const probeInputSchema = {
  type: "object",
  description:
    "Probe request. All fields are optional: omit everything to run the curated default candidate set (real OKX.AI A2MCP services). DataBard pays any outbound x402 fees itself, capped at $0.15 per run, and never fabricates results — unreachable endpoints are reported honestly.",
  properties: {
    question: {
      type: "string",
      description: "Optional intent behind the probe, e.g. \"I need a reliable on-chain token-price feed\". Max 500 chars.",
    },
    candidates: {
      type: "array",
      maxItems: 10,
      description: "Optional list of A2MCP endpoints to probe. If omitted, the curated default set is used.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Human-readable service name." },
          endpoint: { type: "string", description: "Full http(s) URL of the A2MCP endpoint." },
          method: { type: "string", enum: ["GET", "POST"], default: "POST" },
          body: { type: "object", additionalProperties: true, description: "Optional JSON body for the probe call." },
          knownPriceUsd: { type: "number", description: "Listed per-call price in USD, if known (0 = free)." },
          agentId: { type: "string", description: "Agent ID on OKX.AI, if known." },
          agentAddress: { type: "string", description: "Agent wallet/communication address for optional Ligis credential check." },
        },
        required: ["endpoint"],
      },
    },
    attest: {
      type: "boolean",
      default: false,
      description: "If true, writes the verdict hash to X Layer as a zero-value self-send for on-chain verification.",
    },
  },
  examples: [
    {},
    { question: "I need a reliable on-chain token-price feed" },
    {
      question: "Which schema validator should my agent trust?",
      candidates: [
        {
          name: "Doxa",
          endpoint: "https://doxa.ivaronix.xyz/a2mcp/schema.validate",
          method: "POST",
          body: { url: "https://example.com" },
          knownPriceUsd: 0.005,
          agentId: "9626",
          agentAddress: "0xcd4db585b9FdCbb44aA06ce57Aa72Bc1a92B8111",
        },
      ],
      attest: true,
    },
  ],
} as const;

const probeOutputSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    tool: { type: "string", const: "databard.probe" },
    serviceVersion: { type: "number" },
    generatedAt: { type: "string" },
    question: { type: "string" },
    summary: { type: "string", description: "Plain-text takeaway the calling agent can quote verbatim." },
    keyFindings: { type: "array", items: { type: "string" }, description: "Decision-relevant facts from the run (top pick, unreachable services, unreliable payers, cheapest option, attestation)." },
    nextStep: { type: "string", description: "The single recommended action — which service to pay, or what to do when nothing is reachable." },
    cost: {
      type: "object",
      properties: {
        priceUsd: { type: "string", description: "Price paid for this probe call." },
        outboundSpentUsd: { type: "number", description: "Actual USD DataBard spent probing paid candidates." },
        outboundCapUsd: { type: "number", description: "Hard cap on outbound spend per run." },
        cachedCount: { type: "number" },
        paidCount: { type: "number" },
      },
    },
    attestation: {
      type: "object",
      properties: {
        requested: { type: "boolean" },
        txHash: { type: "string", nullable: true, description: "X Layer transaction anchoring the verdict hash." },
        error: { type: "string", nullable: true },
      },
    },
    ranked: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rank: { type: "number" },
          name: { type: "string" },
          endpoint: { type: "string" },
          agentId: { type: "string" },
          score: { type: "number", minimum: 0, maximum: 100 },
          label: { type: "string", enum: ["excellent", "good", "fair", "poor", "unreachable"] },
          breakdown: {
            type: "object",
            properties: {
              schemaCompleteness: { type: "number" },
              latency: { type: "number" },
              freshness: { type: "number" },
              priceValue: { type: "number" },
              reliability: { type: "number" },
              credentials: { type: "number" },
            },
          },
          flags: { type: "array", items: { type: "string" } },
          reachable: { type: "boolean" },
          knownPriceUsd: { type: "number", nullable: true },
          payment: {
            type: "object",
            nullable: true,
            properties: {
              challengeReceived: { type: "boolean" },
              paid: { type: "boolean" },
              settlementTx: { type: "string" },
              amountUsd: { type: "number" },
              error: { type: "string" },
            },
          },
          error: { type: "string", nullable: true },
        },
      },
    },
  },
} as const;

const serviceScoreInputSchema = {
  type: "object",
  description:
    "Service lookup against the OKX.AI marketplace health index. Provide ANY ONE of: agentId, serviceId, endpoint/url, or query keywords. Envelopes ({arguments: {...}}) are unwrapped; common aliases accepted (agent_id, agent, id, service_id, url, q, question). Omit everything and you get an 'unknown' verdict with usage hints — this tool never errors on missing params.",
  properties: {
    agentId: { type: "string", description: "OKX.AI agent ID, e.g. \"2023\". Aliases: agent_id, agent, id." },
    serviceId: { type: "string", description: "Service listing ID. Alias: service_id." },
    endpoint: { type: "string", description: "The service endpoint URL. Alias: url." },
    query: { type: "string", description: "Free-text keywords, e.g. \"token security\". Aliases: q, question." },
  },
  examples: [
    { agentId: "2023" },
    { query: "token security" },
    { endpoint: "https://www.oklink.com/api/v5/explorer/mcp/x402/get_token_info" },
  ],
} as const;

const serviceScoreOutputSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    tool: { type: "string", const: "databard.service_score" },
    indexGeneratedAt: { type: "string", nullable: true },
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          verification: { type: "string", enum: ["none", "gate", "delivered", "failed"], description: "none = only the listing responds; gate = a valid request reached a decodable x402 challenge; delivered = a valid request got a substantive payload (free, or after payment); failed = paid but no substantive payload." },
          paid: { type: "boolean", description: "A real payment was made in the latest verification." },
          serviceId: { type: "string" },
          agentId: { type: "string" },
          agentName: { type: "string" },
          serviceName: { type: "string" },
          endpoint: { type: "string" },
          feeUsd: { type: "number" },
          score: { type: "number", minimum: 0, maximum: 100 },
          status: { type: "string", enum: ["healthy", "degraded", "unverified", "broken", "unreachable"] },
          flags: { type: "array", items: { type: "string" } },
          checks: { type: "object" },
          subScores: { type: "object", nullable: true, description: "availability / paymentIntegrity / delivery, each 0-100 or null = unknown." },
          uptimePct: { type: "number", nullable: true },
          lastPaidVerification: { type: "object", nullable: true, description: "Last paid verification (carried forward ≤72h), with settlement tx." },
          onchain: { type: "object", nullable: true, description: "ProbeVerdictRegistry address + serviceId — read scoreOf(serviceId) on X Layer." },
          badgeUrl: { type: "string" },
          pageUrl: { type: "string" },
        },
      },
    },
    verdict: {
      type: "string",
      enum: ["safe_to_pay", "caution", "avoid", "unknown"],
      description: "safe_to_pay = healthy listing; caution = degraded; avoid = broken/unreachable; unknown = not indexed.",
    },
    keyFindings: { type: "array", items: { type: "string" } },
    nextStep: { type: "string" },
    alternatives: { type: "array", items: { type: "object" }, description: "Top healthy alternatives by keyword overlap." },
  },
} as const;

const TOOLS = [
  {
    name: "databard_health_check",
    summary: "Compute a data health score, critical tables, and recommended actions for a schema. Free.",
    description:
      "Analyses a data source's schema metadata and returns a health score (0-100), failing/untested/stale/ownerless table counts, the critical tables whose failures cascade downstream, and prioritised recommended actions. No LLM script, no audio — the fast, free discovery tool.",
    method: "POST",
    endpoint: "/api/mcp/health-check",
    pricing: "free",
    inputSchema: connectionSchema,
    outputSchema: {
      ...healthOutputSchema,
      properties: {
        ...healthOutputSchema.properties,
        evidenceReceipt: {
          type: "object",
          description: "Unsigned, chain-neutral integrity receipt. Hash checks do not authenticate the issuer or prove analytical correctness. resultHash covers this response without evidenceReceipt; snapshotHash covers the JSON metadata snapshot (not embedded).",
          required: ["format", "version", "canonicalization", "hashAlgorithm", "payload", "payloadHash"],
          additionalProperties: false,
          properties: {
            format: { type: "string", const: "databard.evidence-receipt" },
            version: { type: "integer", const: 1 },
            canonicalization: { type: "string", const: "databard-json-v1" },
            hashAlgorithm: { type: "string", const: "sha256" },
            payload: { type: "object", additionalProperties: true },
            payloadHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          },
        },
      },
    },
  },
  {
    name: "databard_briefing",
    summary: "Marketplace Briefing: a narrated health briefing on OKX.AI agent services — per-service verdicts or the whole marketplace. Paid per call.",
    description:
      "DEFAULT (marketplace mode): a spoken briefing built from DataBard Probe's live health index of every OKX.AI marketplace service. Call with {} for the whole marketplace (status counts, paid-delivery headline, notable changes, top healthy services, provider issues) or scope it with agentIds/serviceIds/endpoints/query for per-service verdicts, what changed, and keep/watch/switch recommendations. Scoped briefings re-verify the named services live before answering (freshness: live/partial/cached) — pass fresh:false for the cached index. Returns summary, keyFindings, script, and narrated MP3 audio. " +
      "The machine verdict alone is free via databard_service_score — the briefing adds the narrative layer (summary, script, audio) for your human. " +
      "Legacy mode (mode:\"schema\", or an explicit schema source/schemaFqn): the original schema-health briefing on a data estate.",
    method: "POST",
    endpoint: "/api/mcp/briefing",
    pricing: "x402 pay-per-call (exact, USDT0 on X Layer eip155:196)",
    inputSchema: {
      ...connectionSchema,
      properties: {
        mode: {
          type: "string",
          enum: ["marketplace", "schema"],
          default: "marketplace",
          description:
            "\"marketplace\" (default) briefs on OKX.AI agent services from the Probe index. \"schema\" runs the legacy data-estate briefing — also selected automatically when a source/schemaFqn is given.",
        },
        agentIds: { type: "array", items: { type: "string" }, description: "OKX.AI agent ids to brief on, e.g. [\"2023\"]. Singular agentId also accepted." },
        serviceIds: { type: "array", items: { type: "string" }, description: "Marketplace service ids to brief on. Singular serviceId also accepted." },
        endpoints: { type: "array", items: { type: "string" }, description: "Service endpoint URLs to brief on. Singular endpoint also accepted." },
        query: {
          type: "string",
          description: "Keyword scope, e.g. \"token security\" — matches service/agent names and descriptions. need/q also accepted.",
        },
        fresh: {
          type: "boolean",
          default: true,
          description:
            "Scoped briefings only: re-verify the named services live before answering (default true — fresh evidence is the paid value; false forces the cached index). Whole-marketplace calls always use the cached index.",
        },
        researchQuestion: {
          type: "string",
          description:
            "Optional focus question (schema mode; treated as a query in marketplace mode). 8-240 chars recommended — never an error.",
        },
        outputFormat: { type: "string", enum: ["podcast", "executive-summary"], default: "podcast" },
        audio: {
          type: "string",
          enum: ["inline", "url", "none"],
          default: "none",
          description:
            "Audio delivery. \"none\" = text-only briefing (fastest; the default — the script, summary and keyFindings are always returned). \"url\" = hosted MP3 link (recommended when the human wants to listen). \"inline\" = base64 MP3 in the response (large and slow; only request it explicitly).",
        },
      },
      examples: [
        // Reviewer posture: bare call → whole-marketplace briefing.
        {},
        { agentIds: ["2023"], audio: "url" },
        { query: "token security", fresh: true, audio: "none" },
        { mode: "schema", demo: true, audio: "url" },
        {
          mode: "schema",
          source: "openmetadata",
          schemaFqn: "db.sales",
          openmetadata: { url: "http://your-openmetadata:8585/api", token: "<token>" },
          researchQuestion: "Which tables broke most recently and what should I fix first?",
        },
      ],
    },
    outputSchema: briefingOutputSchema,
  },
  {
    name: "databard_write_back",
    summary:
      "Write DataBard's findings back into the DataHub context graph: health + defect tags and an AI summary description. Free.",
    description:
      "Analyses a DataHub schema, then contributes back to the context graph: tags each table with its health band and defect tags (ownerless / untested / undocumented / stale) and optionally appends an AI summary to each dataset's description. Idempotent (marker blocks are stripped before re-appending). Requires source: \"datahub\".",
    method: "POST",
    endpoint: "/api/mcp/writeback",
    pricing: "free",
    inputSchema: writebackInputSchema,
    outputSchema: writebackOutputSchema,
  },
  {
    name: "databard_probe",
    summary: "Probe and rank A2MCP agent services before paying them. Paid per call via x402.",
    description:
      "DataBard Probe is a quality oracle for the agent economy: it probes candidate A2MCP endpoints (yours or the curated default set), measures schema completeness, latency, freshness, price-value, reliability, and optional Ligis credential verification, then returns a ranked verdict. DataBard pays any outbound x402 fees itself (capped at $0.15/run, 1-hour cache) and never fabricates results — unreachable services are reported honestly. Optionally anchors the verdict hash on X Layer.",
    method: "POST",
    endpoint: "/api/agent/probe",
    pricing: "x402 pay-per-call (exact, USDT0 on X Layer eip155:196), $0.25",
    inputSchema: probeInputSchema,
    outputSchema: probeOutputSchema,
  },
  {
    name: "databard_service_score",
    summary: "Look up an OKX.AI marketplace service's health score before paying it. Free.",
    description:
      "Answers 'should my agent pay this service?' using DataBard's public marketplace health index: every A2MCP listing checked periodically with a synthesized VALID request (built from the service's own input schema — MCP tools/list, the 402 challenge's declared inputs, or validation-error field names). We verify the endpoint answers, its x402 gate matches the advertised price, and — under a $1/day budget — whether paid calls actually deliver. Returns score, verification level, sub-scores, flags, and healthy alternatives. Free; never errors on missing params.",
    method: "POST",
    endpoint: "/api/mcp/service-score",
    pricing: "free",
    inputSchema: serviceScoreInputSchema,
    outputSchema: serviceScoreOutputSchema,
  },
  {
    name: "databard_fleet_briefing",
    summary: "Fleet 'town hall' briefing: lineage-aware cascade impact across the whole DataHub graph. Free.",
    description:
      "Reads every dataset in the DataHub context graph, computes transitive blast radius over lineage, and returns fleet health, top blast-radius risks, hotspots, and a two-host town-hall narration. Requires source: \"datahub\".",
    method: "POST",
    endpoint: "/api/fleet",
    pricing: "free",
    inputSchema: connectionSchema,
    outputSchema: fleetOutputSchema,
  },
];

export async function GET() {
  return NextResponse.json({
    ok: true,
    asp: "DataBard",
    description: "AI data analyst that synthesises a data estate into health scores, briefings, and recommended actions.",
    tools: TOOLS,
  });
}
