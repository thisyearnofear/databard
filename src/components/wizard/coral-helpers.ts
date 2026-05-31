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
    query: `SELECT number, title, state, created_at, user->>'login' as author, labels
FROM github.issues
WHERE owner = 'facebook' AND repo = 'react'
ORDER BY created_at DESC
LIMIT 15`,
  },
  {
    label: "GitHub PRs",
    description: "Recent pull requests with authors",
    query: `SELECT number, title, state, created_at, user->>'login' as author, merged_at
FROM github.pulls
WHERE owner = 'facebook' AND repo = 'react'
ORDER BY created_at DESC
LIMIT 15`,
  },
  {
    label: "Slack channels",
    description: "Workspace channels and activity",
    query: `SELECT name, purpose, num_members, created
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
    query: `SELECT number, title, state, created_at, user->>'login' as author, labels
FROM github.issues
WHERE owner = 'facebook' AND repo = 'react'
ORDER BY created_at DESC
LIMIT 15`,
  },
  {
    label: "GitHub PRs",
    description: "Recent pull requests with authors",
    query: `SELECT number, title, state, created_at, user->>'login' as author, merged_at
FROM github.pulls
WHERE owner = 'facebook' AND repo = 'react'
ORDER BY created_at DESC
LIMIT 15`,
  },
  {
    label: "Slack channels",
    description: "Workspace channels and activity",
    query: `SELECT name, purpose, num_members, created
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
