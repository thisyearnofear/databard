"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PixelIcon } from "@/components/dither-kit";
import { track } from "@/lib/track";
import {
  groupConflicts,
  parseImportCsv,
  emailColumnCandidates,
  IMPORT_CHECK_MAX_CHARS,
  type ConflictGroup,
} from "@/lib/import-conflicts";

const SAMPLE_CSV = `Name,Email,Team
Sam Kim,sam@example.test,North
Sam Kim,sam@example.test,North
Alex Dean,house@example.test,Junior
Jo Dean,house@example.test,Senior`;

const GROUP_PAGE_SIZE = 5;
const RECORDS_PER_VIEW = 12;
const FIELDS_PER_VIEW = 12;

type Parsed = { header: string[]; rows: string[][] };
type Source = "sample" | "paste" | "file";
type Mode = "sample" | "input" | "result";

const SAMPLE_PARSED = parseImportCsv(SAMPLE_CSV);

export default function ImportCheckPage() {
  const [mode, setMode] = useState<Mode>("sample");
  const [raw, setRaw] = useState("");
  const [source, setSource] = useState<Source>("sample");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(
    SAMPLE_PARSED.ok ? { header: SAMPLE_PARSED.header, rows: SAMPLE_PARSED.rows } : null,
  );
  const [emailIndex, setEmailIndex] = useState<number>(SAMPLE_PARSED.ok ? 1 : -1);
  const [result, setResult] = useState<{ groups: ConflictGroup[]; records: number } | null>(
    SAMPLE_PARSED.ok
      ? { groups: groupConflicts(SAMPLE_PARSED.rows, 1), records: SAMPLE_PARSED.rows.length }
      : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<{
    parsed: Parsed;
    emailIndex: number;
    result: { groups: ConflictGroup[]; records: number };
    source: Source;
    fileName: string | null;
    raw: string;
  } | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [needsKey, setNeedsKey] = useState(false);
  const [changingKey, setChangingKey] = useState(false);
  const [shownGroups, setShownGroups] = useState(GROUP_PAGE_SIZE);
  const [shownMatching, setShownMatching] = useState(GROUP_PAGE_SIZE);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (mode === "input") textareaRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (mode === "result") summaryRef.current?.focus();
  }, [mode]);

  const emailCandidates = useMemo(
    () => (parsed ? emailColumnCandidates(parsed.header) : []),
    [parsed],
  );

  const review = result?.groups.filter((g) => g.differing.length > 0) ?? [];
  const matching = result?.groups.filter((g) => g.differing.length === 0) ?? [];

  function invalidate() {
    requestId.current += 1;
    setParsed(null);
    setResult(null);
    setEmailIndex(-1);
    setNeedsKey(false);
    setChangingKey(false);
    setShownGroups(GROUP_PAGE_SIZE);
    setShownMatching(GROUP_PAGE_SIZE);
  }

  function analyse(text: string, src: Source, opts: { emit: boolean; forcedIndex?: number; fileName?: string }) {
    const id = ++requestId.current;
    setResult(null);
    setShownGroups(GROUP_PAGE_SIZE);
    setShownMatching(GROUP_PAGE_SIZE);
    const p = parseImportCsv(text);
    if (id !== requestId.current) return;
    if (!p.ok) {
      setParsed(null);
      setEmailIndex(-1);
      setNeedsKey(false);
      setError(p.error);
      return;
    }
    setParsed(p);
    const candidates = emailColumnCandidates(p.header);
    const idx =
      opts.forcedIndex !== undefined
        ? opts.forcedIndex
        : candidates.length === 1
          ? candidates[0]
          : -1;
    setEmailIndex(idx);
    if (idx === -1) {
      setNeedsKey(true);
      setError(
        candidates.length > 1
          ? "More than one column looks like an email field — pick the key to group by."
          : "Pick the column to group by.",
      );
      return;
    }
    setNeedsKey(false);
    setChangingKey(false);
    setError(null);
    setSource(src);
    const r = { groups: groupConflicts(p.rows, idx), records: p.rows.length };
    setResult(r);
    setDataVersion((v) => v + 1);
    setSavedResult({
      parsed: p,
      emailIndex: idx,
      result: r,
      source: src,
      fileName: opts.fileName ?? null,
      raw: text,
    });
    setMode(src === "sample" ? "sample" : "result");
    if (opts.emit) track("import_check_run", { source: src });
  }

  function openInput(prefill: string | null) {
    invalidate();
    setMode("input");
    setError(null);
    if (prefill !== null) setRaw(prefill);
  }

  function onEdit(text: string) {
    invalidate();
    setRaw(text);
    setSource("paste");
    setFileName(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onFile(f: File | null) {
    if (!f) return;
    const id = ++requestId.current;
    setMode("input");
    setSource("file");
    setParsed(null);
    setResult(null);
    setEmailIndex(-1);
    setNeedsKey(false);
    setShownGroups(GROUP_PAGE_SIZE);
    setShownMatching(GROUP_PAGE_SIZE);
    if (f.size > IMPORT_CHECK_MAX_CHARS) {
      setRaw("");
      setFileName(null);
      setMode("input");
      setError(
        `"${f.name}" is ${f.size.toLocaleString("en-US")} bytes — the limit is ${IMPORT_CHECK_MAX_CHARS.toLocaleString("en-US")} characters (about 500 KB). Export a smaller slice; nothing was truncated.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (id !== requestId.current) return;
      const text = String(reader.result ?? "");
      setRaw(text);
      setFileName(f.name);
      analyse(text, "file", { emit: true, fileName: f.name });
    };
    reader.onerror = () => {
      if (id !== requestId.current) return;
      setRaw("");
      setFileName(null);
      setMode("input");
      setError(`Couldn't read "${f.name}".`);
    };
    reader.readAsText(f);
  }

  function reset() {
    invalidate();
    setMode("sample");
    setRaw("");
    setSource("sample");
    setFileName(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    analyse(SAMPLE_CSV, "sample", { emit: true, forcedIndex: 1 });
    setMode("sample");
  }

  const provenance =
    mode === "sample"
      ? "Fictional sample"
      : source === "file" && fileName
        ? `Your file · ${fileName}`
        : "Pasted data";

  return (
    <main className="report-surface min-h-screen flex flex-col items-center p-4 sm:p-8 gap-6 max-w-3xl mx-auto enter-up">
      <div className="w-full">
        <Link href="/community" className="inline-flex items-center py-1.5 text-sm text-[var(--text-muted)] no-underline hover:text-[var(--text)]">← Back to community check</Link>
      </div>

      <div className="space-y-3 w-full">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-display">
          Same email, different people?
        </h1>
        <p className="text-[var(--text-muted)]">Spot records your CRM might merge by mistake.</p>
      </div>

      {mode === "input" ? (
        <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="import-check-csv" className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              CSV or TSV — stays on this device
            </label>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              max {IMPORT_CHECK_MAX_CHARS.toLocaleString("en-US")} chars · 5,000 records · 100 columns
            </span>
          </div>
          <textarea
            ref={textareaRef}
            id="import-check-csv"
            value={raw}
            onChange={(e) => onEdit(e.target.value)}
            spellCheck={false}
            rows={7}
            placeholder={"name,email\nAmara,amara@example.com\n..."}
            className="w-full font-mono text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            aria-label="Paste CSV or TSV data"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                analyse(raw, "paste", {
                  emit: true,
                  forcedIndex: emailIndex >= 0 ? emailIndex : undefined,
                })
              }
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] text-white font-semibold text-sm px-4 py-2.5 hover:opacity-90"
            >
              <PixelIcon name="check" size={13} /> Run the check
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] text-sm px-3 py-2.5 text-[var(--text)] hover:border-[var(--text-muted)]"
            >
              <PixelIcon name="folder" size={13} /> Choose .csv / .tsv
            </button>
            <button
              onClick={() => {
                if (savedResult) {
                  requestId.current += 1;
                  setParsed(savedResult.parsed);
                  setEmailIndex(savedResult.emailIndex);
                  setResult(savedResult.result);
                  setSource(savedResult.source);
                  setFileName(savedResult.fileName);
                  setRaw(savedResult.raw);
                  setNeedsKey(false);
                  setChangingKey(false);
                  setError(null);
                  setMode(savedResult.source === "sample" ? "sample" : "result");
                } else reset();
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] text-sm px-3 py-2.5 text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)]"
            >
              {savedResult && savedResult.source !== "sample" ? "Back to results" : "Back to sample"}
            </button>
          </div>
          {parsed && needsKey && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="import-check-column" className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Group by column
              </label>
              <select
                id="import-check-column"
                value={emailIndex}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setEmailIndex(idx);
                  if (idx >= 0) analyse(raw, source === "file" ? "file" : "paste", { emit: true, forcedIndex: idx });
                }}
                className="font-mono text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value={-1}>— choose a column —</option>
                {parsed.header.map((h, i) => (
                  <option key={i} value={i}>
                    {h}{emailCandidates.includes(i) ? " (looks like email)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
          <p className="text-[11px] text-[var(--text-muted)]">
            Nothing is merged or changed. This checks only this file, not records already in your CRM.
          </p>
        </div>
      ) : (
        <>
          {result && parsed && (
            <section className="w-full flex flex-col gap-5" aria-label="Check results">
              <div className="flex flex-col gap-1">
                <p className="font-mono text-[11px] text-[var(--text-muted)]">
                  {provenance} · {result.records.toLocaleString("en-US")} records checked
                </p>
                {mode === "result" && (
                  <p className="font-mono text-[11px] text-[var(--text-muted)]">
                    Grouped by “{parsed.header[emailIndex]}” ·{" "}
                    <button onClick={() => setChangingKey((v) => !v)} className="underline hover:text-[var(--text)]">Change</button>
                    {" · "}
                    <button onClick={() => openInput(raw)} className="underline hover:text-[var(--text)]">Edit data</button>
                    {" · "}
                    <button onClick={() => fileRef.current?.click()} className="underline hover:text-[var(--text)]">Different file</button>
                    {" · "}
                    <button onClick={reset} className="underline hover:text-[var(--text)]">Back to sample</button>
                  </p>
                )}
                {mode === "result" && changingKey && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Group by column"
                      value={emailIndex}
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        setEmailIndex(idx);
                        if (idx >= 0) analyse(raw, source === "file" ? "file" : "paste", { emit: true, forcedIndex: idx });
                      }}
                      className="font-mono text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      {parsed.header.map((h, i) => (
                        <option key={i} value={i}>
                          {h}{emailCandidates.includes(i) ? " (looks like email)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <h2 ref={summaryRef} tabIndex={-1} className="text-xl font-semibold outline-none">
                  {result.groups.length === 0
                    ? "No repeated values"
                    : review.length > 0
                      ? `${review.length} ${review.length === 1 ? "group" : "groups"} to review`
                      : "Nothing to review"}
                </h2>
                {result.groups.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">
                    Blank keys are skipped. No repeated nonblank values in the selected column.
                  </p>
                )}
              </div>

              {review.length > 0 && <p className="text-sm font-medium text-[var(--text)]">Review before merging.</p>}

              {review.slice(0, shownGroups).map((g, gi) => (
                <ConflictCard key={`${dataVersion}-${gi}`} group={g} rows={parsed.rows} header={parsed.header} emailIndex={emailIndex} />
              ))}

              {review.length > shownGroups && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-[var(--text-muted)]">
                    Showing {shownGroups} of {review.length} groups — all were analysed.
                  </p>
                  <button
                    onClick={() => setShownGroups((n) => n + GROUP_PAGE_SIZE)}
                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] text-sm px-4 py-2 text-[var(--text)] hover:border-[var(--accent)]"
                  >
                    <PixelIcon name="chevronDown" size={13} /> Show {Math.min(GROUP_PAGE_SIZE, review.length - shownGroups)} more
                  </button>
                </div>
              )}

              {matching.length > 0 && (
                <details className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 group">
                  <summary className="text-sm font-semibold cursor-pointer list-none flex items-center gap-2">
                    <PixelIcon name="chevronDown" size={13} className="text-[var(--text-muted)]" />
                    {matching.length} {matching.length === 1 ? "group" : "groups"} with matching fields
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <p className="text-xs text-[var(--text-muted)]">
                      Matching fields are not proof that two records describe the same person. Review before changing your import.
                    </p>
                    {matching.slice(0, shownMatching).map((g, i) => (
                      <MatchingGroup key={`${dataVersion}-m${i}`} group={g} rows={parsed.rows} header={parsed.header} emailIndex={emailIndex} />
                    ))}
                    {matching.length > shownMatching && (
                      <button
                        onClick={() => setShownMatching((n) => n + GROUP_PAGE_SIZE)}
                        className="self-start inline-flex items-center gap-2 rounded-lg border border-[var(--border)] text-xs px-3 py-2 text-[var(--text)] hover:border-[var(--accent)]"
                      >
                        <PixelIcon name="chevronDown" size={11} /> Show {Math.min(GROUP_PAGE_SIZE, matching.length - shownMatching)} more matching groups
                      </button>
                    )}
                  </div>
                </details>
              )}

              <div className="flex flex-col items-center gap-2 pt-2">
                <button
                  onClick={() => { setRaw(""); openInput(null); }}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] text-white font-semibold text-sm px-5 py-3 hover:opacity-90"
                >
                  <PixelIcon name="folder" size={13} /> Check my file
                </button>
                <p className="text-xs text-[var(--text-muted)]">Stays on this device. Nothing is changed.</p>
              </div>
            </section>
          )}
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </main>
  );
}

