/**
 * Shared health-check runner for A2MCP REST (`/api/mcp/health-check`) and the
 * ChatGPT Streamable HTTP MCP surface (`/mcp` → `health_check`).
 */
import { createEvidenceReceipt, hashEvidence } from "@/lib/evidence-receipt";
import { analyzeSchema, generateActionItems } from "@/lib/schema-analysis";
import { parseMcpInput } from "@/lib/mcp";
import { fetchSchemaMetaLenient } from "@/lib/mcp-demo";
import { getMonidCost, MonidCliError } from "@/lib/monid-adapter";
import { ValidationError, rateLimit } from "@/lib/validation";

export const HEALTH_CHECK_TOOL = "databard.health-check";
export const SERVICE_VERSION = 2;

export const PRODUCT_ORIGIN = "https://databard.persidian.com";
export const PLANS_URL = `${PRODUCT_ORIGIN}/pro`;

export type HealthCheckUpgradeMode = "x402" | "chatgpt-informational";

export interface RunHealthCheckOptions {
  /** Rate-limit key source (IP headers). */
  req?: { headers: { get(name: string): string | null } };
  /**
   * How to describe the paid briefing follow-up.
   * - `x402`: OKX / agent marketplace (pay-per-call on product URLs)
   * - `chatgpt-informational`: no in-plugin checkout; link to plans / existing account
   */
  upgradeMode?: HealthCheckUpgradeMode;
}

export type HealthCheckSuccess = Record<string, unknown> & {
  ok: true;
  tool: typeof HEALTH_CHECK_TOOL;
  summary: string;
  keyFindings: string[];
};

export type HealthCheckFailure = {
  ok: false;
  error: string;
  kind?: string;
  status: number;
};

export type HealthCheckResult = HealthCheckSuccess | HealthCheckFailure;

function buildUpgrade(mode: HealthCheckUpgradeMode) {
  if (mode === "chatgpt-informational") {
    return {
      kind: "informational" as const,
      message:
        "A narrated two-host briefing (script + optional audio) is available on DataBard for accounts that already have access. Open the plans page to learn more or sign in with an existing paid account. Checkout and x402 payment are not available inside ChatGPT.",
      plansUrl: PLANS_URL,
      productUrl: PRODUCT_ORIGIN,
      includes: [
        "two-speaker briefing script (Alex + Morgan)",
        "optional narrated MP3",
        "trend narrative plus the health score and actions above",
      ],
    };
  }
  return {
    tool: "databard_briefing",
    endpoint: "/api/mcp/briefing",
    priceUsd: "1.00",
    includes: [
      "two-speaker briefing script (Alex + Morgan)",
      "narrated MP3 audio (url or inline)",
      "trend narrative plus the health score and actions above",
    ],
    howToCall:
      'POST the same body to /api/mcp/briefing (x402 pay-per-call, exact USDT0 on X Layer). Prefer audio "url" or "none" — "inline" base64 is unreadable context to a model.',
  };
}

/**
 * Run the free schema health analysis. Never throws for missing credentials —
 * unreachable sources degrade to a labelled demo fixture (see mcp-demo.ts).
 * Throws only ValidationError (rate limit / bad body shape) and hard MonidCliError.
 */
export async function runHealthCheck(
  body: unknown,
  opts: RunHealthCheckOptions = {},
): Promise<HealthCheckResult> {
  const upgradeMode = opts.upgradeMode ?? "x402";

  try {
    if (opts.req) {
      rateLimit(opts.req, { maxRequests: 60, windowMs: 3600000 });
    }

    let parsedBody: unknown = body ?? {};
    if (typeof parsedBody === "string") {
      try {
        parsedBody = JSON.parse(parsedBody);
      } catch {
        parsedBody = {};
      }
    }

    const { config, schemaFqn, forceDemo } = parseMcpInput(
      parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
        ? parsedBody
        : {},
    );

    const { meta, demo, connectionNotice } = await fetchSchemaMetaLenient(config, schemaFqn, {
      forceDemo,
    });
    const observedAt = new Date().toISOString();
    const insights = analyzeSchema(meta);
    const actions = generateActionItems(insights);

    const monidCost = config.source === "monid" ? getMonidCost(schemaFqn) : undefined;

    const topAction = actions[0];
    const summary =
      `${meta.name} scores ${insights.healthScore}/100 (${insights.healthLabel}): ` +
      `${insights.failingTests} failing test${insights.failingTests === 1 ? "" : "s"} across ${meta.tables.length} tables` +
      (insights.criticalTables.length
        ? `; highest risk: ${insights.criticalTables[0].table.name} (${insights.criticalTables[0].downstreamCount} downstream)`
        : "") +
      (topAction ? `. Start with: ${topAction.title}.` : ".");
    const keyFindings = [
      `Health score ${insights.healthScore}/100 — ${insights.healthLabel}`,
      `${insights.failingTests} failing / ${insights.totalTests} total quality tests (coverage ${insights.testCoverage}%)`,
      `${insights.staleTables.length} stale tables, doc coverage ${insights.docCoverage}%`,
      ...insights.criticalTables
        .slice(0, 2)
        .map(
          (ct) =>
            `Critical table ${ct.table.name}: ${ct.failingTests} failing tests, ${ct.downstreamCount} downstream dependents`,
        ),
    ].slice(0, 5);

    const response = {
      ok: true as const,
      tool: HEALTH_CHECK_TOOL,
      serviceVersion: SERVICE_VERSION,
      generatedAt: new Date().toISOString(),
      schemaFqn,
      schemaName: meta.name,
      ...(demo ? { demo: true, connectionNotice } : {}),
      summary,
      keyFindings,
      ...(topAction ? { nextStep: topAction.title } : {}),
      upgrade: buildUpgrade(upgradeMode),
      tableCount: meta.tables.length,
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
      staleTables: insights.staleTables.slice(0, 8).map((t) => ({
        name: t.name,
        hoursAgo: t.hoursAgo,
      })),
      recommendedActions: actions.slice(0, 12).map((a) => ({
        priority: a.priority,
        category: a.category,
        title: a.title,
        description: a.description,
        table: a.table,
        effort: a.effort,
      })),
      ...(monidCost ? { monidCost } : {}),
    };

    const result = JSON.parse(JSON.stringify(response)) as HealthCheckSuccess;
    const evidenceReceipt = createEvidenceReceipt({
      issuer: "databard",
      analysis: { tool: response.tool, serviceVersion: response.serviceVersion },
      generatedAt: response.generatedAt,
      request: { source: config.source, schemaFqn },
      evidence: {
        kind: "schema-metadata",
        source: demo ? "demo-fixture" : config.source,
        schemaFqn: meta.fqn,
        demo,
        observedAt,
        freshness: meta.tables.map((table) => ({
          table: table.fqn,
          reportedUpdatedAt: table.freshness ?? null,
        })),
        snapshotHash: hashEvidence(JSON.parse(JSON.stringify(meta))),
      },
      resultHash: hashEvidence(result),
    });
    return { ...result, evidenceReceipt };
  } catch (e) {
    if (e instanceof ValidationError) {
      const status = e.message.startsWith("Rate limit") ? 429 : 400;
      return { ok: false, error: e.message, status };
    }
    if (e instanceof MonidCliError && e.hard) {
      return { ok: false, error: e.message, kind: e.kind, status: 400 };
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg, status: 500 };
  }
}
