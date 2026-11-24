// DataBard — Anna App bundle entry. DOM + host wiring only; scoring lives
// in the generated community-health.js, the model layer in reading.js,
// persistence in recovery.js. Rows never leave this file — the model only
// sees reportPayload() output.

import {
  parseCsv,
  analyzeCommunityData,
  verdictFor,
  SAMPLES,
} from "./community-health.js";
import { reportPayload, readReport, TONES, PURPOSES, PURPOSE_LABELS, quotaMessage } from "./reading.js";
import { planRepair } from "./repair.js";
import { snapshotOf, diffSnapshots } from "./compare.js";
import {
  readActiveTask,
  writeCheckpoint,
  clearCheckpoint,
  saveReading,
  readLastReading,
} from "./recovery.js";
import { withTimeout } from "./session.js";
import { drawGauge, drawMeter, icon, scoreDitherColor, clamp01 } from "./dither.js";

const SDK_URL = "/static/anna-apps/_sdk/latest/index.js";
// Localhost test hook: the fake host sets __DATABARD_BOOT_WATCHDOG_MS via
// ?watchdogms= so startup-failure cases do not need real 8s waits.
const bootMs = () => globalThis.__DATABARD_BOOT_WATCHDOG_MS ?? 8_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 50_000;

const $ = (id) => document.getElementById(id);
const els = {
  startupPanel: $("startup-panel"),
  startupMessage: $("startup-message"),
  startupRetry: $("btn-startup-retry"),
  startupHelp: $("startup-help"),
  root: $("root"),
  resumeBanner: $("resume-banner"),
  resumeText: $("resume-text"),
  btnResume: $("btn-resume"),
  btnStartOver: $("btn-start-over"),
  btnDiscard: $("btn-discard-checkpoint"),
  screens: {
    input: $("screen-input"),
    run: $("screen-run"),
    result: $("screen-result"),
    error: $("screen-error"),
  },
  csv: $("csv-input"),
  file: $("file-input"),
  samples: $("sample-buttons"),
  inputError: $("input-error"),
  toneStraight: $("tone-straight"),
  toneRoast: $("tone-roast"),
  purposeBtns: [...document.querySelectorAll(".purpose")],
  btnRun: $("btn-run"),
  feed: $("run-feed"),
  gauge: $("score-gauge"),
  scorePill: $("score-pill"),
  scoreDetail: $("score-detail"),
  doc: $("result-doc"),
  btnCopy: $("btn-copy"),
  btnAgain: $("btn-again"),
  repairBlock: $("repair-block"),
  repairSummary: $("repair-summary"),
  repairChanges: $("repair-changes"),
  btnRepairCopy: $("btn-repair-copy"),
  btnRepairDownload: $("btn-repair-download"),
  repairStatus: $("repair-status"),
  btnCancelRun: $("btn-cancel-run"),
  saveWarn: $("save-warn"),
  btnSaveRetry: $("btn-save-retry"),
  btnReadingRetry: $("btn-reading-retry"),
  lastCard: $("last-reading-card"),
  lastLine: $("last-reading-line"),
  btnLast: $("btn-last-reading"),
  errorMessage: $("error-message"),
  btnErrorRetry: $("btn-error-retry"),
  btnErrorHome: $("btn-error-home"),
};

let anna = null;
let activeRunId = null;
let tone = "straight";
let purpose = null; // required — Run refuses without it
let lastContext = null; // {payload, tone, purpose} for Retry
let currentResult = null; // record for copy
let cleanCsv = null; // cleaned copy of the sheet in this session only
let cleanKey = null; // record.at the cleaned copy belongs to
let lastRecord = null;
let pendingRecord = null;

function showScreen(name) {
  for (const [key, el] of Object.entries(els.screens)) el.hidden = key !== name;
}

function showError(message) {
  els.errorMessage.textContent = message;
  showScreen("error");
}

function scoreToneClass(score) {
  return score >= 80 ? "good" : score >= 50 ? "warn" : "bad"; // same thresholds as score-tone.ts
}

function sinceAgo(days) {
  return days <= 0 ? "earlier today" : days === 1 ? "yesterday" : `${days} days ago`;
}

