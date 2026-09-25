#!/usr/bin/env node
/**
 * Data Briefing paid smoke test.
 *
 * Calls the x402-gated POST /api/mcp/briefing endpoint. If it receives 402,
 * it pays with the dedicated probe wallet (PROBE_PAYER_PK from .env) and
 * retries with the PAYMENT-SIGNATURE header — exactly what the OKX reviewer's
 * client does.
 *
 * Usage:
 *   node scripts/briefing-smoke.mjs [targetUrl] [jsonBody]
 *
 * Default target: production /api/mcp/briefing.
 * Default body is a scoped text-only briefing (exercises the live
 * re-verification path). Pass '{}' to test the reviewer's bare-call posture
 * (cached, fastest). Each paid call costs exactly one $1 briefing fee, plus
 * up to $0.10 of our own outbound paid-verification budget on scoped calls.
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

const body =
  process.argv[3] || JSON.stringify({ query: "token security", audio: "none" });

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

console.log(`POST ${TARGET} body=${body}`);
const t0 = Date.now();
let res = await fetch(TARGET, {
  method: "POST",
  headers: baseHeaders,
  body,
  signal: AbortSignal.timeout(60_000),
});
console.log(`unpaid -> HTTP ${res.status} (${Date.now() - t0}ms)`);
const challenge = res.headers.get("payment-required");
await res.text(); // drain

if (res.status === 402) {
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
  const t1 = Date.now();
  res = await fetch(TARGET, {
    method: "POST",
    headers: { ...baseHeaders, ...paymentHeaders },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  console.log(`paid -> HTTP ${res.status} (${Date.now() - t1}ms)`);
}

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.log(text.slice(0, 2000));
  process.exit(1);
}

if (res.status === 200) {
  console.log(
    JSON.stringify(
      {
        tool: data.tool,
        mode: data.mode,
        scope: data.scope,
        freshness: data.freshness,
        liveNote: data.liveNote,
        summary: data.summary,
        keyFindings: data.keyFindings,
        nextStep: data.nextStep,
        services: (data.services || []).map((s) => ({
          serviceId: s.serviceId,
          serviceName: s.serviceName,
          score: s.score,
          status: s.status,
          verification: s.verification,
          fresh: s.fresh,
          checkedAt: s.checkedAt,
          recommendation: s.recommendation,
        })),
        audioDelivery: data.audioDelivery,
        audioUrl: data.audioUrl,
      },
      null,
      2
    )
  );
} else {
  console.log(text.slice(0, 2000));
}

process.exit(res.status === 200 ? 0 : 1);
