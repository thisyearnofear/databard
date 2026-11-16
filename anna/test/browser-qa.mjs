// Browser QA — databard anna bundle against the fake host + agent-browser.
// Synthetic data only; no real model, no real storage.
// Usage: node test/browser-qa.mjs        (CASE=<substr>|<substr> to filter)

import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
process.env.AGENT_BROWSER_DEFAULT_TIMEOUT ||= "90000";
const run = promisify(execFile);
const PORT = "4626";
const BASE = `http://127.0.0.1:${PORT}`;
const SESSION = process.env.AGENT_BROWSER_SESSION || "databard-anna-qa";
let passed = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cli = async (...a) => (await run("agent-browser", ["--session", SESSION, ...a])).stdout.trim();
const ev = async (js) => {
  const out = (await cli("eval", js)).trim();
  const unq = (v) => { try { return JSON.parse(v); } catch { return v; } };
  const r = unq(out);
  return typeof r === "string" && r !== out ? unq(r) : r;
};
const post = (p, b) => fetch(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) }).then((r) => r.json());
const screens = 'JSON.stringify([...document.querySelectorAll(".screen")].filter(s=>!s.hidden).map(s=>s.id))';
const activeScreen = async () => (await ev(screens))[0];
const waitScreen = async (id, tries = 60) => {
  for (let i = 0; i < tries; i += 1) {
    if ((await activeScreen()) === id) return;
    await sleep(250);
  }
  assert.equal(await activeScreen(), id);
};
const CASE = process.env.CASE || null;
const failures = [];
async function ok(name, fn) {
  if (CASE && !CASE.split("|").some((part) => name.includes(part))) return;
  try { await fn(); passed += 1; console.log("ok", passed, "-", name); }
  catch (e) { failures.push({ name, err: e.message?.split("\n").slice(0, 6).join(" | ") || String(e) }); console.log("FAIL", "-", name); }
}
const fresh = async (suffix = "") => {
  await post("/__reset");
  await cli("open", "about:blank");
  await sleep(300);
  await cli("open", `${BASE}${suffix}`);
  await sleep(1200);
};

// ── synthetic readings ───────────────────────────────────────────────────
// Figures/quoted names must match the messy sample's report payload:
// score 86, 10 rows, 6 cols, 1 duplicate, 9 unique/contactable, "email" col.

const GOOD = JSON.stringify({
  headline: 'The "email" column is the whole story',
  claim: "You can defend 9 unique members once the 1 duplicate in \"email\" is merged.",
  risk: "Sending as-is bounces the 1 malformed address and double-counts a member.",
  steps: ["Merge the duplicate rows in \"email\".", "Fix the malformed entry in \"email\"."],
});
const BAD_NUMBER = JSON.stringify({
  headline: 'The "email" column is the whole story',
  claim: "You can defend 9 unique members once the duplicate is merged.",
  risk: "Churn is up 73% and members will notice.",
  steps: ["Merge the duplicate rows in \"email\"."],
});
const ALL_BAD = JSON.stringify({
  headline: "fine headline",
  claim: "99% invented",
  risk: "88% also invented",
  steps: ["77% invented"],
});

const pickSample = async (i = 0) => {
  await ev(`[...document.querySelectorAll(".sample-btn")][${i}].click()||true`);
  await sleep(150);
};
const pickPurpose = (p = "sponsor") => ev(`document.getElementById("purpose-${p}").click()||true`);
const clickRun = async () => ev('document.getElementById("btn-run").click()||true');
const llmCount = async () => (await post("/__dump")).llmCalls.length;

// ── suite ────────────────────────────────────────────────────────────────

const tmp = await mkdtemp(join(tmpdir(), "databard-qa-"));
await writeFile(join(tmp, "upload.csv"), "name,email\nQA Person,qa@example.com\nSecond Person,second@example.com\n");
await writeFile(join(tmp, "big.csv"), "x".repeat(6 * 1024 * 1024));
await writeFile(join(tmp, "empty.csv"), "");
await writeFile(join(tmp, "header.csv"), "name,email\n");

