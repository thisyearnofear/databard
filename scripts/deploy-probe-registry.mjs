#!/usr/bin/env node
/**
 * Deploy ProbeVerdictRegistry to X Layer mainnet (eip155:196).
 *
 * Signs with PROBE_ATTESTATION_PK ?? PROBE_PAYER_PK from .env — the same
 * dedicated probe wallet that pays outbound probes and attestations.
 * Prints the gas estimate in OKB and aborts if it exceeds 0.003 OKB.
 *
 * Usage: node scripts/deploy-probe-registry.mjs
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

const PK = readEnv("PROBE_ATTESTATION_PK") ?? readEnv("PROBE_PAYER_PK");
if (!PK) {
  console.error("Missing PROBE_ATTESTATION_PK / PROBE_PAYER_PK in .env");
  process.exit(2);
}
const RPC_URL = readEnv("PROBE_RPC_URL", "https://xlayerrpc.okx.com");
const MAX_DEPLOY_OKB = 0.003;

const artifact = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "contracts-src/out/ProbeVerdictRegistry.bytecode.json"),
    "utf8",
  ),
);
const { abi } = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/lib/probe-registry.abi.json"), "utf8"),
);

const { createWalletClient, createPublicClient, http, formatEther } = await import("viem");
const { privateKeyToAccount } = await import("viem/accounts");
const { xLayer } = await import("viem/chains");

const account = privateKeyToAccount(PK);
const publicClient = createPublicClient({ chain: xLayer, transport: http(RPC_URL) });
const wallet = createWalletClient({ account, chain: xLayer, transport: http(RPC_URL) });

const balance = await publicClient.getBalance({ address: account.address });
console.log(`publisher: ${account.address}`);
console.log(`balance:   ${formatEther(balance)} OKB`);

const gas = await publicClient.estimateGas({
  account,
  data: artifact.bytecode,
});
const gasPrice = await publicClient.getGasPrice();
const costWei = gas * gasPrice;
const costOkb = Number(formatEther(costWei));
console.log(`gas estimate: ${gas} × ${gasPrice} wei = ${costOkb.toFixed(6)} OKB`);

if (costOkb > MAX_DEPLOY_OKB) {
  console.error(`ABORT: estimated ${costOkb.toFixed(6)} OKB exceeds ${MAX_DEPLOY_OKB} OKB cap`);
  process.exit(3);
}
if (costWei > balance) {
  console.error(`ABORT: insufficient OKB balance`);
  process.exit(3);
}

console.log("deploying...");
const txHash = await wallet.deployContract({
  abi,
  bytecode: artifact.bytecode,
});
console.log(`tx: ${txHash}`);
console.log(`   https://www.oklink.com/xlayer/tx/${txHash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
console.log(`status: ${receipt.status} | block ${receipt.blockNumber} | gasUsed ${receipt.gasUsed}`);
console.log(`contract: ${receipt.contractAddress}`);
console.log(`OKLink:  https://www.oklink.com/xlayer/address/${receipt.contractAddress}`);

const after = await publicClient.getBalance({ address: account.address });
console.log(`remaining: ${formatEther(after)} OKB`);

if (receipt.status !== "success") process.exit(1);
console.log(`\nSet PROBE_REGISTRY_ADDRESS=${receipt.contractAddress} in .env`);