const CHECK_ICON = { pass: "pass", partial: "warning", fail: "fail" };

/** Paint the score gauge once — sweep unless reduced motion. */
function paintGaugeOnce(score) {
  const canvas = els.gauge;
  const c = canvas?.getContext("2d");
  if (!c) return;
  const size = { width: canvas.width, height: canvas.height };
  const opts = { color: scoreDitherColor(score), ticks: [50, 80], max: 100 };
  const target = clamp01(score / 100);
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    drawGauge(c, size, target, opts);
    return;
  }
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / 900);
    drawGauge(c, size, target * (1 - (1 - p) ** 3), opts);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** A dithered completeness meter per column — drawn at rest. */
function meterCanvas(pct) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 8;
  canvas.className = "meter";
  const c = canvas.getContext("2d");
  drawMeter(c, { width: 96, height: 8 }, 1,
    { value: pct, color: scoreDitherColor(pct), max: 100 });
  return canvas;
}

/** Steps render `"column"` names as mono chips. */
function stepNode(text) {
  const li = el("li", "step");
  const parts = text.split(/"([^"]+)"/g);
  parts.forEach((part, i) => {
    if (i % 2 === 1) li.append(el("code", "chip", part));
    else if (part) li.append(document.createTextNode(part));
  });
  return li;
}

// ── startup ─────────────────────────────────────────────────────────────

function startupFail(message) {
  els.startupMessage.textContent = message;
  els.startupRetry.hidden = false;
  els.startupHelp.hidden = false;
}

async function connectHost() {
  const { AnnaAppRuntime } = await import(SDK_URL);
  return withTimeout(AnnaAppRuntime.connect(), bootMs(), "connecting to the host");
}

async function boot() {
  els.startupRetry.hidden = true;
  els.startupHelp.hidden = true;
  els.startupMessage.textContent = "Opening the workbench…";
  try {
    anna = await connectHost();
  } catch {
    startupFail("Could not reach the host.");
    return;
  }

  let task = { status: "none" };
  try {
    task = await withTimeout(readActiveTask(anna), bootMs(), "reading your saved work");
  } catch {
    startupFail("Could not read your saved work.");
    return;
  }

  try { anna.window?.set_title?.({ title: "DataBard" }); } catch { /* cosmetic */ }

  els.startupPanel.hidden = true;
  els.root.hidden = false;
  wire();
  wireEntryPayload();

  if (task.status === "valid") offerResume(task.checkpoint);
  else if (task.status === "corrupt") offerCorrupt();

  showScreen("input");
  refreshLast();
}

function wireEntryPayload() {
  const apply = (p) => {
    if (p && typeof p === "object") {
      if (TONES.includes(p.tone)) setTone(p.tone);
      if (PURPOSES.includes(p.purpose)) setPurpose(p.purpose);
    }
  };
  try {
    if (anna.entryPayload) apply(anna.entryPayload);
    anna.on?.("entry_payload", apply);
  } catch { /* payload wiring is best-effort */ }
}

// ── resume ──────────────────────────────────────────────────────────────

function offerResume(cp) {
  els.resumeText.textContent =
    "A reading was cut off after scoring — the report is kept, resume at the model call?";
  els.btnResume.hidden = false;
  els.btnStartOver.hidden = false;
  els.btnDiscard.hidden = false;
  els.resumeBanner.hidden = false;
  els.btnResume.onclick = () => {
    els.resumeBanner.hidden = true;
    lastContext = { payload: cp.payload, tone: cp.tone, purpose: cp.purpose };
    runReading(cp.payload, cp.tone, cp.purpose);
  };
  els.btnStartOver.onclick = async () => {
    els.resumeBanner.hidden = true;
    await clearCheckpoint(anna).catch(() => {});
  };
  els.btnDiscard.onclick = els.btnStartOver.onclick;
}

function offerCorrupt() {
  els.resumeText.textContent =
    "A saved run could not be read — it has been left untouched; you can discard it.";
  els.btnResume.hidden = true;
  els.btnStartOver.hidden = true;
  els.btnDiscard.hidden = false;
  els.resumeBanner.hidden = false;
  els.btnDiscard.onclick = async () => {
    els.resumeBanner.hidden = true;
    await clearCheckpoint(anna).catch(() => {});
  };
}

