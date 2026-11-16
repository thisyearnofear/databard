// Listing captures — REAL model output (Reflection Beam, recorded 16 Nov 2026)
// replayed through the fake host. The page clock is frozen at each
// recording's recordedAt so staleness and day counts match the original run.
// Usage: node test/capture-listing.mjs

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, readFile, rm } from "node:fs/promises";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, "../listing");
const SESSION = "databard-anna-listing";
const PORT = "4622";
const BASE = `http://127.0.0.1:${PORT}`;
const cli = async (...a) => (await run("agent-browser", ["--session", SESSION, ...a])).stdout.trim();
const post = (p, b) => fetch(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fev = async (js) => JSON.parse(await cli("eval", `((${js}))(document)`));
const screen = () => fev('d=>[...d.querySelectorAll(".screen")].find(s=>!s.hidden)?.id');
async function waitScreen(id, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    if (await screen() === id) return;
    await sleep(250);
  }
  throw new Error(`screen ${id} never appeared (at ${await screen()})`);
}

const freezeClock = (iso) => fev(`d=>{
  const T=${JSON.stringify(iso)};
  const R=window.__RealDate ?? (window.__RealDate=Date);
  const t=new R(T).getTime();
  function F(...a){ return a.length? new R(...a) : new R(t); }
  F.now=()=>t; F.parse=R.parse; F.UTC=R.UTC; F.prototype=R.prototype;
  window.Date=F; return true}`);

async function shot(name, expected, width, height) {
  await waitScreen(expected);
  // set the width FIRST, then measure the content bottom at that width —
  // measuring before the resize sizes the shot for the old layout and
  // leaves an empty band
  await cli("set", "viewport", String(width), String(height));
  const contentH = JSON.parse(await cli("eval",
    "Math.ceil(document.querySelector('main').getBoundingClientRect().bottom + 12)"));
  await cli("set", "viewport", String(width), String(Math.max(height, contentH)));
  await fev('d=>document.activeElement?.blur()||true');
  await sleep(200);
  await cli("screenshot", join(output, name));
}

const SAMPLE_INDEX = { messy: 0, healthy: 1, stale: 2 };

async function runRecording(name, shots) {
  const rec = JSON.parse(await readFile(join(here, "recordings", `${name}.json`), "utf8"));
  await post("/__reset");
  const replies = rec.replies.map((r) => ({ text: r.content.text, stopReason: r.stopReason ?? "endTurn" }));
  if ((shots.running ?? []).length && replies.length) replies[0].delayMs = 1200;
  await post("/__script", { responses: replies });
  await cli("open", BASE);
  await waitScreen("screen-input");
  await freezeClock(rec.recordedAt);
  for (const [n, w, h] of shots.before ?? []) await shot(n, "screen-input", w, h);
  const idx = SAMPLE_INDEX[rec.sample] ?? 0;
  await fev(`d=>{[...d.querySelectorAll(".sample-btn")][${idx}].click();return true}`);
  await fev(`d=>{d.getElementById("purpose-${rec.purpose}").click();d.getElementById("tone-${rec.tone}").click();return true}`);
  await fev('d=>{d.getElementById("btn-run").click();return true}');
  for (const [n, w, h] of shots.running ?? []) { await sleep(200); await shot(n, "screen-run", w, h).catch(() => {}); }
  await waitScreen("screen-result", 120);
  await sleep(1000); // let the gauge sweep settle
  for (const [n, w, h] of shots.result) await shot(n, "screen-result", w, h);
  const kv = (await post("/__dump")).kv;
  const last = kv["readings/last"];
  return kv[last?.key ?? ""] ?? last;
}

const server = spawn(process.execPath, [join(here, "fake-host-server.mjs")], { env: { ...process.env, PORT } });
try {
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("capture host did not start")), 8000);
    server.once("error", (e) => { clearTimeout(t); reject(e); });
    server.stdout.on("data", (d) => { if (String(d).includes("fake host on")) { clearTimeout(t); resolve(); } });
  });
  await mkdir(output, { recursive: true });
  await rm(join(here, "../listing/candidate"), { recursive: true, force: true });
  await cli("open", "about:blank");
  await cli("set", "media", "dark"); // databard's listing is its dark scheme — pinned, not machine-dependent

  const messy = await runRecording("messy-sponsor-straight", {
    before: [["home-1280.png", 1280, 800], ["home-390.png", 390, 844]],
    running: [["run-1280.png", 1280, 800], ["run-390.png", 390, 844]],
    result: [["result-messy-1280.png", 1280, 800], ["result-messy-390.png", 390, 844]],
  });
  console.log("messy:", messy ? `narrated=${messy.narrated}` : "NOT SAVED");

  const stale = await runRecording("stale-handover-roast", {
    result: [["result-stale-1280.png", 1280, 800], ["result-stale-390.png", 390, 844]],
  });
  console.log("stale:", stale ? `narrated=${stale.narrated}` : "NOT SAVED");
} finally {
  try { await cli("close"); } catch {}
  server.kill();
}
