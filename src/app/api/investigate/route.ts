import { NextRequest, NextResponse } from "next/server";
import { executeGoal, getBestAgent } from "@/lib/agent";
import type { ActionItem } from "@/lib/schema-analysis";

/**
 * Investigate an action item using AI agent.
 * POST /api/investigate
 * Body: { actionItem: ActionItem, schemaName: string, source?: string }
 *
 * The agent researches the issue and returns steps to fix it,
 * relevant documentation links, and code snippets where applicable.
 */
export async function POST(req: NextRequest) {
  try {
    const { actionItem, schemaName, source } = await req.json() as {
      actionItem: ActionItem;
      schemaName: string;
      source?: string;
    };

    if (!actionItem?.title) {
      return NextResponse.json({ ok: false, error: "actionItem required" }, { status: 400 });
    }

    const provider = await getBestAgent();
    if (provider === "none") {
      // Fall back to LLM-generated guidance when no browser agent is available
      return generateGuidance(actionItem, schemaName, source);
    }

    // Build a research goal based on the action item
    const goal = buildResearchGoal(actionItem, schemaName, source);
    const searchUrl = buildSearchUrl(actionItem, source);

    const result = await executeGoal(goal, searchUrl);

    if (!result.success) {
      // Fall back to LLM guidance on agent failure
      return generateGuidance(actionItem, schemaName, source);
    }

    return NextResponse.json({
      ok: true,
      investigation: {
        summary: result.content.slice(0, 1500),
        source: result.source,
        provider: result.provider,
        actionItem: actionItem.id,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function buildResearchGoal(item: ActionItem, schema: string, source?: string): string {
  const platform = source === "dbt-cloud" || source === "dbt-local" ? "dbt" : "OpenMetadata";

  switch (item.category) {
    case "test":
      return item.title.startsWith("Fix")
        ? `Search for how to debug and fix failing ${platform} data quality tests. The specific issue: "${item.title}" in the ${schema} schema. Find the most relevant documentation or Stack Overflow answer explaining how to investigate and resolve this type of test failure. Summarize the key steps.`
        : `Search for how to add data quality tests in ${platform}. The goal: "${item.title}" in the ${schema} schema. Find documentation showing the exact syntax or UI steps to add not_null, unique, and accepted_values tests. Summarize with code examples.`;
    case "documentation":
      return `Search for best practices for documenting data warehouse tables in ${platform}. The goal: "${item.title}". Find guidance on writing effective table and column descriptions. Summarize with examples.`;
    case "ownership":
      return `Search for how to assign table owners in ${platform}. The goal: "${item.title}" in the ${schema} schema. Find the API endpoint or UI steps to set ownership. Summarize the process.`;
    case "governance":
      return `Search for PII data governance best practices in ${platform}. The issue: "${item.title}" in the ${schema} schema. Find guidance on access policies, data masking, and retention rules for PII columns. Summarize key recommendations.`;
    case "freshness":
      return `Search for how to debug stale data pipelines in ${platform}. The issue: "${item.title}" in the ${schema} schema. Find common causes of pipeline delays and how to investigate. Summarize troubleshooting steps.`;
    default:
      return `Search for how to resolve this data quality issue: "${item.title}" in the ${schema} schema using ${platform}. Find the most relevant documentation. Summarize the fix.`;
  }
}

function buildSearchUrl(item: ActionItem, source?: string): string {
  const platform = source === "dbt-cloud" || source === "dbt-local" ? "dbt" : "OpenMetadata";
  const query = encodeURIComponent(`${platform} ${item.title}`);
  return `https://www.google.com/search?q=${query}`;
}

/** LLM-generated guidance fallback when no browser agent is available */
async function generateGuidance(item: ActionItem, schema: string, source?: string) {
  const platform = source === "dbt-cloud" || source === "dbt-local" ? "dbt" : "OpenMetadata";
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      investigation: {
        summary: getStaticGuidance(item, platform),
        source: null,
        provider: "static",
        actionItem: item.id,
      },
    });
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `You are a data engineering assistant. Give concise, actionable guidance for fixing data quality issues. Use ${platform} terminology. Include specific commands, API calls, or UI steps. Keep it under 300 words. Use markdown formatting.` },
          { role: "user", content: `Schema: ${schema}\nIssue: ${item.title}\nDetails: ${item.description}\nCategory: ${item.category}\n\nHow do I fix this?` },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        return NextResponse.json({
          ok: true,
          investigation: { summary: content, source: null, provider: "llm", actionItem: item.id },
        });
      }
    }
  } catch { /* fall through to static */ }

  return NextResponse.json({
    ok: true,
    investigation: {
      summary: getStaticGuidance(item, platform),
      source: null,
      provider: "static",
      actionItem: item.id,
    },
  });
}

function getStaticGuidance(item: ActionItem, platform: string): string {
  switch (item.category) {
    case "test":
      return item.title.startsWith("Fix")
        ? `**Debugging failing tests in ${platform}:**\n\n1. Check the test definition to understand what it validates\n2. Query the table to find rows that violate the test condition\n3. Trace the issue upstream — is bad data coming from a source table?\n4. Fix the root cause (data pipeline, transformation logic, or update the test expectations)\n5. Re-run the test to verify the fix`
        : `**Adding tests in ${platform}:**\n\n1. Start with \`not_null\` tests on primary keys and required fields\n2. Add \`unique\` tests on columns that should have no duplicates\n3. Add \`accepted_values\` tests on status/enum columns\n4. Consider \`relationships\` tests for foreign key integrity\n5. Run tests to establish a baseline`;
    case "documentation":
      return `**Writing table documentation:**\n\n1. Describe what the table contains and its business purpose\n2. Document key columns — especially IDs, statuses, and calculated fields\n3. Note any important business rules or data quirks\n4. Include the update frequency and data source\n5. Add tags for discoverability`;
    case "ownership":
      return `**Assigning table owners:**\n\n1. Identify who is responsible for the data pipeline that populates each table\n2. Assign the team or individual as the owner in ${platform}\n3. Owners should be notified when tests fail or data goes stale\n4. Review ownership quarterly as teams change`;
    case "governance":
      return `**PII governance checklist:**\n\n1. Verify column-level access controls are in place\n2. Ensure PII columns are masked in non-production environments\n3. Check data retention policies comply with regulations (GDPR, CCPA)\n4. Audit who has accessed PII data recently\n5. Document the legal basis for storing each PII field`;
    case "freshness":
      return `**Investigating stale data:**\n\n1. Check the pipeline/DAG run history for failures or delays\n2. Look at upstream dependencies — is a source system down?\n3. Check for resource constraints (warehouse capacity, memory)\n4. Verify the schedule is correct (timezone issues are common)\n5. Set up alerts for freshness SLA violations`;
    default:
      return `Review the issue "${item.title}" and consult the ${platform} documentation for resolution steps.`;
  }
}
