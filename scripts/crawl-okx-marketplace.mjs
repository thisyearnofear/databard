#!/usr/bin/env node
/**
 * crawl-okx-marketplace.mjs — build the OKX.AI marketplace snapshot.
 *
 * Runs locally only: the `onchainos` CLI is installed + authed on dev machines,
 * not on the production box. Loops a broad keyword set (a single query only
 * covers a slice of the marketplace) × pages until each keyword is exhausted,
 * dedupes services by their listing `id`, and writes
 * src/lib/okx-marketplace.snapshot.json — the committed input to
 * src/lib/marketplace-index.ts.
 *
 * Usage: node scripts/crawl-okx-marketplace.mjs [--out path] [--delay ms]
 */
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const QUERIES = [
  "data", "token", "price", "market", "security", "ai", "agent", "swap",
  "defi", "news", "signal", "api", "mcp", "trade", "wallet", "analytics",
  "risk", "audit", "research", "nft", "stock", "chain", "x402", "okx",
  "btc", "eth", "sol", "report", "check", "verify", "score", "scan",
  "alpha", "yield", "weather", "image", "audio", "search", "social",
  "数据", "交易", "安全", "代币", "分析",
];
// Keyword search doesn't surface every agent — always include these ids too.
const EXTRA_AGENT_IDS = ["9878"]; // DataBard (ours — flagged in the index)
const MAX_PAGE = 10;
const PAGE_SIZE = 20;
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const DELAY_MS = Number(argValue("--delay")) || 250;
const OUT =
  argValue("--out") ||
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/lib/okx-marketplace.snapshot.json",
  );

function search(query, page) {
  return new Promise((resolve, reject) => {
    execFile(
      "onchainos",
      ["agent", "search", "--query", query, "--page", String(page), "--page-size", String(PAGE_SIZE)],
      { maxBuffer: 8 * 1024 * 1024, timeout: 30_000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`onchainos failed: ${stderr || err.message}`));
        try {
          const parsed = JSON.parse(stdout);
          if (!parsed.ok) return reject(new Error(`onchainos not ok: ${stdout.slice(0, 200)}`));
          resolve(parsed.data ?? { list: [] });
        } catch (e) {
          reject(new Error(`bad JSON for query="${query}" page=${page}: ${e.message}`));
        }
      },
    );
  });
}

function serviceList(agentId) {
  return new Promise((resolve, reject) => {
    execFile(
      "onchainos",
      ["agent", "service-list", "--agent-id", agentId],
      { maxBuffer: 8 * 1024 * 1024, timeout: 30_000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`onchainos failed: ${stderr || err.message}`));
        try {
          const parsed = JSON.parse(stdout);
          if (!parsed.ok) return reject(new Error(`onchainos not ok: ${stdout.slice(0, 200)}`));
          resolve(Array.isArray(parsed.data) ? parsed.data : []);
        } catch (e) {
          reject(new Error(`bad JSON for service-list ${agentId}: ${e.message}`));
        }
      },
    );
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const agents = new Map(); // agentId -> agent record (latest seen)
const services = new Map(); // service listing id -> flattened service

for (const query of QUERIES) {
  for (let page = 1; page <= MAX_PAGE; page++) {
    let data;
    try {
      data = await search(query, page);
    } catch (e) {
      console.error(`[warn] ${query} p${page}: ${e.message}`);
      break;
    }
    const list = Array.isArray(data.list) ? data.list : [];
    if (list.length === 0) break;

    for (const agent of list) {
      if (agent?.agentId) agents.set(String(agent.agentId), agent);
      for (const svc of agent?.services ?? []) {
        if (!svc?.id || services.has(String(svc.id))) continue;
        services.set(String(svc.id), {
          serviceId: String(svc.id),
          agentId: String(agent.agentId ?? ""),
          agentName: String(agent.name ?? ""),
          serviceName: String(svc.serviceName ?? ""),
          serviceType: String(svc.serviceType ?? ""),
          endpoint: typeof svc.endpoint === "string" ? svc.endpoint : null,
          feeUsd: feeOf(svc),
          online: agent.onlineStatus === 1,
          category: Array.isArray(agent.categoryName) ? agent.categoryName.join(", ") : String(agent.categoryName ?? ""),
          description: String(svc.serviceDescription ?? "").slice(0, 240),
        });
      }
    }
    process.stderr.write(
      `query="${query}" page=${page} list=${list.length} total=${data.total} | agents=${agents.size} services=${services.size}\n`,
    );
    if (list.length < PAGE_SIZE) break;
    await sleep(DELAY_MS);
  }
  await sleep(DELAY_MS);
}

// `search` returns feeAmount (number); `service-list` returns fee (string).
function feeOf(svc) {
  if (typeof svc?.feeAmount === "number") return svc.feeAmount;
  const n = Number(svc?.fee);
  return Number.isFinite(n) ? n : 0;
}

// Explicit agent ids — their A2MCP services merge into the same roster.
for (const agentId of EXTRA_AGENT_IDS) {
  try {
    for (const entry of await serviceList(agentId)) {
      const info = entry?.agentInfo ?? {};
      if (info.agentId) agents.set(String(info.agentId), info);
      for (const svc of entry?.list ?? []) {
        if (!svc?.id || services.has(String(svc.id))) continue;
        services.set(String(svc.id), {
          serviceId: String(svc.id),
          agentId: String(info.agentId ?? agentId),
          agentName: String(info.name ?? ""),
          serviceName: String(svc.serviceName ?? ""),
          serviceType: String(svc.serviceType ?? ""),
          endpoint: typeof svc.endpoint === "string" ? svc.endpoint : null,
          feeUsd: feeOf(svc),
          online: info.onlineStatus === 1,
          category: Array.isArray(info.categoryName)
            ? info.categoryName.join(", ")
            : String(info.categoryName ?? ""),
          description: String(svc.serviceDescription ?? "").slice(0, 240),
        });
      }
    }
    process.stderr.write(`extra agent ${agentId} merged | services=${services.size}\n`);
  } catch (e) {
    console.error(`[warn] service-list ${agentId}: ${e.message}`);
  }
}

const all = [...services.values()].sort((a, b) =>
  a.agentId === b.agentId
    ? a.serviceId.localeCompare(b.serviceId)
    : a.agentId.localeCompare(b.agentId),
);
const a2mcp = all.filter((s) => s.serviceType === "A2MCP" && s.endpoint);

const snapshot = {
  crawledAt: new Date().toISOString(),
  agentCount: agents.size,
  a2aServiceCount: all.filter((s) => s.serviceType === "A2A").length,
  a2mcpServiceCount: a2mcp.length,
  services: a2mcp.map(({ serviceType, ...rest }) => rest),
};

await writeFile(OUT, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
console.log(
  `Wrote ${OUT}: ${snapshot.agentCount} agents, ${snapshot.a2aServiceCount} A2A, ${snapshot.a2mcpServiceCount} A2MCP services`,
);
