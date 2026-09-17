import { createHash } from "crypto";

export type EvidenceJson = null | boolean | number | string | EvidenceJson[] | { [key: string]: EvidenceJson };

export interface EvidenceReceipt {
  format: "databard.evidence-receipt";
  version: 1;
  canonicalization: "databard-json-v1";
  hashAlgorithm: "sha256";
  payload: { [key: string]: EvidenceJson };
  payloadHash: string;
}

/** DataBard JSON v1, not RFC 8785: sorted UTF-16 keys, JSON scalars, ordered arrays. */
export function canonicalEvidenceJson(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(input: unknown, depth: number): string {
    if (depth > 100) throw new Error("Evidence JSON exceeds maximum depth");
    if (input === null) return "null";
    if (typeof input === "string" || typeof input === "boolean") return JSON.stringify(input);
    if (typeof input === "number" && Number.isFinite(input)) return JSON.stringify(input);
    if (typeof input !== "object") throw new Error("Evidence must contain only JSON values");
    if (ancestors.has(input)) throw new Error("Evidence JSON must not contain cycles");
    ancestors.add(input);
    try {
      if (Array.isArray(input)) {
        if (Object.keys(input).length !== input.length || Object.getOwnPropertySymbols(input).length) {
          throw new Error("Evidence arrays must be dense without extra properties");
        }
        const entries: string[] = [];
        for (let i = 0; i < input.length; i++) {
          if (!Object.hasOwn(input, i)) throw new Error("Evidence arrays must be dense");
          entries.push(encode(input[i], depth + 1));
        }
        return `[${entries.join(",")}]`;
      }
      if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
        throw new Error("Evidence objects must be plain JSON objects");
      }
      if (Object.getOwnPropertySymbols(input).length) throw new Error("Evidence keys must be strings");
      const object = input as Record<string, unknown>;
      return `{${Object.keys(object).sort().map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (!descriptor || !("value" in descriptor)) throw new Error("Evidence must not contain getters");
        return `${JSON.stringify(key)}:${encode(descriptor.value, depth + 1)}`;
      }).join(",")}}`;
    } finally {
      ancestors.delete(input);
    }
  }
  return encode(value, 0);
}

export function hashEvidence(value: unknown): string {
  return createHash("sha256").update(canonicalEvidenceJson(value), "utf8").digest("hex");
}

/** Snapshots the payload; no wallet, SDK, network, credentials or storage needed. */
export function createEvidenceReceipt(payload: Record<string, unknown>): EvidenceReceipt {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Receipt payload must be a JSON object");
  }
  const canonical = canonicalEvidenceJson(payload);
  return {
    format: "databard.evidence-receipt",
    version: 1,
    canonicalization: "databard-json-v1",
    hashAlgorithm: "sha256",
    payload: JSON.parse(canonical),
    payloadHash: createHash("sha256").update(canonical, "utf8").digest("hex"),
  };
}

/** Integrity only: an unsigned receipt does NOT authenticate an issuer or prove truth. */
export function verifyEvidenceReceipt(
  value: unknown,
  preimages: { result?: unknown; snapshot?: unknown } = {},
): value is EvidenceReceipt {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const receipt = value as Record<string, unknown>;
    if (Object.keys(receipt).sort().join(",") !== "canonicalization,format,hashAlgorithm,payload,payloadHash,version") return false;
    if (receipt.format !== "databard.evidence-receipt" || receipt.version !== 1 ||
        receipt.canonicalization !== "databard-json-v1" || receipt.hashAlgorithm !== "sha256") return false;
    if (!receipt.payload || typeof receipt.payload !== "object" || Array.isArray(receipt.payload)) return false;
    if (typeof receipt.payloadHash !== "string" || !/^[a-f0-9]{64}$/.test(receipt.payloadHash)) return false;
    canonicalEvidenceJson(receipt);
    if (hashEvidence(receipt.payload) !== receipt.payloadHash) return false;
    const payload = receipt.payload as Record<string, unknown>;
    if (Object.hasOwn(preimages, "result") && hashEvidence(preimages.result) !== payload.resultHash) return false;
    if (Object.hasOwn(preimages, "snapshot")) {
      const evidence = payload.evidence as Record<string, unknown> | undefined;
      if (!evidence || hashEvidence(preimages.snapshot) !== evidence.snapshotHash) return false;
    }
    return true;
  } catch {
    return false;
  }
}