// ── input ───────────────────────────────────────────────────────────────

function setTone(t) {
  tone = t;
  els.toneStraight.classList.toggle("on", t === "straight");
  els.toneRoast.classList.toggle("on", t === "roast");
}

function setPurpose(p) {
  purpose = p;
  for (const b of els.purposeBtns) b.classList.toggle("on", b.dataset.purpose === p);
}

function inputError(msg) {
  els.inputError.textContent = msg;
  els.inputError.hidden = !msg;
}

function wire() {
  els.startupRetry.onclick = () => boot();
  els.toneStraight.onclick = () => setTone("straight");
  els.toneRoast.onclick = () => setTone("roast");
  for (const b of els.purposeBtns) b.onclick = () => setPurpose(b.dataset.purpose);
  els.btnAgain.onclick = () => showScreen("input");
  els.btnReadingRetry.onclick = () => {
    if (lastContext) runReading(lastContext.payload, lastContext.tone, lastContext.purpose, lastContext.repair);
  };
  els.btnCancelRun.onclick = () => { activeRunId = null; showScreen("input"); };
  els.btnSaveRetry.onclick = async () => {
    if (!pendingRecord) return;
    try {
      await saveReading(anna, pendingRecord);
      pendingRecord = null;
      els.saveWarn.hidden = true;
    } catch { /* keep the warning up */ }
  };
  els.btnErrorHome.onclick = () => showScreen("input");
  els.btnErrorRetry.onclick = () => {
    if (lastContext) runReading(lastContext.payload, lastContext.tone, lastContext.purpose, lastContext.repair);
    else showScreen("input");
  };
  els.btnLast.onclick = () => { if (lastRecord) renderResult(lastRecord); };
  els.btnRepairCopy.onclick = copyCleanCsv;
  els.btnRepairDownload.onclick = downloadCleanCsv;
  els.btnCopy.onclick = () => {
    if (!currentResult) return;
    navigator.clipboard?.writeText(resultAsText(currentResult)).then(
      () => { els.btnCopy.textContent = "Copied"; setTimeout(() => (els.btnCopy.textContent = "Copy as text"), 1500); },
      () => {},
    );
  };

  els.file.addEventListener("change", async () => {
    inputError("");
    const f = els.file.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      inputError("That file is over 5 MB — export a smaller sheet.");
      els.file.value = "";
      return;
    }
    const text = await f.text();
    const { rows } = parseCsv(text);
    if (rows.length > MAX_ROWS) {
      inputError(`That sheet has ${rows.length.toLocaleString()} rows — over the 50,000 row limit.`);
      els.file.value = "";
      return;
    }
    els.csv.value = text;
  });

  for (const s of SAMPLES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sample-btn";
    b.textContent = s.name;
    b.title = s.blurb;
    b.onclick = () => { els.csv.value = s.csv; inputError(""); };
    els.samples.append(b);
  }

  els.btnRun.onclick = () => {
    inputError("");
    const text = els.csv.value;
    if (!text.trim()) {
      inputError("Paste a sheet or pick a sample first.");
      return;
    }
    const { header, rows } = parseCsv(text);
    if (rows.length > MAX_ROWS) {
      inputError(`That sheet has ${rows.length.toLocaleString()} rows — over the 50,000 row limit.`);
      return;
    }
    if (!purpose) {
      inputError("Pick what the list is for first — the reading is written for that purpose.");
      return;
    }
    const report = analyzeCommunityData(header, rows);
    const payload = reportPayload(report);
    const repair = planRepair(header, rows);
    lastContext = { payload, tone, purpose, repair };
    runReading(payload, tone, purpose, repair);
  };
}

// ── run ─────────────────────────────────────────────────────────────────

