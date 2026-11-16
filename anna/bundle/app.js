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
    if (lastContext) runReading(lastContext.payload, lastContext.tone, lastContext.purpose);
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
    if (lastContext) runReading(lastContext.payload, lastContext.tone, lastContext.purpose);
    else showScreen("input");
  };
  els.btnLast.onclick = () => { if (lastRecord) renderResult(lastRecord); };
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
    lastContext = { payload, tone, purpose };
    runReading(payload, tone, purpose);
  };
}

// ── run ─────────────────────────────────────────────────────────────────

async function runReading(payload, runTone, runPurpose) {
  const runId = `run-${Date.now()}`;
  activeRunId = runId;
  els.feed.replaceChildren();
  feed("scored", `${payload.score} / 100 — ${payload.label}; ${payload.rowCount} rows × ${payload.columnCount} columns`);
  showScreen("run");

  try {
    await writeCheckpoint(anna, { v: 1, id: runId, stage: "reading", tone: runTone, purpose: runPurpose, payload }).catch(() => {});
    feed("drafting", `asking the model for a reading for ${PURPOSE_LABELS[runPurpose] ?? "this purpose"}`);
    const out = await readReport(anna, payload, runTone, runPurpose);
    if (activeRunId !== runId) return;

    const record = {
      payload,
      reading: out.reading,
      narrated: out.narrated,
      tone: runTone,
      purpose: runPurpose,
      at: Date.now(),
    };
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
      const record = { payload, reading: null, narrated: false, tone: runTone, purpose: runPurpose, at: Date.now(), quotaNote: quota };
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
    els.doc.append(el("span", "kicker", "What you can say"));
    els.doc.append(el("p", "pull-quote", reading.claim));
    els.doc.append(el("span", "kicker warn", "What goes wrong as-is"));
    els.doc.append(el("p", "risk-line", reading.risk));
    els.doc.append(el("span", "kicker", "Fix in this order"));
    const ol = el("ol", "steps");
    for (const st of reading.steps) ol.append(stepNode(st));
    els.doc.append(ol);
  } else {
    els.doc.append(el("h2", "", payload.verdict));
    els.doc.append(el("p", "unnarrated", record.quotaNote ?? "The reading could not be checked against your numbers, so it is not shown."));
  }

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
  showScreen("result");
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
    lines.push(
      reading.headline, "",
      "What you can say:", reading.claim, "",
      "What goes wrong as-is:", reading.risk, "",
      "Fix in this order:", ...reading.steps.map((s, i) => `${i + 1}. ${s}`),
    );
  } else {
    lines.push("The reading could not be checked against the numbers, so it is not shown.");
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
      els.lastLine.textContent = `${record.payload.verdict} — score ${record.payload.score}`;
      els.lastCard.hidden = false;
      return;
    }
  } catch { /* none */ }
  els.lastCard.hidden = true;
}

boot();
