#!/usr/bin/env tsx
/**
 * Print the exact zero-value requestProbe transaction payload an Agent ID
 * holder can sign. This script never broadcasts.
 *
 * Usage:
 *   tsx scripts/probe-receipt-request.mts <registryAddress> <endpoint> [mcp|a2mcp]
 */
import { canonicalSubjectUri, subjectHashFor } from "../src/lib/probe-receipt";
import registryAbi from "../src/lib/probe-receipt-registry.abi.json";
import { encodeFunctionData } from "viem";

const [registry, endpoint, protocolArg] = process.argv.slice(2);
if (!registry || !endpoint) {
  console.error("Usage: tsx scripts/probe-receipt-request.mts <registryAddress> <endpoint> [mcp|a2mcp]");
  process.exit(2);
}
if (!/^0x[0-9a-fA-F]{40}$/.test(registry)) {
  console.error("registryAddress must be a 20-byte hex address");
  process.exit(2);
}
const protocol = protocolArg === "a2mcp" ? "a2mcp" : "mcp";
const subjectUri = canonicalSubjectUri(endpoint, protocol);
const subjectHash = subjectHashFor(subjectUri);
const data = encodeFunctionData({
  abi: registryAbi.abi,
  functionName: "requestProbe",
  args: [subjectHash, subjectUri],
});

console.log(JSON.stringify({
  chainId: 56,
  subjectUri,
  subjectHash,
  transaction: {
    to: registry,
    value: "0x0",
    data,
  },
  note: "Zero-value contract write. The sender must hold a Binance Agent ID; gas is paid in BNB. This script only prepares calldata and never broadcasts.",
}, null, 2));