async function runReading(payload, runTone, runPurpose, repair = null) {
  const runId = `run-${Date.now()}`;
  activeRunId = runId;
  els.feed.replaceChildren();
  feed("scored", `${payload.score} / 100 — ${payload.label}; ${payload.rowCount} rows × ${payload.columnCount} columns`);
  if (repair?.changed) feed("repaired", repair.summary);
  showScreen("run");

  // The cleaned copy lives in this session only — the record carries the
  // change log (counts and column names), never a row.
  cleanCsv = repair?.csv ?? null;
  cleanKey = null;
  const repairSummary = repair
    ? {
        summary: repair.summary,
        changes: repair.changes,
        before: repair.before,
        after: repair.after,
        duplicateCount: repair.duplicateCount,
        emptyDropped: repair.emptyDropped,
      }
    : null;

  // Compare with the previous saved check of the same sheet. The diff is
  // computed here; it rides inside the model payload so its numbers may be
  // cited — and audited — like any other report figure. A different sheet
  // yields no diff rather than a meaningless one.
  const prev = await readLastReading(anna).catch(() => null);
  const since = prev?.payload
    ? diffSnapshots(snapshotOf(prev.payload, prev.at), snapshotOf(payload))
    : null;
  if (since) {
    feed("since", since.changed
      ? `${since.entries.length} change${since.entries.length === 1 ? "" : "s"} since your check ${sinceAgo(since.days)}`
      : `same sheet as your check ${sinceAgo(since.days)} — nothing moved`);
  }

  try {
    await writeCheckpoint(anna, { v: 1, id: runId, stage: "reading", tone: runTone, purpose: runPurpose, payload }).catch(() => {});
    feed("drafting", `asking the model for a reading for ${PURPOSE_LABELS[runPurpose] ?? "this purpose"}`);
    const out = await readReport(anna, since ? { ...payload, sinceLast: since } : payload, runTone, runPurpose);
    if (activeRunId !== runId) return;

    const record = {
      payload,
      reading: out.reading,
      narrated: out.narrated,
      tone: runTone,
      purpose: runPurpose,
      at: Date.now(),
      repair: repairSummary,
      sinceLast: since,
    };
    cleanKey = record.at;
    try {
      await saveReading(anna, record);
      await clearCheckpoint(anna);
      pendingRecord = null;
      els.saveWarn.hidden = true;
    } catch {
      // the result still renders; offer a retry-save under it
      pendingRecord = record;
      els.saveWarn.hidden = false;
    }

    currentResult = record;
    renderResult(record);
    refreshLast();
  } catch (e) {
    if (activeRunId !== runId) return;
    const quota = quotaMessage(e);
    if (quota) {
      // the deterministic report is the honest result — show it with the
      // quota numbers and a Retry instead of an error screen
      const record = { payload, reading: null, narrated: false, tone: runTone, purpose: runPurpose, at: Date.now(), quotaNote: quota, repair: repairSummary, sinceLast: since };
      currentResult = record;
      renderResult(record);
      return;
    }
    showError(`The run failed — ${e?.message ?? "something went wrong"}.`);
  }
}

function feed(tag, text) {
  const row = document.createElement("div");
  row.className = "feed-row";
  const t = document.createElement("span");
  t.className = "kicker";
  t.textContent = tag;
  const s = document.createElement("span");
  s.className = "feed-note";
  s.textContent = text;
  row.append(t, s);
  els.feed.append(row);
}

