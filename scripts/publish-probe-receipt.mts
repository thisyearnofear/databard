#!/usr/bin/env tsx
/**
 * Prepare, simulate, or broadcast one ProbeReceiptRegistry publication.
 *
 * Default is dry-run: prints the tuple and encoded calldata, and simulates only
 * when a publisher key is available. Nothing is broadcast unless --broadcast is
 * passed explicitly.
 *
 * Usage:
 *   tsx scripts/publish-probe-receipt.mts <evidence.json> [evidenceUri] [--broadcast]
 *
 * Env:
 *   PROBE_RECEIPTS_REGISTRY_ADDRESS  deployed registry address (required)
 *   PROBE_RECEIPTS_PUBLISHER_PK      publisher key (required for simulation/broadcast)
 *   BSC_RPC_URL                      defaults to https://bsc-rpc.publicnode.com
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProbeReceiptArtifact, type ProbeReceiptEvidence } from "../src/lib/probe-receipt";
import registryAbi from "../src/lib/probe-receipt-registry.abi.json";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function readEnv(name: string, fallback = ""): string {
  if (process.env[name]) return process.env[name] as string;
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

const args = process.argv.slice(2).filter((arg) => arg !== "--broadcast");
const broadcast = process.argv.includes("--broadcast");
const evidencePath = args[0];
if (!evidencePath) {
  console.error("Usage: tsx scripts/publish-probe-receipt.mts <evidence.json> [evidenceUri] [--broadcast]");
  process.exit(2);
}

const registry = readEnv("PROBE_RECEIPTS_REGISTRY_ADDRESS") || readEnv("PROBE_RECEIPT_REGISTRY_ADDRESS");
if (!registry) {
  console.error("Missing PROBE_RECEIPTS_REGISTRY_ADDRESS");
  process.exit(2);
}

const rawEvidenceJson = fs.readFileSync(evidencePath, "utf8");
const evidence = JSON.parse(rawEvidenceJson) as ProbeReceiptEvidence;
const evidenceUri =
  args[1] ||
  `${readEnv("PROBE_RECEIPT_EVIDENCE_BASE_URL", "https://databard.persidian.com/probe/receipts").replace(/\/$/, "")}/${path.basename(evidencePath)}`;
const artifact = createProbeReceiptArtifact(evidence, evidenceUri);
if (rawEvidenceJson !== artifact.canonicalJson) {
  console.error(
    "Evidence file is not byte-exact canonical JSON. Regenerate it with scripts/probe-receipt-measure.mts; do not pretty-print or edit hashed evidence."
  );
  process.exit(1);
}
const input = artifact.contractInput;

const { createPublicClient, createWalletClient, encodeFunctionData, http } = await import("viem");
const { privateKeyToAccount } = await import("viem/accounts");
const { bsc } = await import("viem/chains");

const rpcUrl = readEnv("BSC_RPC_URL", "https://bsc-rpc.publicnode.com");
const transport = http(rpcUrl);
const publicClient = createPublicClient({ chain: bsc, transport });
const calldata = encodeFunctionData({
  abi: registryAbi.abi,
  functionName: "publishReceipt",
  args: [input],
});

const output: Record<string, unknown> = {
  mode: broadcast ? "broadcast" : "dry-run",
  registry,
  chainId: 56,
  input,
  transaction: {
    to: registry,
    value: "0x0",
    data: calldata,
  },
};

const pk = readEnv("PROBE_RECEIPTS_PUBLISHER_PK");
if (!pk) {
  output.simulation = "skipped: PROBE_RECEIPTS_PUBLISHER_PK unavailable";
} else {
  const account = privateKeyToAccount(pk as `0x${string}`);
  output.publisher = account.address;
  try {
    await publicClient.simulateContract({
      address: registry as `0x${string}`,
      abi: registryAbi.abi,
      functionName: "publishReceipt",
      args: [input],
      account,
    });
    output.simulation = "ok";
  } catch (error) {
    output.simulation = `failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`;
    if (broadcast) {
      console.error(JSON.stringify(output, null, 2));
      process.exit(1);
    }
  }

  if (broadcast && output.simulation === "ok") {
    const wallet = createWalletClient({ account, chain: bsc, transport });
    const hash = await wallet.writeContract({
      address: registry as `0x${string}`,
      abi: registryAbi.abi,
      functionName: "publishReceipt",
      args: [input],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    output.txHash = hash;
    output.txStatus = receipt.status;
    if (receipt.status !== "success") {
      console.error(JSON.stringify(output, null, 2));
      process.exit(1);
    }
  }
}

console.log(JSON.stringify(output, null, 2));