/** Compact conflict summary: key + representative differing values + collapsed full compare. */
function ConflictCard({
  group: g,
  rows,
  header,
  emailIndex,
}: {
  group: ConflictGroup;
  rows: string[][];
  header: string[];
  emailIndex: number;
}) {
  const [compareOpen, setCompareOpen] = useState(false);
  const first = g.indices[0];
  const previewFields = g.differing.slice(0, 2);
  const second = g.indices.find((i) =>
    previewFields.some((c) => rows[i][c] !== rows[first][c]),
  );
  const repIdx = second === undefined ? [first] : [first, second];
  const omittedFields = g.differing.length - previewFields.length;
  const omittedRecords = g.indices.length - repIdx.length;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold font-mono">{g.email}</h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {g.indices.length} records
        </span>
      </div>
      <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
        <table className="text-xs font-mono border-collapse min-w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {previewFields.map((c) => (
                <th key={c} className="text-left px-3 py-2 text-[var(--text-muted)] font-normal whitespace-nowrap">{header[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {repIdx.map((ri) => (
              <tr key={ri} className="border-b border-[var(--border)] last:border-0">
                {previewFields.map((c) => (
                  <td key={c} className="px-3 py-2 whitespace-nowrap text-[var(--text)]">{rows[ri][c] || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(omittedFields > 0 || omittedRecords > 0) && (
        <p className="text-[10px] font-mono text-[var(--text-muted)]">
          Preview shows {previewFields.length} of {g.differing.length} differing fields
          {omittedRecords > 0 ? ` and 2 of ${g.indices.length} records` : ""} — open Compare records for the rest.
        </p>
      )}
      <details className="group" onToggle={(e) => setCompareOpen(e.currentTarget.open)}>
        <summary className="text-xs text-[var(--accent)] cursor-pointer list-none inline-flex items-center gap-1.5">
          <PixelIcon name="chevronDown" size={11} /> Compare records
        </summary>
        {compareOpen && (
          <div className="mt-3">
            <GroupTable group={g} rows={rows} header={header} emailIndex={emailIndex} />
          </div>
        )}
      </details>
    </div>
  );
}

function MatchingGroup({
  group: g,
  rows,
  header,
  emailIndex,
}: {
  group: ConflictGroup;
  rows: string[][];
  header: string[];
  emailIndex: number;
}) {
  const [compareOpen, setCompareOpen] = useState(false);
  return (
    <div className="border border-[var(--border)] rounded-lg p-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-mono text-[var(--text)]">{g.email}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {g.indices.length} records · other fields match
        </span>
      </div>
      <details className="group" onToggle={(e) => setCompareOpen(e.currentTarget.open)}>
        <summary className="text-xs text-[var(--accent)] cursor-pointer list-none inline-flex items-center gap-1.5">
          <PixelIcon name="chevronDown" size={11} /> Compare records
        </summary>
        {compareOpen && (
          <div className="mt-3">
            <GroupTable group={g} rows={rows} header={header} emailIndex={emailIndex} />
          </div>
        )}
      </details>
    </div>
  );
}

/** Full field×record table with bounded record and field paging. */
function GroupTable({
  group: g,
  rows,
  header,
  emailIndex,
}: {
  group: ConflictGroup;
  rows: string[][];
  header: string[];
  emailIndex: number;
}) {
  const [recordStart, setRecordStart] = useState(0);
  const [fieldStart, setFieldStart] = useState(0);

  // Group key first, then differing fields, then the rest.
  const ordered = [
    emailIndex,
    ...header.map((_, c) => c).filter((c) => c !== emailIndex && g.differing.includes(c)),
    ...header.map((_, c) => c).filter((c) => c !== emailIndex && !g.differing.includes(c)),
  ];
  const fields = ordered.slice(fieldStart, fieldStart + FIELDS_PER_VIEW);
  const view = g.indices.slice(recordStart, recordStart + RECORDS_PER_VIEW);

  return (
    <div className="flex flex-col gap-2">
      {(g.indices.length > RECORDS_PER_VIEW || header.length > FIELDS_PER_VIEW) && (
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-[var(--text-muted)]">
          {g.indices.length > RECORDS_PER_VIEW && (
            <span className="inline-flex items-center gap-2">
              <button
                onClick={() => setRecordStart((s) => Math.max(0, s - RECORDS_PER_VIEW))}
                disabled={recordStart === 0}
                className="rounded border border-[var(--border)] px-2 py-1 text-[var(--text)] disabled:opacity-40"
              >
                ← Prev
              </button>
              Showing {recordStart + 1}–{recordStart + view.length} of {g.indices.length} records
              <button
                onClick={() => setRecordStart((s) => s + RECORDS_PER_VIEW)}
                disabled={recordStart + RECORDS_PER_VIEW >= g.indices.length}
                className="rounded border border-[var(--border)] px-2 py-1 text-[var(--text)] disabled:opacity-40"
              >
                Next →
              </button>
            </span>
          )}
          {header.length > FIELDS_PER_VIEW && (
            <span className="inline-flex items-center gap-2">
              <button
                onClick={() => setFieldStart((s) => Math.max(0, s - FIELDS_PER_VIEW))}
                disabled={fieldStart === 0}
                className="rounded border border-[var(--border)] px-2 py-1 text-[var(--text)] disabled:opacity-40"
              >
                ← Fields
              </button>
              fields {fieldStart + 1}–{Math.min(fieldStart + FIELDS_PER_VIEW, header.length)} of {header.length}
              <button
                onClick={() => setFieldStart((s) => s + FIELDS_PER_VIEW)}
                disabled={fieldStart + FIELDS_PER_VIEW >= header.length}
                className="rounded border border-[var(--border)] px-2 py-1 text-[var(--text)] disabled:opacity-40"
              >
                Fields →
              </button>
            </span>
          )}
        </div>
      )}
      <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
        <table className="text-xs font-mono border-collapse min-w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-3 py-2 text-[var(--text-muted)] font-normal whitespace-nowrap">field</th>
              {view.map((ri) => (
                <th key={ri} className="text-left px-3 py-2 text-[var(--text-muted)] font-normal whitespace-nowrap">
                  record {ri + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((c) => {
              const differs = g.differing.includes(c);
              const isGroupKey = c === emailIndex;
              const groupKeyVariant = isGroupKey && new Set(g.indices.map((i) => rows[i][c])).size > 1;
              return (
                <tr key={c} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-2 text-[var(--text)] whitespace-nowrap">
                    {header[c]}
                    <span className="block text-[10px] text-[var(--text-muted)]">
                      {differs
                        ? "different — review"
                        : groupKeyVariant
                          ? "same after trim + lowercase"
                          : isGroupKey
                            ? "grouped by this field"
                            : "same"}
                    </span>
                  </td>
                  {view.map((ri) => (
                    <td
                      key={ri}
                      className={`px-3 py-2 whitespace-nowrap ${differs ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}`}
                    >
                      {rows[ri][c] || <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
