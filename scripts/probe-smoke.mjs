#!/usr/bin/env node
/**
 * DataBard Probe smoke test.
 *
 * Calls the x402-gated POST /api/agent/probe endpoint. If it receives 402,
 * it pays with the dedicated probe wallet (PROBE_PAYER_PK from .env) and
 * retries with the PAYMENT-SIGNATURE header.
 *
 * Usage:
 *   node scripts/probe-smoke.mjs [targetUrl] [jsonBody]
 *
 * Default target: production /api/agent/probe.
 * Default body probes only DataBard's own free health-check, so the paid
 * smoke test costs exactly one probe fee and no outbound third-party spend.
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
  process.argv[2] || "https://databard.persidian.com/api/agent/probe";

const body =
  process.argv[3] ||
  JSON.stringify({
    question: "Smoke test: is the free DataBard health-check service healthy?",
    candidates: [
      {
        name: "DataBard Health Check (self)",
        endpoint: "https://databard.persidian.com/api/mcp/health-check",
        method: "POST",
        body: {},
        knownPriceUsd: 0,
        agentId: "9878",
      },
    ],
    attest: false,
  });

const { x402Client, x402HTTPClient } = await import("@okxweb3/x402-core/client");
const { registerExactEvmScheme } = await import("@okxweb3/x402-evm/exact/client");
const { privateKeyToAccount } = await import("viem/accounts");
const { createPublicClient, http } = await import("viem");

const account = privateKeyToAccount(PK);
const publicClient = createPublicClient({ transport: http(RPC_URL) });

const core = new x402Client();
registerExactEvmScheme(core, {
  signer: account,
  schemeOptions: { rpcUrl: RPC_URL },
});
const client = new x402HTTPClient(core);

const baseHeaders = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

console.log(`POST ${TARGET}`);
let res = await fetch(TARGET, {
  method: "POST",
  headers: baseHeaders,
  body,
  signal: AbortSignal.timeout(120_000),
});
console.log(`unpaid -> HTTP ${res.status}`);

if (res.status === 402) {
  const challenge = res.headers.get("payment-required");
  if (!challenge) {
    console.error("402 without PAYMENT-REQUIRED header.");
    process.exit(3);
  }

  const paymentRequired = client.getPaymentRequiredResponse((name) =>
    name.toUpperCase() === "PAYMENT-REQUIRED" ? challenge : null
  );
  const payload = await client.createPaymentPayload(paymentRequired);
  const paymentHeaders = client.encodePaymentSignatureHeader(payload);

  console.log("paying x402 challenge and retrying...");
  res = await fetch(TARGET, {
    method: "POST",
    headers: { ...baseHeaders, ...paymentHeaders },
    body,
    signal: AbortSignal.timeout(180_000),
  });
  console.log(`paid -> HTTP ${res.status}`);

  const settleHeader = res.headers.get("payment-response");
  if (settleHeader) {
    try {
      const settle = JSON.parse(Buffer.from(settleHeader, "base64").toString("utf8"));
      console.log("settlement:", JSON.stringify(settle, null, 2));
    } catch {
      console.log("settlement header present but not parseable");
    }
  }
}

const text = await res.text();
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}

process.exit(res.status === 200 ? 0 : 1);
