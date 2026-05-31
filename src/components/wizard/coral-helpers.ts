/**
 * Shared Coral helpers — presets, validation, source extraction.
 * Used by both ConnectStep (main SQL editor) and SchemaPicker (inline editor).
 */

import type { DataSource } from "@/lib/types";

// ─── Preset queries ──────────────────────────────────────────────────────────
// Only use actual Coral bundled sources (github, slack, jira, linear, etc.)
// github.pulls requires WHERE owner AND repo (both required filters)

export interface CoralPreset {
  label: string;
  description: string;
  query: string;
}

export const ENTERPRISE_PRESETS: CoralPreset[] = [
  {
    label: "GitHub issues",
    description: "Recent issues from a popular repo",
    query: `SELECT number, title, state, created_at, user__login as author
FROM github.issues
WHERE owner = 'facebook' AND repo = 'react'
ORDER BY created_at DESC
LIMIT 15`,
  },
  {
    label: "GitHub PRs",
    description: "Recent pull requests with authors",
    query: `SELECT number, title, state, created_at, user__login as author, merged_at
FROM github.pulls
WHERE owner = 'facebook' AND repo = 'react'
ORDER BY created_at DESC
LIMIT 15`,
  },
  {
    label: "Slack channels",
    description: "Workspace channels and activity",
    query: `SELECT name, purpose, num_members
FROM slack.channels
ORDER BY num_members DESC
LIMIT 15`,
  },
  {
    label: "All sources",
    description: "See everything Coral can query",
    query: `SELECT schema_name, table_name
FROM coral.tables
ORDER BY schema_name, table_name`,
  },
];

export const WEB3_PRESETS: CoralPreset[] = [
  {
    label: "GitHub issues",
    description: "Recent issues from a popular repo",
    query: `SELECT number, title, state, created_at, user__login as author
FROM github.issues
WHERE owner = 'facebook' AND repo = 'react'
ORDER BY created_at DESC
LIMIT 15`,
  },
  {
    label: "GitHub PRs",
    description: "Recent pull requests with authors",
    query: `SELECT number, title, state, created_at, user__login as author, merged_at
FROM github.pulls
WHERE owner = 'facebook' AND repo = 'react'
ORDER BY created_at DESC
LIMIT 15`,
  },
  {
    label: "Slack channels",
    description: "Workspace channels and activity",
    query: `SELECT name, purpose, num_members
FROM slack.channels
ORDER BY num_members DESC
LIMIT 15`,
  },
  {
    label: "All sources",
    description: "See everything Coral can query",
    query: `SELECT schema_name, table_name
FROM coral.tables
ORDER BY schema_name, table_name`,
  },
];

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateCoralSql(query: string): { valid: boolean; hint?: string } {
  const trimmed = query.trim();
  if (!trimmed) return { valid: false, hint: "Query is empty" };
  if (!/\bSELECT\b/i.test(trimmed)) return { valid: false, hint: "Query should start with SELECT" };
  if (!/\bFROM\b/i.test(trimmed)) return { valid: false, hint: "Query needs a FROM clause" };
  if (!/\w+\.\w+/i.test(trimmed)) return { valid: false, hint: "Use source.table syntax (e.g. github.issues)" };
  return { valid: true };
}

// ─── Source extraction ───────────────────────────────────────────────────────

export function extractCoralSources(query: string): string[] {
  const sources = new Set<string>();
  const re = /(?:FROM|JOIN)\s+(\w+)\.\w+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    sources.add(m[1].toLowerCase());
  }
  return [...sources];
}

// ─── Error parsing ───────────────────────────────────────────────────────────

export function parseCoralError(error: string): { message: string; hint?: string; action?: string } {
  if (/ENOENT|not found|command not found|coral: not found/i.test(error)) {
    return {
      message: "Coral CLI not found",
      hint: "Install Coral to run cross-source queries locally.",
      action: "brew install withcoral/tap/coral",
    };
  }
  if (/ECONNREFUSED|ETIMEDOUT|fetch failed|Gateway error|network/i.test(error)) {
    return {
      message: "Coral gateway unreachable",
      hint: "Check that CORAL_GATEWAY_URL is correct and the gateway is running.",
    };
  }
  if (/timeout|timed out/i.test(error)) {
    return {
      message: "Query timed out",
      hint: "Try a simpler query or increase CORAL_TIMEOUT_MS.",
    };
  }
  if (/source.*not.*configured|unknown source/i.test(error)) {
    const sourceMatch = error.match(/source[:\s]+['"]?(\w+)['"]?/i);
    return {
      message: `Source "${sourceMatch?.[1] ?? "unknown"}" not configured`,
      hint: "This source hasn't been connected yet. Try a different template.",
    };
  }
  if (/not found.*table|table.*not found/i.test(error)) {
    return {
      message: "Table not found",
      hint: "Check the table name or try the 'Coral catalog' template to see available tables.",
    };
  }
  return { message: error };
}

// ─── Preset lookup by persona ────────────────────────────────────────────────

export function getPresetsForPersona(persona: string): CoralPreset[] {
  return persona === "web3" ? WEB3_PRESETS : ENTERPRISE_PRESETS;
}

// ─── Data-aware question presets ─────────────────────────────────────────────
// Derives meaningful research questions from the actual query results,
// so users get relevant prompts instead of generic ones.

export function getDataAwarePresets(
  query: string,
  columns: Array<{ name: string; dataType: string }>,
  sources: string[],
): string[] {
  const colNames = columns.map((c) => c.name.toLowerCase());
  const hasState = colNames.some((c) => c === "state" || c === "status");
  const hasDate = colNames.some((c) => c.includes("date") || c.includes("created") || c.includes("updated") || c.includes("ts") || c.includes("time"));
  const hasAuthor = colNames.some((c) => c.includes("author") || c.includes("user") || c.includes("login") || c.includes("name"));
  const hasNumeric = columns.some((c) => c.dataType === "number" || c.dataType === "integer" || c.dataType === "bigint");
  const hasText = colNames.some((c) => c.includes("title") || c.includes("text") || c.includes("description") || c.includes("purpose"));
  const hasLabels = colNames.some((c) => c.includes("label") || c.includes("tag") || c.includes("category"));

  const presets: string[] = [];

  // Source-specific
  if (sources.includes("github")) {
    presets.push("What are the most active issues?");
    if (hasAuthor) presets.push("Who are the top contributors?");
    if (hasState) presets.push("How many items are still open?");
    if (hasDate) presets.push("What's the recent activity trend?");
  } else if (sources.includes("slack")) {
    presets.push("What channels are most active?");
    if (hasDate) presets.push("What's the posting pattern?");
    presets.push("Which channels need more engagement?");
  } else {
    // Generic data-aware presets
    if (hasText) presets.push("What are the key themes in this data?");
    if (hasAuthor) presets.push("Who are the most active contributors?");
    if (hasDate) presets.push("What trends do we see over time?");
  }

  // Column-type-based
  if (hasNumeric) presets.push("What do the numbers tell us?");
  if (hasLabels) presets.push("What are the most common categories?");
  if (hasState) presets.push("What's the current status breakdown?");

  // Always available
  presets.push("Summarize the key findings");

  // Deduplicate and limit
  return [...new Set(presets)].slice(0, 4);
}
