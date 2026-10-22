/**
 * Community data health — deterministic checks for the CSV every community
 * lead has (member lists, RSVP exports, sponsor trackers). No LLM, no keys,
 * no connectors: paste rows, get a scored health report the same way the
 * schema rubric scores a warehouse.
 *
 * Built for the Expedite London community hackathon (Oct 22) as a Tier-0
 * zero-friction source; lives on as /community.
 */

export type ColumnKind = "email" | "date" | "url" | "number" | "text";

export interface ColumnReport {
  name: string;
  kind: ColumnKind;
  completeness: number; // 0-100
  distinct: number;
  samples: string[];
}

export type CheckState = "pass" | "partial" | "fail";

export interface CommunityCheck {
  id: string;
  name: string;
  state: CheckState;
  detail: string;
}

export interface CommunityReport {
  score: number;
  label: "healthy" | "at-risk" | "critical";
  rowCount: number;
  columnCount: number;
  checks: CommunityCheck[];
  columns: ColumnReport[];
  findings: string[];
  actions: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;

/** Minimal CSV parser: comma/semicolon/tab autodetect, quoted fields, CRLF. */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const sample = text.slice(0, 4000);
  const firstLine = sample.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const delim = ["\t", ";", ","].find((d) => firstLine.includes(d)) ?? ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));

  const [header = [], ...data] = rows;
  return { header, rows: data };
}

function inferKind(values: string[]): ColumnKind {
  const nonEmpty = values.filter((v) => v !== "");
  if (nonEmpty.length === 0) return "text";
  const sample = nonEmpty.slice(0, 50);
  const ratio = (pred: (v: string) => boolean) => sample.filter(pred).length / sample.length;
  if (ratio((v) => EMAIL_RE.test(v)) >= 0.7) return "email";
  if (ratio((v) => URL_RE.test(v)) >= 0.7) return "url";
  if (ratio((v) => !isNaN(Number(v)) && v !== "") >= 0.8) return "number";
  if (ratio((v) => !isNaN(new Date(v).getTime()) && /\d{4}|\/|-/.test(v)) >= 0.7) return "date";
  return "text";
}

function latestDateMs(values: string[]): number | null {
  let max: number | null = null;
  for (const v of values) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (!isNaN(t) && t > 1_000_000_000_000 && (max === null || t > max)) max = t;
  }
  return max;
}

