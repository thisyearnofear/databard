// Fake host for listing captures and browser QA — serves the bundle +
// fake-sdk and answers host calls over HTTP test endpoints. Synthetic
// data only.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const bundleDir = join(here, "..", "bundle");
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4622);

const kv = new Map();
const llmCalls = [];
const kvFaults = { get: {}, set: {}, list: {} };
const kvDelays = {};
let entryPayload = null;
let startup = { fail: false, delayMs: 0, hang: false };
let script = [];
const hangers = [];

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const json = (v) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
  const body = async () => {
    const d = await new Promise((r) => { let a = ""; req.on("data", (c) => (a += c)); req.on("end", () => r(a)); });
    try { return JSON.parse(d || "{}"); } catch { return { __bad: true }; }
  };

  if (url.pathname === "/__kv") {
    const args = await body();
    if (args.__bad) { res.writeHead(400); return res.end("bad json"); }
    const { op, key, value } = args;
    if (kvDelays[key] === "hang") { hangers.push(res); return; }
    if (kvDelays[key] > 0) await new Promise((r) => setTimeout(r, kvDelays[key]));
    const faultKey = Object.keys(kvFaults[op] ?? {}).find((k) => key.startsWith(k));
    if (faultKey && kvFaults[op][faultKey] > 0) {
      kvFaults[op][faultKey] -= 1;
      return json({ ok: false, error: { code: "faulted", message: "injected kv fault" } });
    }
    if (op === "get") return json({ value: kv.has(key) ? kv.get(key) : null });
    if (op === "set") {
      if (value === null) kv.delete(key); else kv.set(key, value);
      return json({ ok: true, result: null });
    }
    if (op === "list") return json({ items: [...kv.keys()].filter((k) => k.startsWith(args.prefix || "")).map((key) => ({ key })) });
  }
  if (url.pathname === "/__llm") {
    const req_ = await body();
    llmCalls.push(req_);
    const next = script.length ? script.shift() : { text: "{}" };
    if (next.hang) { hangers.push(res); return; }
    if (next.delayMs) await new Promise((r) => setTimeout(r, next.delayMs));
    if (next.error) return json({ ok: false, error: next.error });
    return json({ ok: true, result: { role: "assistant", content: { type: "text", text: next.text }, model: "fake-model", stopReason: next.stopReason ?? "endTurn" } });
  }
  if (url.pathname === "/__script") { script = (await body()).responses || []; return json({ ok: true }); }
  if (url.pathname === "/__fault") {
    const b = await body();
    if (b.op && b.key) kvFaults[b.op][b.key] = (kvFaults[b.op][b.key] || 0) + (b.times ?? 1);
    return json({ ok: true, kvFaults });
  }
  if (url.pathname === "/__delay") {
    const b = await body();
    kvDelays[b.key] = b.hang ? "hang" : (b.ms ?? 0);
    return json({ ok: true, kvDelays });
  }
  if (url.pathname === "/__startup" && req.method === "POST") { startup = { ...startup, ...(await body()) }; return json({ ok: true }); }
  if (url.pathname === "/__startup") {
    if (startup.hang) { hangers.push(res); return; }
    return json(startup);
  }
  if (url.pathname === "/__entry" && req.method === "POST") { entryPayload = (await body()).payload ?? null; return json({ ok: true }); }
  if (url.pathname === "/__entry") return json({ payload: entryPayload });
  if (url.pathname === "/__dump") return json({ kv: Object.fromEntries(kv), llmCalls });
  if (url.pathname === "/__reset") {
    kv.clear(); llmCalls.length = 0; script = [];
    kvFaults.get = {}; kvFaults.set = {}; kvFaults.list = {};
    for (const k of Object.keys(kvDelays)) delete kvDelays[k];
    startup = { fail: false, delayMs: 0, hang: false }; entryPayload = null;
    for (const h of hangers.splice(0)) { try { h.writeHead(502); h.end(); } catch {} }
    return json({ ok: true });
  }

  let path = url.pathname === "/" ? "/index.html" : url.pathname;
  let file;
  if (path === "/static/anna-apps/_sdk/latest/index.js") file = join(here, "fake-sdk.js");
  else {
    file = join(bundleDir, path);
    if (!file.startsWith(bundleDir)) { res.writeHead(403); return res.end(); }
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "text/plain" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("not found");
  }
});
server.listen(PORT, HOST, () => console.log(`fake host on http://${HOST}:${PORT}`));
