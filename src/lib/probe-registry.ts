/**
 * Probe Verdict Registry — publishes marketplace-index scores to the
 * ProbeVerdictRegistry contract on X Layer so other agents/contracts can gate
 * payments on `isSafeToPay(serviceId, minScore, maxAge)` instead of trusting
 * a listing. Replaces the bare hash-in-a-self-send as the primary artifact.
 *
 * Requires env:
 *   PROBE_REGISTRY_ADDRESS — deployed contract (blank = fall back to self-send)
 *   PROBE_ATTESTATION_PK   — publisher key (falls back to PROBE_PAYER_PK)
 *   PROBE_RPC_URL          — X Layer RPC (defaults to https://xlayerrpc.okx.com)
 */
import { createHash } from "crypto";
import registryAbi from "./probe-registry.abi.json";

export const STATUS_TO_CODE = {
  healthy: 1,
  degraded: 2,
  broken: 3,
  unreachable: 4,
} as const;

const BATCH_SIZE = 60;

export interface RegistryRow {
  serviceId: string;
  score: number;
  status: keyof typeof STATUS_TO_CODE;
  ours?: boolean;
}

export interface RegistryBatch {
  serviceIds: bigint[];
  scores: number[];
  statuses: number[];
}

/**
 * Rows whose score or status changed since the previous run — first run
 * publishes every non-ours service. Pure; unit-tested.
 */
export function diffForChain(
  rows: RegistryRow[],
  prev: { serviceId: string; score: number; status: string }[] | null | undefined,
): RegistryRow[] {
  const prevMap = new Map((prev ?? []).map((r) => [r.serviceId, r]));
  return rows.filter((r) => {
    if (r.ours) return false;
    const p = prevMap.get(r.serviceId);
    return !p || p.score !== r.score || p.status !== r.status;
  });
}

/** Split changed rows into publishRun batches of ≤60. */
export function chunkBatches(rows: RegistryRow[], size = BATCH_SIZE): RegistryBatch[] {
  const batches: RegistryBatch[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    batches.push({
      serviceIds: slice.map((r) => BigInt(r.serviceId)),
      scores: slice.map((r) => Math.round(r.score)),
      statuses: slice.map((r) => STATUS_TO_CODE[r.status] ?? 0),
    });
  }
  return batches;
}

/** sha256 over the compact results — matches hashVerdict's shape. */
export function indexHashOf(payload: unknown): `0x${string}` {
  return ("0x" + createHash("sha256").update(JSON.stringify(payload)).digest("hex")) as `0x${string}`;
}

export interface RegistryPublishResult {
  registry: string;
  txHashes: string[];
  updated: number;
}

/**
 * Publish the changed rows in batches of ≤60. Returns tx hashes once all
 * batches are confirmed; throws on the first failed batch (partial state is
 * still valid on-chain — each tx is self-contained).
 */
export async function publishIndexRun(
  indexHash: `0x${string}`,
  generatedAtIso: string,
  checkedCount: number,
  batches: RegistryBatch[],
): Promise<RegistryPublishResult> {
  const registry = process.env.PROBE_REGISTRY_ADDRESS;
  const pk = process.env.PROBE_ATTESTATION_PK ?? process.env.PROBE_PAYER_PK;
  if (!registry) throw new Error("PROBE_REGISTRY_ADDRESS unset");
  if (!pk) throw new Error("Neither PROBE_ATTESTATION_PK nor PROBE_PAYER_PK is set");

  const { createWalletClient, createPublicClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { xLayer } = await import("viem/chains");

  const account = privateKeyToAccount(pk as `0x${string}`);
  const transport = http(process.env.PROBE_RPC_URL || "https://xlayerrpc.okx.com");
  const publicClient = createPublicClient({ chain: xLayer, transport });
  const wallet = createWalletClient({ account, chain: xLayer, transport });

  const generatedAt = Math.floor(Date.parse(generatedAtIso) / 1000);
  const txHashes: string[] = [];
  let updated = 0;
  for (const batch of batches) {
    const txHash = await wallet.writeContract({
      address: registry as `0x${string}`,
      abi: registryAbi.abi,
      functionName: "publishRun",
      args: [
        indexHash,
        generatedAt,
        checkedCount,
        batch.serviceIds,
        batch.scores,
        batch.statuses,
      ],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`publishRun reverted: ${txHash}`);
    }
    txHashes.push(txHash);
    updated += batch.serviceIds.length;
  }
  return { registry, txHashes, updated };
}