export function analyzeCommunityData(header: string[], rows: string[][]): CommunityReport {
  const columnCount = header.length;
  const rowCount = rows.length;
  const columns: ColumnReport[] = header.map((name, i) => {
    const values = rows.map((r) => r[i] ?? "");
    const nonEmpty = values.filter((v) => v !== "");
    const kind = inferKind(values);
    return {
      name: name || `column_${i + 1}`,
      kind,
      completeness: rowCount > 0 ? Math.round((nonEmpty.length / rowCount) * 100) : 0,
      distinct: new Set(nonEmpty.map((v) => v.toLowerCase())).size,
      samples: [...new Set(nonEmpty)].slice(0, 3),
    };
  });

  const checks: CommunityCheck[] = [];
  const findings: string[] = [];
  const actions: string[] = [];
  let deductions = 0;

  // 1. Enough signal to work with
  if (rowCount < 3 || columnCount < 2) {
    checks.push({ id: "volume", name: "Enough data to assess", state: "fail", detail: `${rowCount} rows × ${columnCount} columns — too thin to score honestly` });
    deductions += 30;
    findings.push("The sheet is too thin to say much — 3+ rows and 2+ columns needed.");
  } else {
    checks.push({ id: "volume", name: "Enough data to assess", state: "pass", detail: `${rowCount} rows × ${columnCount} columns` });
  }

  // 2. Identity: can you tell members apart?
  const lower = header.map((h) => h.toLowerCase());
  const nameCol = columns[lower.findIndex((h) => /(^|[^a-z])(name|member|first)/.test(h))];
  const emailCols = columns.filter((c) => c.kind === "email" || /e-?mail/.test(c.name.toLowerCase()));
  const hasIdentity = Boolean(nameCol) || emailCols.length > 0;
  checks.push({
    id: "identity", name: "Member identity present",
    state: hasIdentity ? "pass" : "fail",
    detail: hasIdentity ? `${nameCol ? `name column "${nameCol.name}"` : ""}${nameCol && emailCols.length ? " + " : ""}${emailCols.map((c) => `email column "${c.name}"`).join(", ")}` : "no name or email column found",
  });
  if (!hasIdentity) {
    deductions += 20;
    findings.push("No name or email column — you can't tell members apart or contact them.");
    actions.push("Add at least an email column; it unlocks contact and dedupe.");
  }

  // 3. Completeness
  const totalCells = rowCount * columnCount;
  const filled = columns.reduce((n, c) => n + Math.round((c.completeness / 100) * rowCount), 0);
  const completeness = totalCells > 0 ? Math.round((filled / totalCells) * 100) : 0;
  const worst = [...columns].sort((a, b) => a.completeness - b.completeness)[0];
  checks.push({
    id: "completeness", name: "Fields filled in",
    state: completeness >= 90 ? "pass" : completeness >= 70 ? "partial" : "fail",
    detail: `${completeness}% of cells filled${worst && worst.completeness < 70 ? ` — worst: "${worst.name}" at ${worst.completeness}%` : ""}`,
  });
  if (completeness < 90) {
    deductions += Math.min(25, Math.round((90 - completeness) * 0.8));
    findings.push(`${100 - completeness}% of the sheet is empty${worst ? ` — "${worst.name}" is the biggest hole (${worst.completeness}% full)` : ""}.`);
    if (worst) actions.push(`Backfill "${worst.name}" or drop the column — dead columns hide real gaps.`);
  }

  // 4. Duplicates (on email columns)
  let dupCount = 0;
  for (const c of emailCols) {
    const idx = columns.indexOf(c);
    const seen = new Map<string, number>();
    for (const r of rows) {
      const v = (r[idx] ?? "").toLowerCase().trim();
      if (v) seen.set(v, (seen.get(v) ?? 0) + 1);
    }
    dupCount += [...seen.values()].filter((n) => n > 1).reduce((n, c2) => n + c2 - 1, 0);
  }
  checks.push({
    id: "duplicates", name: "No duplicate members",
    state: emailCols.length === 0 ? "partial" : dupCount === 0 ? "pass" : dupCount <= Math.max(1, rowCount * 0.05) ? "partial" : "fail",
    detail: emailCols.length === 0 ? "no email column to dedupe on" : dupCount === 0 ? "no duplicate emails" : `${dupCount} duplicate email${dupCount === 1 ? "" : "s"}`,
  });
  if (dupCount > 0) {
    deductions += Math.min(20, Math.round((dupCount / Math.max(rowCount, 1)) * 100));
    findings.push(`${dupCount} duplicate email${dupCount === 1 ? "" : "s"} — your member count is overstated.`);
    actions.push("Merge duplicates before reporting membership numbers to sponsors.");
  }

  // 5. Contactable (valid email format)
  if (emailCols.length > 0) {
    const c = emailCols[0];
    const idx = columns.indexOf(c);
    const vals = rows.map((r) => r[idx] ?? "").filter((v) => v !== "");
    const invalid = vals.filter((v) => !EMAIL_RE.test(v)).length;
    const validRate = vals.length > 0 ? Math.round(((vals.length - invalid) / vals.length) * 100) : 0;
    checks.push({
      id: "contactable", name: "Emails are deliverable-shaped",
      state: validRate >= 95 ? "pass" : validRate >= 80 ? "partial" : "fail",
      detail: invalid === 0 ? "all emails look valid" : `${invalid} of ${vals.length} emails look malformed (${validRate}% valid)`,
    });
    if (validRate < 95) {
      deductions += Math.min(15, Math.round((95 - validRate) * 0.75));
      findings.push(`${invalid} malformed email${invalid === 1 ? "" : "s"} — newsletters to these will bounce.`);
      actions.push("Fix or remove malformed emails before the next send.");
    }
  }

  // 6. Freshness (newest dated entry)
  const dateCols = columns.filter((c) => c.kind === "date");
  if (dateCols.length > 0) {
    let latest: number | null = null;
    for (const c of dateCols) {
      const idx = columns.indexOf(c);
      const m = latestDateMs(rows.map((r) => r[idx] ?? ""));
      if (m !== null && (latest === null || m > latest)) latest = m;
    }
    if (latest !== null) {
      const daysAgo = Math.round((Date.now() - latest) / 86_400_000);
      checks.push({
        id: "freshness", name: "Recently active",
        state: daysAgo <= 90 ? "pass" : daysAgo <= 180 ? "partial" : "fail",
        detail: daysAgo === 0 ? "newest entry is today" : `newest dated entry is ${daysAgo} day${daysAgo === 1 ? "" : "s"} old`,
      });
      if (daysAgo > 90) {
        deductions += daysAgo > 180 ? 20 : 10;
        findings.push(`The newest entry is ${daysAgo} days old — the list may have quietly stopped being maintained.`);
        actions.push(daysAgo > 180 ? "Rebuild the capture flow: where do new members land today?" : "Check the export isn't stale — re-export from the source of truth.");
      }
    }
  } else {
    checks.push({ id: "freshness", name: "Recently active", state: "partial", detail: "no date columns found — freshness can't be measured" });
    findings.push("No date columns (joined / last attended) — you can't see whether the community is growing or stalling.");
    actions.push("Add a joined-at date; growth-over-time is the number sponsors ask for first.");
  }

  const score = Math.max(0, Math.min(100, 100 - deductions));
  const label = score >= 80 ? "healthy" : score >= 50 ? "at-risk" : "critical";
  if (actions.length === 0) actions.push("Keep this export fresh — monthly is enough.");

  return { score, label, rowCount, columnCount, checks, columns, findings, actions };
}

/** Demo sample — deliberately imperfect, so the report has something to say. */
export const SAMPLE_CSV = `name,email,city,joined_at,attended_last,notes
Amara Osei,amara.osei@gmail.com,London,2026-08-14,yes,
Ben Clarke,ben.clarke@outlook.com,London,2026-08-20,yes,wants to speak at next event
Chloe Tan,chloe.tan@gmail.com,London,2026-09-02,no,
Dev Patel,devpatel@,London,2026-09-05,yes,email bounced last time
Amara Osei,amara.osei@gmail.com,London,2026-09-11,yes,duplicate from the September form
Fatima Noor,fatima.noor@gmail.com,Manchester,2026-09-19,no,
George Iqbal,george.iqbal@yahoo.com,London,,yes,
Hana Suzuki,hana.suzuki@gmail.com,London,2026-10-01,yes,brings two friends usually
Ivan Petrov,ivan.petrov@gmail.com,London,2026-10-03,no,
Jade Williams,jade.williams@gmail.com,Bristol,2026-05-22,no,"moved teams, might be inactive"`.trim();