// ── result ──────────────────────────────────────────────────────────────

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderResult(record) {
  const { payload, reading, narrated } = record;
  els.btnReadingRetry.hidden = !record.quotaNote;
  els.scorePill.textContent = `${payload.score}`;
  els.scorePill.className = `score-num ${scoreToneClass(payload.score)}`;
  els.scoreDetail.textContent = `${payload.label} · ${payload.rowCount} rows × ${payload.columnCount} columns`;
  paintGaugeOnce(payload.score);
  els.doc.replaceChildren();

  // the reading is the hero
  if (narrated && reading) {
    els.doc.append(el("h2", "reading-head", reading.headline));
    if (reading.verdict) {
      // the model's purpose verdict — the call the score alone cannot make
      els.doc.append(el("span", "kicker", `Verdict — ${PURPOSE_LABELS[record.purpose] ?? "this purpose"}`));
      els.doc.append(el("p", "verdict-line", reading.verdict));
    }
    els.doc.append(el("span", "kicker", "What you can say"));
    els.doc.append(el("p", "pull-quote", reading.claim));
    els.doc.append(el("span", "kicker warn", "What goes wrong as-is"));
    els.doc.append(el("p", "risk-line", reading.risk));
    if (reading.priority?.length) {
      // the model's ordering over the report's own checks — a decision,
      // not a narration, and audited against the check list above
      els.doc.append(el("span", "kicker", "Fix in this order"));
      const ol = el("ol", "steps");
      for (const p of reading.priority) {
        const li = el("li", "step");
        li.append(el("code", "chip", p.check), document.createTextNode(` ${p.why}`));
        ol.append(li);
      }
      els.doc.append(ol);
      els.doc.append(el("span", "kicker", "How"));
      const ul = el("ul", "plain");
      for (const st of reading.steps) ul.append(stepNode(st));
      els.doc.append(ul);
    } else {
      els.doc.append(el("span", "kicker", "Fix in this order"));
      const ol = el("ol", "steps");
      for (const st of reading.steps) ol.append(stepNode(st));
      els.doc.append(ol);
    }
  } else {
    els.doc.append(el("h2", "", payload.verdict));
    els.doc.append(el("p", "unnarrated", record.quotaNote ?? "The reading could not be checked against your numbers, so it is not shown."));
  }

  renderSince(record);

  // deterministic checks + columns sit below as the evidence
  els.doc.append(el("hr", "rule"));
  els.doc.append(el("span", "kicker", "Checks"));
  for (const c of payload.checks) {
    const row = el("div", "check-row");
    const ic = el("span", `check-state ${c.state}`);
    ic.append(icon(CHECK_ICON[c.state] ?? "partial", 12));
    row.append(ic);
    const d = el("span", "check-detail");
    d.append(el("span", "", `${c.name} — `), el("span", "", c.detail));
    row.append(d);
    els.doc.append(row);
  }

  if (payload.findings.length || payload.actions.length) {
    els.doc.append(el("hr", "rule"));
    if (payload.findings.length) {
      els.doc.append(el("span", "kicker", "Findings"));
      const ul = el("ul", "plain");
      for (const f of payload.findings) ul.append(el("li", "", f));
      els.doc.append(ul);
    }
    if (payload.actions.length) {
      els.doc.append(el("span", "kicker", "Actions"));
      const ul = el("ul", "plain");
      for (const a of payload.actions) ul.append(el("li", "", a));
      els.doc.append(ul);
    }
  }

  els.doc.append(el("hr", "rule"));
  els.doc.append(el("span", "kicker", `Columns (${payload.columnCount})`));
  const table = el("table", "col-table");
  const thead = el("tr");
  for (const h of ["column", "kind", "filled", "distinct"]) thead.append(el("th", "", h));
  table.append(thead);
  for (const c of payload.columns) {
    const tr = el("tr");
    const fillTd = el("td", "fill-cell");
    fillTd.append(meterCanvas(c.completeness), el("span", "pct", `${c.completeness}%`));
    tr.append(el("td", "col-name", c.name), el("td", "", c.kind), fillTd, el("td", "", String(c.distinct)));
    table.append(tr);
  }
  els.doc.append(table);

  currentResult = record;
  renderRepair(record);
  showScreen("result");
}

/** The since-last-check strip: a deterministic diff of this run against the
 *  previous saved check of the same sheet. Absent for a first run or a
 *  different sheet — a diff across two different lists would be a lie. */
function renderSince(record) {
  const since = record?.sinceLast;
  if (!since) return;
  els.doc.append(el("hr", "rule"));
  els.doc.append(el("span", "kicker", `Since your last check · ${sinceAgo(since.days)}`));
  if (!since.changed) {
    els.doc.append(el("p", "unnarrated", "Same sheet — nothing moved."));
    return;
  }
  const ul = el("ul", "since-list");
  for (const e of since.entries) {
    const li = el("li", "since-row");
    li.append(
      el("span", "since-label", e.label),
      el("span", `since-delta ${e.good ? "good" : "bad"}`, `${e.from} → ${e.to}`),
    );
    ul.append(li);
  }
  els.doc.append(ul);
}

