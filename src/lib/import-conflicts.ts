/**
 * Browser-local shared-key conflict check for CSV/TSV imports.
 * Groups records by the chosen key column (usually email) and flags groups
 * whose rows disagree on any other field. Nothing is sent anywhere, merged
 * or changed.
 */
import { parseCsv } from "./community-health";

export const IMPORT_CHECK_MAX_CHARS = 512_000;
export const IMPORT_CHECK_MAX_RECORDS = 5_000;
export const IMPORT_CHECK_MAX_COLUMNS = 100;

export interface ConflictGroup {
  /** Normalized group key (trimmed, lowercased cell value). */
  email: string;
  /** Row indices into the records array. */
  indices: number[];
  /** Column indices where rows in the group disagree (key column excluded). */
  differing: number[];
}

/** Groups records that share a trimmed, lowercased key value. */
export function groupConflicts(rows: string[][], emailIndex: number): ConflictGroup[] {
  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const k = r[emailIndex]?.trim().toLowerCase();
    if (k) {
      const g = groups.get(k);
      if (g) g.push(i);
      else groups.set(k, [i]);
    }
  });
  return [...groups.entries()]
    .filter(([, g]) => g.length > 1)
    .map(([email, indices]) => {
      const first = rows[indices[0]];
      const differing = first.flatMap((_, c) =>
        c !== emailIndex && indices.some((i) => rows[i][c] !== first[c]) ? [c] : [],
      );
      return { email, indices, differing };
    });
}

export type ImportParseResult =
  | { ok: true; header: string[]; rows: string[][] }
  | { ok: false; error: string };

/** True when the text contains a quote that opens but never closes. */
function hasUnterminatedQuote(text: string): boolean {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '"') continue;
    if (inQuotes) {
      if (text[i + 1] === '"') i++;
      else inQuotes = false;
    } else inQuotes = true;
  }
  return inQuotes;
}

/**
 * Validates and parses pasted/file text for the import check.
 * Rejects malformed or ambiguous input instead of guessing.
 */
export function parseImportCsv(text: string): ImportParseResult {
  if (!text.trim()) {
    return { ok: false, error: "Nothing to check — paste CSV data or pick a file first." };
  }
  if (text.length > IMPORT_CHECK_MAX_CHARS) {
    return {
      ok: false,
      error: `This file is ${text.length.toLocaleString("en-US")} characters — the limit is ${IMPORT_CHECK_MAX_CHARS.toLocaleString("en-US")}. Export a smaller slice and try again; nothing was truncated.`,
    };
  }
  if (hasUnterminatedQuote(text)) {
    return {
      ok: false,
      error: "A quoted field opens but never closes — fix the unmatched quote so fields line up.",
    };
  }
  const { header, rows } = parseCsv(text);
  if (header.length === 0) {
    return { ok: false, error: "Couldn't find a header row — the first line must name the columns." };
  }
  if (header.length > IMPORT_CHECK_MAX_COLUMNS) {
    return {
      ok: false,
      error: `This file has ${header.length} columns — the limit is ${IMPORT_CHECK_MAX_COLUMNS}. Re-export with fewer columns.`,
    };
  }
  if (header.some((h) => h.trim() === "")) {
    return { ok: false, error: "Every column needs a header — the first row has a blank column name." };
  }
  const seen = new Set<string>();
  let dupe: string | null = null;
  for (const h of header) {
    const k = h.trim().toLowerCase();
    if (seen.has(k)) { dupe = h; break; }
    seen.add(k);
  }
  if (dupe !== null) {
    return {
      ok: false,
      error: `Duplicate column header "${dupe}" — rename it so each column is unambiguous.`,
    };
  }
  if (rows.length === 0) {
    return { ok: false, error: "The file has a header but no records — add at least one data row." };
  }
  if (rows.length > IMPORT_CHECK_MAX_RECORDS) {
    return {
      ok: false,
      error: `This file has ${rows.length.toLocaleString("en-US")} records — the limit is ${IMPORT_CHECK_MAX_RECORDS.toLocaleString("en-US")}. Split the export and try again; nothing was truncated.`,
    };
  }
  const bad = rows.findIndex((r) => r.length !== header.length);
  if (bad !== -1) {
    return {
      ok: false,
      error: `Record ${bad + 1} has ${rows[bad].length} fields but the header has ${header.length} — fix the inconsistent row so the check reads the right columns.`,
    };
  }
  return { ok: true, header, rows };
}

const EMAIL_HEADER_RE = /e[\s_-]*mail/i;

/**
 * Indices of headers that look like an email column. 0 = none, 1 = unambiguous
 * default, >1 = ambiguous and the user must pick.
 */
export function emailColumnCandidates(header: string[]): number[] {
  return header.flatMap((h, i) => (EMAIL_HEADER_RE.test(h) ? [i] : []));
}
