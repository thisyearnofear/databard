// DataBard compare — the "since your last check" strip. A snapshot holds
// aggregates only (scores, counts, check states, column names); no cell
// value is ever stored, so a record stays safe to keep in Anna storage.
//
// The diff is deterministic on purpose: the model decides what the numbers
// mean (the purpose verdict), not what they are.

const DAY = 86_400_000;
const RANK = { fail: 0, partial: 1, pass: 2 };
const STATE_LABEL = { pass: "passing", partial: "partial", fail: "failing" };

/** Compact, row-free view of a report for comparison. */
export function snapshotOf(payload, at = Date.now()) {
  return {
    at,
    score: payload.score,
    label: payload.label,
    rows: payload.rowCount,
    columns: payload.columnCount,
    columnNames: payload.columns.map((c) => c.name),
    uniqueMembers: payload.derived?.uniqueMembers ?? null,
    contactable: payload.derived?.contactable ?? null,
    emptyCellsPercent: payload.derived?.emptyCellsPercent ?? null,
    checks: payload.checks.map((c) => ({ name: c.name, state: c.state })),
  };
}

const sameSheet = (a, b) => {
  const an = a?.columnNames ?? [];
  const bn = b?.columnNames ?? [];
  return an.length === bn.length && an.every((n, i) => n === bn[i]);
};

/**
 * Differences worth showing, newest first: score, members, contactable,
 * empty cells, then any check that changed state. Returns null when the
 * previous snapshot is missing, malformed, or of a different sheet — a
 * diff across two different lists would be a lie.
 */
export function diffSnapshots(prev, next) {
  if (!prev || !next || !Number.isFinite(prev.at) || !Number.isFinite(next.at)) return null;
  if (!sameSheet(prev, next)) return null;

  const days = Math.max(0, Math.round((next.at - prev.at) / DAY));
  const entries = [];
  const add = (key, label, from, to, good) => {
    if (from === to || from == null || to == null) return;
    entries.push({ key, label, from, to, delta: to - from, good });
  };

  add("score", "Score", prev.score, next.score, next.score >= prev.score);
  add("uniqueMembers", "Unique members", prev.uniqueMembers, next.uniqueMembers, next.uniqueMembers >= prev.uniqueMembers);
  add("contactable", "Contactable", prev.contactable, next.contactable, next.contactable >= prev.contactable);
  add("emptyCellsPercent", "Empty cells %", prev.emptyCellsPercent, next.emptyCellsPercent,
    next.emptyCellsPercent <= prev.emptyCellsPercent);

  const before = new Map((prev.checks ?? []).map((c) => [c.name, c.state]));
  for (const c of next.checks ?? []) {
    const was = before.get(c.name);
    if (!was || was === c.state) continue;
    entries.push({
      key: `check:${c.name}`,
      label: c.name,
      from: STATE_LABEL[was] ?? was,
      to: STATE_LABEL[c.state] ?? c.state,
      delta: (RANK[c.state] ?? 0) - (RANK[was] ?? 0),
      good: (RANK[c.state] ?? 0) > (RANK[was] ?? 0),
    });
  }

  return { days, entries, changed: entries.length > 0 };
}