/** The cleaned-copy block: the change log always shows; copy/download only
 *  when this session still holds the cleaned file (rows are never stored). */
function renderRepair(record) {
  const r = record?.repair;
  els.repairBlock.hidden = !r;
  els.repairStatus.hidden = true;
  if (!r) return;
  els.repairSummary.textContent = r.summary;
  els.repairChanges.replaceChildren();
  for (const c of r.changes ?? []) els.repairChanges.append(el("li", "", c.text));
  const canSave = Boolean(cleanCsv) && cleanKey === record.at;
  els.btnRepairCopy.hidden = !canSave;
  els.btnRepairDownload.hidden = !canSave;
}

function repairStatus(msg) {
  els.repairStatus.textContent = msg;
  els.repairStatus.hidden = !msg;
}

async function copyCleanCsv() {
  if (!cleanCsv) return;
  try {
    await navigator.clipboard.writeText(cleanCsv);
    repairStatus("Cleaned CSV copied.");
  } catch {
    // clipboard needs permission in some iframes — fall back to a selection
    const ta = document.createElement("textarea");
    ta.value = cleanCsv;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand?.("copy");
    ta.remove();
    repairStatus(ok ? "Cleaned CSV copied." : "Copy is blocked here — use Download.");
  }
}

function downloadCleanCsv() {
  if (!cleanCsv) return;
  try {
    const url = URL.createObjectURL(new Blob([cleanCsv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "databard-cleaned.csv";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    repairStatus("Cleaned CSV downloaded.");
  } catch {
    repairStatus("Download is blocked here — use Copy.");
  }
}

function resultAsText(record) {
  const { payload, reading, narrated } = record;
  const lines = [
    `DataBard health report — ${payload.score}/100 (${payload.label})`,
    `${payload.rowCount} rows × ${payload.columnCount} columns`,
    "",
    payload.verdict,
    "",
    "CHECKS",
    ...payload.checks.map((c) => `[${c.state}] ${c.name} — ${c.detail}`),
    "",
    "READING",
  ];
  if (narrated && reading) {
    lines.push(reading.headline, "");
    if (reading.verdict) {
      lines.push(`Verdict — ${PURPOSE_LABELS[record.purpose] ?? "this purpose"}:`, reading.verdict, "");
    }
    lines.push(
      "What you can say:", reading.claim, "",
      "What goes wrong as-is:", reading.risk, "",
    );
    if (reading.priority?.length) {
      lines.push("Fix in this order:", ...reading.priority.map((p, i) => `${i + 1}. ${p.check} — ${p.why}`), "");
    }
    lines.push("How:", ...reading.steps.map((s, i) => `${i + 1}. ${s}`));
  } else {
    lines.push("The reading could not be checked against the numbers, so it is not shown.");
  }
  if (record.sinceLast) {
    lines.push("", `SINCE YOUR LAST CHECK (${sinceAgo(record.sinceLast.days)})`);
    if (record.sinceLast.changed) {
      lines.push(...record.sinceLast.entries.map((e) => `- ${e.label}: ${e.from} → ${e.to}`));
    } else {
      lines.push("Same sheet — nothing moved.");
    }
  }
  if (record.repair?.changed) {
    lines.push("", "CLEANED COPY", record.repair.summary, ...record.repair.changes.map((c) => `- ${c.text}`));
  }
  if (payload.findings.length) lines.push("", "FINDINGS", ...payload.findings.map((f) => `- ${f}`));
  if (payload.actions.length) lines.push("", "ACTIONS", ...payload.actions.map((a) => `- ${a}`));
  return lines.join("\n");
}

async function refreshLast() {
  try {
    const record = await readLastReading(anna);
    if (record?.payload) {
      lastRecord = record;
      els.lastLine.textContent = `${record.reading?.verdict ?? record.payload.verdict} — score ${record.payload.score}`;
      els.lastCard.hidden = false;
      return;
    }
  } catch { /* none */ }
  els.lastCard.hidden = true;
}

boot();
