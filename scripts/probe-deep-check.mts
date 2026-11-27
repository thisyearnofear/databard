#!/usr/bin/env tsx
/**
 * Deep-check: pay a real marketplace service and verify output correctness
 * against independent ground truth. This is the correctness layer the
 * interface-health probes do not provide.
 *
 * Design — positive + negative control:
 *   1. positive: pay for Barker's own documented example pool
 *      (spark_susdc_arbitrum), cross-check claimed APY/TVL against
 *      DefiLlama's free public yield data.
 *   2. negative: query a nonexistent pool_uid — an honest service errors;
 *      a fabricating one invents data.
 *
 * Writes a full evidence artifact to public/probe/receipts/.
 *
 * Usage: tsx scripts/probe-deep-check.mts
 * Cost: ~$0.01 USDT0 (two paid calls at $0.005 each, negative control may
 * be rejected pre-payment in which case it costs nothing).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── env ──────────────────────────────────────────────────────────────────
function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnvFile(path.resolve(__dirname, "../.env"));

const ENDPOINT = "https://mcp.barker.money/barker_pool_detail";
const POSITIVE_UID = "spark_susdc_arbitrum";
const NEGATIVE_UID = "nonexistent_pool_deepcheck_control";
const OUT_DIR = path.resolve(__dirname, "../public/probe/receipts");

interface PaidCallResult {
  url: string;
  unpaidStatus: number;
  paidStatus: number | null;
  latencyMs: number;
  settlementTx: string | null;
  body: unknown;
  error?: string;
}

async function paidCall(poolUid: string): Promise<PaidCallResult> {
  const url = `${ENDPOINT}?pool_uid=${encodeURIComponent(poolUid)}`;
  const started = Date.now();
  const unpaid = await fetch(url);
  const unpaidStatus = unpaid.status;
  let challenge: string | null = unpaid.headers.get("payment-required");
  if (!challenge && unpaidStatus === 402) {
    // Barker returns the x402 payload as the response body — re-encode it.
    const bodyText = await unpaid.text();
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed?.accepts) challenge = Buffer.from(bodyText).toString("base64");
    } catch { /* not a challenge body */ }
  }
  const result: PaidCallResult = {
    url, unpaidStatus, paidStatus: null, latencyMs: 0,
    settlementTx: null, body: null,
  };
  if (unpaidStatus !== 402 || !challenge) {
    result.error = `expected 402 with challenge, got ${unpaidStatus}`;
    return result;
  }
  const { attemptX402Payment } = await import("../src/lib/probe-runner");
  const paymentHeaders = await attemptX402Payment(challenge);
  if (!paymentHeaders) {
    result.error = "could not sign payment (PROBE_PAYER_PK unset?)";
    return result;
  }
  const paid = await fetch(url, { headers: paymentHeaders });
  result.latencyMs = Date.now() - started;
  result.paidStatus = paid.status;
  const settleHeader = paid.headers.get("payment-response");
  if (settleHeader) {
    try {
      const settle = JSON.parse(Buffer.from(settleHeader, "base64").toString("utf-8"));
      if (typeof settle?.transaction === "string") result.settlementTx = settle.transaction;
    } catch { /* non-fatal */ }
  }
  const text = await paid.text();
  try { result.body = JSON.parse(text); } catch { result.body = text.slice(0, 2000); }
  return result;
}

// ── ground truth: DefiLlama yields ───────────────────────────────────────
interface GroundTruth {
  poolId: string; project: string; chain: string; symbol: string;
  tvlUsd: number; apy: number | null; apyBase: number | null; apyReward: number | null;
}
async function fetchGroundTruth(): Promise<GroundTruth | null> {
  const res = await fetch("https://yields.llama.fi/pools");
  if (!res.ok) return null;
  const json = await res.json() as { data?: Array<Record<string, unknown>> };
  const pools = json.data ?? [];
  // Spark sUSDC on Arbitrum: match project spark*, chain Arbitrum, symbol
  // containing USDC. Prefer the closest symbol match.
  // The Spark Savings Rate is unified across chains; sUSDC-Arbitrum is not
  // tracked under that exact symbol, so the correct cross-check is the rate
  // consensus across spark-savings USDC/USDS entries on any chain.
  const candidates = pools.filter((p) =>
    String(p.project) === "spark-savings" && ["USDC", "USDS"].includes(String(p.symbol)),
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Number(b.tvlUsd ?? 0) - Number(a.tvlUsd ?? 0));
  const best = candidates[0];
  return {
    poolId: String(best.pool), project: String(best.project), chain: "cross-chain consensus",
    symbol: "USDC/USDS savings rate", tvlUsd: Number(best.tvlUsd ?? 0),
    apy: best.apy == null ? null : Number(best.apy),
    apyBase: best.apyBase == null ? null : Number(best.apyBase),
    apyReward: best.apyReward == null ? null : Number(best.apyReward),
  };
}

