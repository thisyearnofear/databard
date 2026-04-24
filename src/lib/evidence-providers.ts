import type { ConnectionConfig, EvidenceSourceContext, ResearchCitation, ResearchTrail } from "./types";
import { executeGoal, getBestAgent } from "./agent";

function resolveSourceUrl(config: ConnectionConfig): string | undefined {
  if (config.source === "openmetadata") return config.openmetadata?.url;
  if (config.source === "dbt-cloud") {
    const accountId = config.dbtCloud?.accountId;
    const projectId = config.dbtCloud?.projectId;
    return accountId && projectId ? `https://cloud.getdbt.com/#/accounts/${accountId}/projects/${projectId}/` : undefined;
  }
  if (config.source === "dbt-local") return config.dbtLocal?.manifestPath ? `file://${config.dbtLocal.manifestPath}` : undefined;
  if (config.source === "the-graph") return config.theGraph?.subgraphUrl;
  if (config.source === "dune") return config.dune?.namespace ? `https://dune.com/${config.dune.namespace}` : undefined;
  return undefined;
}

export function buildEvidenceContext(config: ConnectionConfig): EvidenceSourceContext {
  const labels: Record<ConnectionConfig["source"], string> = {
    openmetadata: "OpenMetadata catalog",
    "dbt-cloud": "dbt Cloud project",
    "dbt-local": "dbt local manifest",
    "the-graph": "The Graph subgraph",
    dune: "Dune workspace",
  };

  return {
    provider: config.source,
    sourceLabel: labels[config.source],
    sourceUrl: resolveSourceUrl(config),
  };
}

async function enrichCitation(
  citation: ResearchCitation,
  context: EvidenceSourceContext,
  browserAvailable: boolean,
  shouldVerify: boolean,
): Promise<ResearchCitation> {
  const base: ResearchCitation = {
    ...citation,
    sourceUrl: context.sourceUrl,
    verificationMode: context.sourceUrl ? "source-linked" : "generated",
  };

  if (!shouldVerify || !browserAvailable || !context.sourceUrl || !context.sourceUrl.startsWith("http")) {
    return base;
  }

  const result = await executeGoal(
    `Open ${context.sourceUrl} and verify this data evidence for ${context.sourceLabel}. Reference: ${citation.source} — ${citation.reference}. ${citation.detail ? `Detail: ${citation.detail}` : ""}`,
    context.sourceUrl
  );

  if (!result.success) {
    return base;
  }

  return {
    ...base,
    verificationMode: "browser-verified",
    verifiedBy: result.provider,
    verifiedAt: new Date().toISOString(),
    detail: citation.detail ? `${citation.detail} · Verified: ${result.content.slice(0, 180)}` : result.content.slice(0, 180),
  };
}

export async function enrichResearchTrail(trail: ResearchTrail, context?: EvidenceSourceContext): Promise<ResearchTrail> {
  if (!context) return trail;

  const browserAvailable = (await getBestAgent()) !== "none";
  const evidence = await Promise.all(
    trail.evidence.map(async (item) => ({
      ...item,
      citations: await Promise.all(item.citations.map((citation, citationIndex) => enrichCitation(citation, context, browserAvailable, citationIndex === 0))),
    }))
  );

  return { ...trail, evidence };
}
