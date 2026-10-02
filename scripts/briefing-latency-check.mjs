#!/usr/bin/env node
/**
 * Briefing latency synthetic check.
 *
 * Pays a real /api/mcp/briefing call and times it — the paid endpoint is what
 * OKX's reviewer hits, and two of the three delistings were paid-endpoint
 * timeouts discovered *after* OKX's own request failed. This is the canary:
 * run it hourly from cron and a regression pages the log (and optionally a
 * webhook) before the reviewer does.
 *
 * The payment settles to our own PAY_TO_ADDRESS, so the only real cost is
 * X Layer gas.
 *
 * Usage:
 *   node scripts/briefing-latency-check.mjs [targetUrl] [budgetMs]
 *
 * Env (also read from .env next to the repo root):
 *   PROBE_PAYER_PK             — payer key (same wallet as probe-smoke.mjs)
 *   PROBE_RPC_URL              — X Layer RPC (default https://xlayerrpc.okx.com)
 *   BRIEFING_LATENCY_BUDGET_MS — paid-call budget (default 15000; healthy is
 *                                ~3-6s = ~1s handler + 2-5s sync settlement)
 *   BRIEFING_ALERT_WEBHOOK     — optional; POSTed {text} on breach/failure
 *
 * Exit codes: 0 green · 1 latency breach or paid call failed ·
 *             2 missing payer key · 3 malformed 402 challenge
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function readEnv(name, fallback) {
  if (process.env[name]) return process.env[name];
  try {
    const text = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (m && m[1] === name) return m[2].trim().replace(/^"|"$/g, "");
    }
  } catch {
    // ignore
  }
  return fallback;
}

const PK = readEnv("PROBE_PAYER_PK");
if (!PK) {
  console.error("Missing PROBE_PAYER_PK in .env");
  process.exit(2);
}

const RPC_URL = readEnv("PROBE_RPC_URL", "https://xlayerrpc.okx.com");
const TARGET =
  process.argv[2] || "https://databard.persidian.com/api/mcp/briefing";
const BUDGET_MS = Number(
  process.argv[3] || readEnv("BRIEFING_LATENCY_BUDGET_MS", "15000"),
);
const ALERT_WEBHOOK = readEnv("BRIEFING_ALERT_WEBHOOK");

// Bare body = whole-market text-only briefing — the same request shape a
// reviewer or bare tool call sends. audio defaults to "none" server-side.
const body = "{}";
const baseHeaders = { "Content-Type": "application/json", Accept: "application/json" };

async function alert(text) {
  console.error(`ALERT ${text}`);
  if (!ALERT_WEBHOOK) return;
  try {
    await fetch(ALERT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error(`webhook post failed: ${e instanceof Error ? e.message : e}`);
  }
}

const t0 = Date.now();
let res = await fetch(TARGET, {
  method: "POST",
  headers: baseHeaders,
  body,
  signal: AbortSignal.timeout(30_000),
});
const unpaidMs = Date.now() - t0;
console.log(`unpaid -> HTTP ${res.status} in ${unpaidMs}ms`);

if (res.status !== 402) {
  // A paid endpoint answering anything else means the gate itself is broken
  // (503 = x402 not configured, 5xx = crash) — worse than slow.
  const text = (await res.text()).slice(0, 300);
  await alert(
    `briefing unpaid check expected 402, got ${res.status} in ${unpaidMs}ms — ${text}`,
  );
  process.exit(1);
}

const challenge = res.headers.get("payment-required");
if (!challenge) {
  await alert("briefing returned 402 without a PAYMENT-REQUIRED header");
  process.exit(3);
}

const { x402Client, x402HTTPClient } = await import("@okxweb3/x402-core/client");
const { registerExactEvmScheme } = await import("@okxweb3/x402-evm/exact/client");
const { privateKeyToAccount } = await import("viem/accounts");

const core = new x402Client();
registerExactEvmScheme(core, {
  signer: privateKeyToAccount(PK),
  schemeOptions: { rpcUrl: RPC_URL },
});
const client = new x402HTTPClient(core);
const paymentRequired = client.getPaymentRequiredResponse((name) =>
  name.toUpperCase() === "PAYMENT-REQUIRED" ? challenge : null,
);
const payload = await client.createPaymentPayload(paymentRequired);
const paymentHeaders = client.encodePaymentSignatureHeader(payload);

const t1 = Date.now();
res = await fetch(TARGET, {
  method: "POST",
  headers: { ...baseHeaders, ...paymentHeaders },
  body,
  signal: AbortSignal.timeout(Math.max(BUDGET_MS + 60_000, 120_000)),
});
const paidMs = Date.now() - t1;
console.log(`paid -> HTTP ${res.status} in ${paidMs}ms (budget ${BUDGET_MS}ms)`);

const settleHeader = res.headers.get("payment-response");
let settled = false;
if (settleHeader) {
  try {
    const settle = JSON.parse(Buffer.from(settleHeader, "base64").toString("utf8"));
    settled = settle?.success === true || Boolean(settle?.transaction);
    console.log(`settled: ${settled}`);
  } catch {
    console.log("settlement header present but not parseable");
  }
}

if (res.status !== 200) {
  const text = (await res.text()).slice(0, 300);
  await alert(`briefing paid call returned ${res.status} in ${paidMs}ms — ${text}`);
  process.exit(1);
}
if (paidMs > BUDGET_MS) {
  await alert(`briefing paid call took ${paidMs}ms — over ${BUDGET_MS}ms budget`);
  process.exit(1);
}

console.log(`green: unpaid ${unpaidMs}ms, paid ${paidMs}ms, settled=${settled}`);
process.exit(0);