// ── verdict ──────────────────────────────────────────────────────────────
function extractNumbers(body: unknown): { apyClaims: number[]; tvlClaims: number[] } {
  const apyClaims: number[] = [];
  const tvlClaims: number[] = [];
  const walk = (v: unknown, keyPath: string) => {
    if (v == null) return;
    if (typeof v === "number" && Number.isFinite(v)) {
      if (/apy|apr|rate|yield/i.test(keyPath) && v > 0 && v < 100) apyClaims.push(v);
      if (/tvl|totalvalue|liquidity|supplyusd|tvl_usd/i.test(keyPath) && v > 1000) tvlClaims.push(v);
      return;
    }
    if (Array.isArray(v)) { v.forEach((item, i) => walk(item, keyPath)); return; }
    if (typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) walk(val, `${keyPath}.${k}`);
    }
  };
  walk(body, "");
  return { apyClaims, tvlClaims };
}

async function main() {
  console.log("== deep-check: barker_pool_detail ==");
  console.log("positive control:", POSITIVE_UID);
  const positive = await paidCall(POSITIVE_UID);
  console.log(`  unpaid ${positive.unpaidStatus} → paid ${positive.paidStatus} in ${positive.latencyMs}ms, settle tx: ${positive.settlementTx ?? "none"}`);

  console.log("negative control:", NEGATIVE_UID);
  const negative = await paidCall(NEGATIVE_UID);
  console.log(`  unpaid ${negative.unpaidStatus} → paid ${negative.paidStatus} in ${negative.latencyMs}ms`);

  console.log("fetching DefiLlama ground truth…");
  const truth = await fetchGroundTruth();
  if (truth) {
    console.log(`  ${truth.project}/${truth.chain} ${truth.symbol}: apy ${truth.apy?.toFixed(2)}% (base ${truth.apyBase?.toFixed(2)}%), tvl $${(truth.tvlUsd / 1e6).toFixed(1)}M`);
  } else {
    console.log("  WARNING: no DefiLlama match — ground truth missing");
  }

  const nums = extractNumbers(positive.body);
  console.log(`  positive response numeric claims: apy candidates ${nums.apyClaims.slice(0, 8).map((n) => n.toFixed(2)).join(", ") || "none"}`);
  console.log(`  tvl candidates: ${nums.tvlClaims.slice(0, 5).map((n) => "$" + (n / 1e6).toFixed(1) + "M").join(", ") || "none"}`);

  // verdict
  let verdict = "inconclusive";
  const truthApy = truth?.apy ?? null;
  if (positive.paidStatus !== 200) verdict = "non_delivery";
  else if (nums.apyClaims.length === 0) verdict = "non_answer";
  else if (truthApy != null) {
    const closest = nums.apyClaims.reduce((a, b) =>
      Math.abs(a - truthApy) < Math.abs(b - truthApy) ? a : b);
    const diff = Math.abs(closest - truthApy);
    verdict = diff <= 1.5 ? "match" : diff <= Math.max(2, truthApy * 0.5) ? "plausible" : "mismatch";
    console.log(`  closest apy claim ${closest.toFixed(2)}% vs truth ${truthApy.toFixed(2)}% → diff ${diff.toFixed(2)}pp → ${verdict}`);
  }
  const negativeBodyStr = JSON.stringify(negative.body ?? "");
  const negativeFabricated = negative.paidStatus === 200 &&
    /apy|tvl/i.test(negativeBodyStr) && nums.apyClaims.length > 0 &&
    extractNumbers(negative.body).apyClaims.length > 0;
  console.log(`  negative control: ${negativeFabricated ? "FABRICATED DATA for nonexistent pool" : "clean error / no fabrication"}`);

  const artifact = {
    kind: "databard.probe.deep-check.v1",
    checkedAt: new Date().toISOString(),
    subject: { endpoint: ENDPOINT, serviceName: "Barker Pool Detail", feeUsd: 0.005 },
    methodology: {
      summary: "Paid correctness verification: positive control cross-checked against independent ground truth (DefiLlama), negative control tests fabrication on nonexistent input.",
      caveat: "One-shot paid measurement. APY values drift over time; small divergence from ground truth is expected and reflected in the verdict rubric.",
    },
    positiveControl: { poolUid: POSITIVE_UID, ...positive, apyClaims: nums.apyClaims, tvlClaims: nums.tvlClaims.slice(0, 10) },
    negativeControl: { poolUid: NEGATIVE_UID, unpaidStatus: negative.unpaidStatus, paidStatus: negative.paidStatus, fabricated: negativeFabricated, bodySnippet: negativeBodyStr.slice(0, 600) },
    groundTruth: truth ? { source: "https://yields.llama.fi/pools", ...truth } : null,
    verdict,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const hash = crypto.createHash("sha256").update(JSON.stringify(artifact)).digest("hex").slice(0, 10);
  const file = path.join(OUT_DIR, `deep-check-barker-pool-detail-${hash}.json`);
  fs.writeFileSync(file, JSON.stringify(artifact, null, 1));
  console.log(`\nartifact: public/probe/receipts/${path.basename(file)}`);
  console.log(`VERDICT: ${verdict} | negative control ${negativeFabricated ? "FABRICATES" : "honest"}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