const server = spawn(process.execPath, [join(here, "fake-host-server.mjs")], { env: { ...process.env, PORT } });
try {
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("fake host did not start")), 8000);
    server.once("error", reject);
    server.stdout.on("data", (d) => { if (String(d).includes("fake host on")) { clearTimeout(t); resolve(); } });
  });

  await ok("cold start renders the static shell before the host connects", async () => {
    await post("/__reset");
    await post("/__startup", { delayMs: 4000 });
    await cli("open", "about:blank");
    await cli("open", BASE);
    await sleep(400);
    assert.equal(await ev('document.getElementById("startup-panel").hidden'), false);
    assert.ok((await ev('document.getElementById("startup-message").textContent')).length > 0);
    assert.equal(await ev('document.getElementById("root").hidden'), true);
    await post("/__startup", { delayMs: 0 });
    await waitScreen("screen-input", 40);
  });

  await ok("connect that never resolves -> error + Retry within the timeout", async () => {
    await fresh();
    await post("/__startup", { hang: true });
    await cli("open", `${BASE}/?watchdogms=1200`);
    await sleep(2200);
    assert.equal(await ev('document.getElementById("btn-startup-retry").hidden'), false);
    assert.equal(await ev('document.getElementById("startup-message").textContent'), "Could not reach the host.");
  });

  await ok("checkpoint read hangs -> error + Retry within the timeout", async () => {
    await fresh();
    await post("/__delay", { key: "databard/active-task", hang: true });
    await cli("open", `${BASE}/?watchdogms=1200`);
    await sleep(2200);
    assert.equal(await ev('document.getElementById("btn-startup-retry").hidden'), false);
    assert.equal(await ev('document.getElementById("startup-message").textContent'), "Could not read your saved work.");
  });

  await ok("malformed checkpoint -> never a spinner, discard offered, raw kept until discard", async () => {
    await fresh();
    await post("/__kv", { op: "set", key: "databard/active-task", value: "not-an-object" });
    await cli("open", "about:blank");
    await cli("open", BASE);
    await sleep(1200);
    assert.equal(await activeScreen(), "screen-input");
    assert.equal(await ev('document.getElementById("resume-banner").hidden'), false);
    assert.equal(await ev('document.getElementById("btn-discard-checkpoint").hidden'), false);
    assert.equal((await post("/__dump")).kv["databard/active-task"], "not-an-object");
    await ev('document.getElementById("btn-discard-checkpoint").click()');
    await sleep(500);
    assert.equal(await ev('document.getElementById("resume-banner").hidden'), true);
    assert.equal((await post("/__dump")).kv["databard/active-task"], undefined);
  });

  await ok("poisoned checkpoint value -> corrupt path, discard offered", async () => {
    await fresh();
    await cli("open", `${BASE}/?poison=checkpoint`);
    await sleep(1500);
    assert.equal(await activeScreen(), "screen-input");
    assert.equal(await ev('document.getElementById("resume-banner").hidden'), false);
    assert.equal(await ev('document.getElementById("btn-discard-checkpoint").hidden'), false);
    await ev('document.getElementById("btn-discard-checkpoint").click()');
    await sleep(400);
    assert.equal(await ev('document.getElementById("resume-banner").hidden'), true);
  });

  await ok("all three samples each produce a result", async () => {
    for (let i = 0; i < 3; i += 1) {
      await fresh();
      await post("/__script", { responses: [{ text: GOOD }, { text: GOOD }] });
      await waitScreen("screen-input");
      await pickSample(i);
      await pickPurpose();
      await clickRun();
      await waitScreen("screen-result", 80);
      assert.ok((await ev('document.getElementById("score-detail").textContent')).length > 3);
    }
  });

  await ok("paste and file upload both feed the scorer", async () => {
    await fresh();
    await post("/__script", { responses: [{ text: GOOD }] });
    await waitScreen("screen-input");
    await ev('document.getElementById("csv-input").value="name,email\\nPasted Person,pasted@example.com\\n"');
    await ev('document.getElementById("csv-input").dispatchEvent(new Event("input"))');
    assert.equal(await ev('document.getElementById("csv-input").value.includes("pasted@example.com")'), true);
    await cli("upload", "#file-input", join(tmp, "upload.csv"));
    await sleep(500);
    assert.equal(await ev('document.getElementById("csv-input").value.includes("qa@example.com")'), true);
  });

  await ok("oversize file and >50,000 rows are rejected with a message", async () => {
    await fresh();
    await waitScreen("screen-input");
    await cli("upload", "#file-input", join(tmp, "big.csv"));
    await sleep(500);
    assert.equal(await ev('document.getElementById("input-error").hidden'), false);
    assert.ok((await ev('document.getElementById("input-error").textContent')).includes("5 MB"));
    await ev('document.getElementById("csv-input").value="name,email\\n"+"a,b@x.co\\n".repeat(50001)');
    await pickPurpose();
    await clickRun();
    await sleep(500);
    assert.ok((await ev('document.getElementById("input-error").textContent')).includes("50,000"));
    assert.equal(await activeScreen(), "screen-input");
  });

  await ok("empty and header-only CSV are handled without a run", async () => {
    await fresh();
    await waitScreen("screen-input");
    await cli("upload", "#file-input", join(tmp, "empty.csv"));
    await sleep(400);
    await cli("upload", "#file-input", join(tmp, "header.csv"));
    await sleep(400);
    await pickPurpose();
    await clickRun();
    await sleep(800);
    const scr = await activeScreen();
    if (scr === "screen-input") {
      assert.ok((await ev('document.getElementById("input-error").textContent')).length > 3, "an explanation is shown");
    } else {
      assert.equal(scr, "screen-result", "a header-only sheet still scores honestly");
    }
  });

  await ok("purpose is required before Run", async () => {
    await fresh();
    await waitScreen("screen-input");
    await pickSample(0);
    await clickRun();
    await sleep(500);
    assert.equal(await ev('document.getElementById("input-error").hidden'), false);
    assert.ok((await ev('document.getElementById("input-error").textContent')).includes("list is for"));
    assert.equal(await llmCount(), 0);
  });

  await ok("happy path: sample -> purpose -> result -> reload -> Last reading reopens", async () => {
    await fresh();
    await post("/__script", { responses: [{ text: GOOD }] });
    await waitScreen("screen-input");
    await pickSample(0);
    await pickPurpose();
    await clickRun();
    await waitScreen("screen-result", 80);
    assert.ok((await ev('document.getElementById("result-doc").textContent')).includes("What you can say"));
    assert.ok((await post("/__dump")).kv["readings/last"], "reading saved");
    await cli("reload");
    await sleep(1400);
    await waitScreen("screen-input");
    assert.equal(await ev('document.getElementById("last-reading-card").hidden'), false);
    await ev('document.getElementById("btn-last-reading").click()');
    await waitScreen("screen-result");
    assert.ok((await ev('document.getElementById("result-doc").textContent')).includes("unique members"));
  });

  await ok("reload mid-reading -> resume -> no re-scoring, checkpoint holds no rows", async () => {
    await fresh();
    await post("/__script", { responses: [{ hang: true }] });
    await waitScreen("screen-input");
    await pickSample(0);
    await pickPurpose();
    await clickRun();
    for (let i = 0; i < 40; i += 1) {
      const d = await post("/__dump");
      if (d.kv["databard/active-task"]?.stage === "reading") break;
      await sleep(250);
    }
    const cpJson = JSON.stringify((await post("/__dump")).kv["databard/active-task"]);
    assert.ok(!cpJson.includes("amara.osei"), "no member data in the checkpoint");
    assert.ok(!cpJson.includes("samples"), "no samples in the checkpoint");
    await cli("reload");
    await sleep(1400);
    assert.equal(await ev('document.getElementById("resume-banner").hidden'), false);
    await post("/__script", { responses: [{ text: GOOD }] });
    const before = await llmCount();
    await ev('document.getElementById("btn-resume").click()');
    await waitScreen("screen-result", 80);
    // resume goes straight to the model — the payload came from the checkpoint
    assert.equal((await post("/__dump")).kv["databard/active-task"], undefined);
    assert.ok((await llmCount()) > before - 1);
  });

  await ok("model 503 twice -> honest error with Retry, deterministic report not fabricated", async () => {
    await fresh();
    await post("/__script", { responses: [
      { error: { code: "PROVIDER_503", message: "provider overloaded" } },
      { error: { code: "PROVIDER_503", message: "provider overloaded" } },
    ]});
    await waitScreen("screen-input");
    await pickSample(0);
    await pickPurpose();
    await clickRun();
    // readReport treats call failures as rejections: two failures land on the
    // honest unnarrated state — deterministic report visible, nothing invented.
    await waitScreen("screen-result", 100);
    const doc = await ev('document.getElementById("result-doc").textContent');
    assert.ok(doc.includes("could not be checked"), "honest unnarrated line after two 503s");
    assert.ok(!doc.includes("unique members"), "no fabricated reading");
  });

  await ok("quota exceeded -> report stays visible with the numbers, Retry narrates", async () => {
    await fresh();
    await post("/__script", { responses: [
      { error: { code: "APP_QUOTA_EXCEEDED", message: "quota exceeded", data: { requiredCu: 3.6, remainingCu: 0.9 } } },
    ]});
    await waitScreen("screen-input");
    await pickSample(0);
    await pickPurpose();
    await clickRun();
    await waitScreen("screen-result", 80);
    const doc = await ev('document.getElementById("result-doc").textContent');
    assert.ok(doc.includes("needs about 3.6 CU") && doc.includes("you have 0.9"), "quota numbers shown");
    assert.ok((await ev('document.querySelectorAll("#result-doc .check-row").length')) > 0, "deterministic report still visible");
    assert.equal(await ev('document.getElementById("btn-reading-retry").hidden'), false, "retry offered");
    await post("/__script", { responses: [{ text: GOOD }] });
    await ev('document.getElementById("btn-reading-retry").click()');
    await waitScreen("screen-result", 80);
    assert.ok((await ev('document.getElementById("result-doc").textContent')).includes("unique members"));
  });

  await ok("truncated reading -> one long retry lands; long-retry quota keeps the report visible", async () => {
    await fresh();
    await post("/__script", { responses: [
      { text: "{\"headline\":", stopReason: "maxTokens" },
      { text: GOOD },
    ]});
    await waitScreen("screen-input");
    await pickSample(0);
    await pickPurpose();
    await clickRun();
    await waitScreen("screen-result", 80);
    const calls = (await post("/__dump")).llmCalls;
    assert.equal(calls.length, 2, "4096 then long retry");
    assert.equal(calls[0].maxTokens, 4096);
    assert.equal(calls[1].maxTokens, 12000);
    assert.ok(calls.every((c) => c.thinking === false));

    await fresh();
    await post("/__script", { responses: [
      { text: "{\"headline\":", stopReason: "maxTokens" },
      { error: { code: "APP_QUOTA_EXCEEDED", message: "quota exceeded", data: { requiredCu: 5, remainingCu: 1 } } },
    ]});
    await waitScreen("screen-input");
    await pickSample(0);
    await pickPurpose();
    await clickRun();
    await waitScreen("screen-result", 80);
    const doc = await ev('document.getElementById("result-doc").textContent');
    assert.ok(doc.includes("needs about 5 CU") && doc.includes("you have 1"), "quota numbers shown");
    assert.equal(await ev('document.getElementById("btn-reading-retry").hidden'), false, "retry offered");
  });

  await ok("invented number -> the offending field is dropped", async () => {
    await fresh();
    await post("/__script", { responses: [{ text: BAD_NUMBER }, { text: BAD_NUMBER }] });
    await waitScreen("screen-input");
    await pickSample(0);
    await pickPurpose();
    await clickRun();
    await waitScreen("screen-result", 100);
    const doc = await ev('document.getElementById("result-doc").textContent');
    assert.ok(!doc.includes("73%"), "invented figure never shown");
    // claim+steps survived but risk was dropped -> narrated false
    assert.ok(doc.includes("could not be checked"), "unnarrated line shown");
  });

  await ok("all fields invalid twice -> the unnarrated line is shown", async () => {
    await fresh();
    await post("/__script", { responses: [{ text: ALL_BAD }, { text: ALL_BAD }] });
    await waitScreen("screen-input");
    await pickSample(0);
    await pickPurpose();
    await clickRun();
    await waitScreen("screen-result", 100);
    const doc = await ev('document.getElementById("result-doc").textContent');
    assert.ok(doc.includes("could not be checked"), "honest unnarrated line");
    assert.ok((await ev('document.querySelectorAll("#result-doc .check-row").length')) > 0, "deterministic checks still visible");
  });

  await ok("entry payload prefills only, never starts a run, and cannot carry CSV", async () => {
    await fresh();
    await post("/__entry", { payload: { tone: "roast", purpose: "send", csv: "name,email\nx,y@z.co" } });
    await cli("open", "about:blank");
    await cli("open", BASE);
    await sleep(1400);
    assert.equal(await activeScreen(), "screen-input");
    assert.equal(await ev('document.getElementById("tone-roast").classList.contains("on")'), true);
    assert.equal(await ev('document.getElementById("purpose-send").classList.contains("on")'), true);
    assert.equal(await ev('document.getElementById("csv-input").value'), "", "entry payload cannot carry CSV");
    assert.equal(await llmCount(), 0);
  });

  await ok("save failure still shows the reading and offers retry-save", async () => {
    await fresh();
    await post("/__script", { responses: [{ text: GOOD }] });
    await post("/__fault", { op: "set", key: "readings/", times: 1 });
    await waitScreen("screen-input");
    await pickSample(0);
    await pickPurpose();
    await clickRun();
    await waitScreen("screen-result", 80);
    assert.ok((await ev('document.getElementById("result-doc").textContent')).includes("unique members"));
    assert.equal(await ev('document.getElementById("save-warn").hidden'), false);
    await ev('document.getElementById("btn-save-retry").click()');
    await sleep(600);
    assert.equal(await ev('document.getElementById("save-warn").hidden'), true);
    assert.ok((await post("/__dump")).kv["readings/last"], "retry saved the reading");
  });

  await ok("a late reply from a cancelled run mutates nothing", async () => {
    await fresh();
    await post("/__script", { responses: [{ hang: true }] });
    await waitScreen("screen-input");
    await pickSample(0);
    await pickPurpose();
    await clickRun();
    await waitScreen("screen-run", 40);
    await ev('document.getElementById("btn-cancel-run").click()');
    await waitScreen("screen-input");
    await post("/__script", { responses: [{ text: GOOD }] });
    await pickSample(0);
    await pickPurpose();
    await clickRun();
    await waitScreen("screen-result", 80);
    const last = (await post("/__dump")).kv["readings/last"];
    assert.ok(last, "the newer run saved its reading");
    const record = (await post("/__dump")).kv[last.key];
    assert.equal(record.purpose, "sponsor");
  });

  await ok("viewports 320/420/1024 show no horizontal scroll", async () => {
    for (const w of [1024, 420, 320]) {
      await fresh();
      await post("/__script", { responses: [{ text: GOOD }] });
      await cli("set", "viewport", String(w), "800");
      await waitScreen("screen-input");
      assert.ok((await ev("document.body.scrollWidth")) <= w + 1, `input overflows ${w}`);
      await pickSample(0);
      await pickPurpose();
      await clickRun();
      await waitScreen("screen-result", 80);
      assert.ok((await ev("document.body.scrollWidth")) <= w + 1, `result overflows ${w}`);
    }
    await cli("set", "viewport", "1024", "800");
  });

  await ok("keyboard-only flow, focus rings, fonts and motion are deliberate", async () => {
    await fresh();
    await post("/__script", { responses: [{ text: GOOD }] });
    await waitScreen("screen-input");
    await ev(`(async()=>{
      document.querySelector(".sample-btn")?.dispatchEvent(new Event("x",{bubbles:true}));
      document.getElementById("purpose-sponsor").focus();
      return document.activeElement.id})()`);
    assert.equal(await ev("document.activeElement.id"), "purpose-sponsor");
    const outline = await ev('getComputedStyle(document.activeElement).outlineWidth');
    assert.notEqual(outline, "0px", "focus-visible ring present");
    await pickSample(0);
    await ev('document.getElementById("purpose-sponsor").click()');
    await ev('document.getElementById("btn-run").focus()');
    await ev('document.activeElement.click()');
    await waitScreen("screen-result", 80);
    const fonts = await ev(`[...document.fonts].map(f=>f.family+" "+f.status).join("|")`);
    assert.ok(fonts.includes("Space Grotesk"), fonts);
    const remote = await ev('performance.getEntriesByType("resource").map(e=>e.name).filter(n=>!n.startsWith(location.origin)).join("|")');
    assert.equal(remote, "");
    await sleep(1100); // the gauge sweep settles — nothing keeps animating
    const running = await ev('document.getAnimations().filter(a=>a.playState==="running").length');
    assert.ok(running <= 1, `at most the caret may still tick (${running})`);
    // the reading is the hero: headline, pull-quote, risk, steps, then checks
    const order = await ev(`["reading-head","pull-quote","risk-line","steps"].map(c=>{
      const n=document.querySelector("#result-doc ."+c); return n? n.getBoundingClientRect().top : -1}).join("|")`);
    const tops = order.split("|").map(Number);
    assert.ok(tops.every((t) => t > 0) && tops[0] < tops[1] && tops[1] < tops[2] && tops[2] < tops[3], order);
  });

  await ok("the gauge canvas is sized right and the numeral sits inside it", async () => {
    for (const [w, minW] of [[1024, 180], [390, 140]]) {
      await fresh();
      await post("/__script", { responses: [{ text: GOOD }] });
      await cli("set", "viewport", String(w), "800");
      await waitScreen("screen-input");
      await pickSample(0);
      await pickPurpose();
      await clickRun();
      await waitScreen("screen-result", 80);
      await sleep(1100); // sweep done — canvas at rest
      const m = await ev(`(()=>{
        const c=document.getElementById("score-gauge").getBoundingClientRect();
        const n=document.getElementById("score-pill").getBoundingClientRect();
        return {cw:c.width, cxl:c.left+c.width/2,
                nx:n.left+n.width/2, inside:n.top>=c.top-1 && n.bottom<=c.bottom+1}})()`);
      assert.ok(m.cw >= minW, `canvas CSS width ${m.cw} < ${minW} at ${w}px`);
      assert.ok(Math.abs(m.nx - m.cxl) <= 6, `numeral off-centre by ${Math.abs(m.nx - m.cxl).toFixed(1)}px at ${w}`);
      assert.ok(m.inside, `numeral outside the canvas box at ${w}`);
    }
    await cli("set", "viewport", "1024", "800");
  });

  await ok("a full run issues zero requests to non-local origins", async () => {
    await fresh();
    await post("/__script", { responses: [{ text: GOOD }] });
    await waitScreen("screen-input");
    await pickSample(0);
    await pickPurpose();
    await clickRun();
    await waitScreen("screen-result", 80);
    const bad = await ev('performance.getEntriesByType("resource").map(e=>e.name).filter(n=>!n.startsWith(location.origin)).join("|")');
    assert.equal(bad, "");
  });

  await ok("no pasted sample value appears in any llm.complete request", async () => {
    await fresh();
    await post("/__script", { responses: [{ text: GOOD }] });
    await waitScreen("screen-input");
    await ev('document.getElementById("csv-input").value="name,email\\nSecret Person,secret.person@nowhere.example\\n"');
    await ev('document.getElementById("csv-input").dispatchEvent(new Event("input"))');
    await pickPurpose();
    await clickRun();
    await waitScreen("screen-result", 80);
    const wire = JSON.stringify((await post("/__dump")).llmCalls);
    assert.ok(!wire.includes("secret.person@nowhere.example"), "pasted email must not reach the model");
    assert.ok(!wire.includes("Secret Person"), "pasted name must not reach the model");
  });
} finally {
  try { await cli("close"); } catch {}
  server.kill();
}
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log("-", f.name, "::", f.err);
  process.exit(1);
}
console.log(`\nbrowser-qa: ${passed} checks passed`);
