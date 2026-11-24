// DataBard repair — deterministic cleaning of the pasted sheet, in the
// window. Nothing here is sent anywhere: it takes the parsed header/rows,
// returns a cleaned copy plus a change log. The log carries counts and
// column names only, never a cell value, so it is safe to save alongside
// the reading.
//
// This is the answer to "checks too limited to offer useful data-specific
// repair guidance": the advice names the column and the number of rows it
// touches, and the person gets the fixed file, without rows leaving the
// iframe.

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_COL = /^(e[\s_-]?mail|email address|contact email|work email)$/i;

/** Index of the first column that looks like an email column, or -1. */
export function emailColumnIndex(header) {
  const i = header.findIndex((h) => EMAIL_COL.test(String(h ?? "").trim()));
  return i;
}

/** Lowercase, trim, and strip `mailto:` / angle brackets. Does not validate. */
export function normaliseEmail(value) {
  return String(value ?? "")
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^<+/, "")
    .replace(/>+$/, "")
    .trim()
    .toLowerCase();
}

function rowSignature(cells) {
  return cells.map((c) => c.trim().toLowerCase()).join("\u0001");
}

function pad(cells, width) {
  const out = cells.slice(0, width);
  while (out.length < width) out.push("");
  return out;
}

/** Quote a CSV cell only when it needs it. */
export function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise header + rows back to CSV (CRLF, the Excel-safe default). */
export function toCsv(header, rows) {
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

/**
 * Clean the sheet and describe what changed.
 *
 * Order matters: trim → drop empty rows → normalise emails → dedupe.
 * Dedupe keys on the normalised email when the sheet has one (so
 * `Ada@Example.org` and `ada@example.org` are the same member), otherwise
 * on the whole row. First occurrence wins.
 */
export function planRepair(header, rows) {
  const width = header.length;
  const cleanHeader = header.map((h) => String(h ?? "").trim());
  const emailIdx = emailColumnIndex(cleanHeader);

  const changes = [];
  const push = (kind, column, count, text) => {
    if (count > 0) changes.push({ kind, column, count, text });
  };

  const beforeRows = rows.length;
  const beforeCells = rows.reduce((n, r) => n + r.length, 0);

  // 1. trim every cell, pad ragged rows to the header width
  let trimmed = 0;
  const padded = rows.map((r) => {
    const cells = pad(r, width).map((c) => String(c ?? "").trim());
    for (let i = 0; i < cells.length; i += 1) {
      if (cells[i] !== String(r[i] ?? "")) trimmed += 1;
    }
    return cells;
  });
  push("trim", null, trimmed, `Trimmed ${trimmed} cell${trimmed === 1 ? "" : "s"} of stray whitespace`);

  // 2. drop rows that are empty across every column
  const nonEmpty = padded.filter((cells) => cells.some((c) => c !== ""));
  const emptyDropped = padded.length - nonEmpty.length;
  push("empty", null, emptyDropped, `Dropped ${emptyDropped} empty row${emptyDropped === 1 ? "" : "s"}`);

  // 3. normalise the email column
  let emailsNormalised = 0;
  let emailsInvalid = 0;
  if (emailIdx >= 0) {
    for (const cells of nonEmpty) {
      const raw = cells[emailIdx];
      if (!raw) continue;
      const next = normaliseEmail(raw);
      if (next !== raw) {
        cells[emailIdx] = next;
        emailsNormalised += 1;
      }
      if (next && !EMAIL_SHAPE.test(next)) emailsInvalid += 1;
    }
    const name = cleanHeader[emailIdx] || "email";
    push("email", name, emailsNormalised, `Normalised ${emailsNormalised} address${emailsNormalised === 1 ? "" : "es"} in "${name}"`);
    push(
      "invalid-email",
      name,
      emailsInvalid,
      `Left ${emailsInvalid} address${emailsInvalid === 1 ? "" : "es"} in "${name}" that still ${emailsInvalid === 1 ? "does" : "do"} not look like an email`,
    );
  }

  // 4. dedupe — by email when present, otherwise by whole row
  const seen = new Set();
  const unique = [];
  let duplicates = 0;
  for (const cells of nonEmpty) {
    const key = emailIdx >= 0 && cells[emailIdx]
      ? `e:${cells[emailIdx]}`
      : `r:${rowSignature(cells)}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    unique.push(cells);
  }
  push(
    "duplicate",
    emailIdx >= 0 ? cleanHeader[emailIdx] || "email" : null,
    duplicates,
    emailIdx >= 0
      ? `Removed ${duplicates} duplicate row${duplicates === 1 ? "" : "s"} by "${cleanHeader[emailIdx] || "email"}"`
      : `Removed ${duplicates} exact duplicate row${duplicates === 1 ? "" : "s"}`,
  );

  const afterCells = unique.reduce((n, r) => n + r.filter((c) => c !== "").length, 0);
  // "invalid-email" is a note, not a fix — it does not count as a change
  const fixes = changes.filter((c) => c.kind !== "invalid-email").length;
  const changed = fixes > 0;
  const notes = changes.length - fixes;

  return {
    header: cleanHeader,
    rows: unique,
    csv: toCsv(cleanHeader, unique),
    changes,
    changed,
    summary: changed
      ? `${fixes} fix${fixes === 1 ? "" : "es"} applied · ${beforeRows} → ${unique.length} rows`
      : notes > 0
        ? `No automatic fix — ${notes} thing${notes === 1 ? "" : "s"} still need${notes === 1 ? "s" : ""} a person`
        : "Nothing to repair — the sheet is already clean",
    before: { rows: beforeRows, filledCells: beforeCells },
    after: { rows: unique.length, filledCells: afterCells },
    duplicateCount: duplicates,
    emptyDropped,
  };
}
