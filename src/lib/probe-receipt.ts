/**
 * Probe Receipt evidence payloads for the BNB Chain ProbeReceiptRegistry.
 *
 * The receipt artifact is canonical JSON. Its sha256 is the bytes32 evidence
 * hash anchored on-chain; the subject hash is keccak256 of the canonical
 * subject URI enforced by the contract. Pure construction/validation helpers
 * live here so measurement, publication, and tests all use the same shape.
 */
import { createHash } from "crypto";
import { keccak256, stringToHex } from "viem";
import type { ProbeResult } from "./probe-runner";
import type { ProbeScore } from "./probe-scorer";

export const PROBE_RECEIPT_SCHEMA = "databard.probe-receipt.v1";
export const PROBE_RECEIPT_METHODOLOGY_VERSION = "2026-11-27.single-shot.v1";

export const RECEIPT_STATUS_CODES = {
  healthy: 1,
  degraded: 2,
  broken: 3,
  unreachable: 4,
} as const;

export type ReceiptStatus = keyof typeof RECEIPT_STATUS_CODES;

export interface ProbeReceiptEvidence {
  schema: typeof PROBE_RECEIPT_SCHEMA;
  subject: {
    uri: string;
    name: string;
    endpoint: string;
    protocol: "mcp" | "a2mcp";
  };
  measurement: {
    measuredAt: string;
    reachable: boolean;
    statusCode: number;
    latencyMs: number;
    error?: string;
    rawSnippet?: string;
    payment?: {
      challengeReceived: boolean;
      paid: boolean;
      amountUsd?: number;
      settlementTx?: string;
      error?: string;
    };
  };
  metrics: ProbeResult["metrics"];
  score: ProbeScore;
  assessment: {
    status: ReceiptStatus;
    label: ProbeScore["label"];
    summary: string;
  };
  methodology: {
    version: typeof PROBE_RECEIPT_METHODOLOGY_VERSION;
    runner: "databard-probe-runner";
    scorer: "databard-probe-scorer";
    paymentsAllowed: boolean;
    probeRequest: {
      method: "GET" | "POST";
      body?: Record<string, unknown>;
    };
    caveats: string[];
  };
}

export interface ReceiptContractInput {
  subjectHash: `0x${string}`;
  subjectUri: string;
  score: number;
  status: number;
  checkedAt: number;
  evidenceHash: `0x${string}`;
  evidenceUri: string;
}

export interface ProbeReceiptArtifact {
  evidence: ProbeReceiptEvidence;
  canonicalJson: string;
  evidenceHash: `0x${string}`;
  contractInput: ReceiptContractInput;
}

/** Deterministic JSON: object keys sorted, undefined object fields omitted. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => {
      const encoded = stableStringify(item);
      return encoded === "undefined" ? "null" : encoded;
    }).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",");
  return `{${body}}`;
}

export function sha256Bytes32(payload: string): `0x${string}` {
  return ("0x" + createHash("sha256").update(payload).digest("hex")) as `0x${string}`;
}

/** Normalize the endpoint portion of a subject URI without changing its path meaning. */
export function canonicalEndpointUrl(endpoint: string): string {
  const url = new URL(endpoint);
  url.hash = "";
  return url.toString();
}

export function canonicalSubjectUri(
  endpoint: string,
  protocol: "mcp" | "a2mcp" = "a2mcp",
): string {
  return `probe:${protocol}:${canonicalEndpointUrl(endpoint)}`;
}

export function subjectHashFor(subjectUri: string): `0x${string}` {
  return keccak256(stringToHex(subjectUri));
}

export function inferProbeProtocol(result: ProbeResult): "mcp" | "a2mcp" {
  const body = result.candidate.body as { jsonrpc?: string } | undefined;
  return body?.jsonrpc === "2.0" ? "mcp" : "a2mcp";
}

/** Conservative status mapping: never call an errored single-shot response healthy. */
export function receiptStatusFor(result: ProbeResult, score: ProbeScore): ReceiptStatus {
  if (!result.metrics.reachable) return "unreachable";
  if (result.statusCode >= 500 || score.total < 40) return "broken";
  if (result.metrics.hasError || result.statusCode >= 400 || score.total < 70) return "degraded";
  return "healthy";
}

function utf8Length(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function buildProbeReceiptEvidence(
  result: ProbeResult,
  score: ProbeScore,
  opts: {
    measuredAt?: string;
    paymentsAllowed?: boolean;
    subjectUri?: string;
  } = {},
): ProbeReceiptEvidence {
  const protocol = inferProbeProtocol(result);
  const endpoint = canonicalEndpointUrl(result.candidate.endpoint);
  const subjectUri = opts.subjectUri ?? canonicalSubjectUri(endpoint, protocol);
  const status = receiptStatusFor(result, score);
  const measuredAt = opts.measuredAt ?? new Date().toISOString();
  const probeBody = result.candidate.body as { method?: unknown } | undefined;
  const interfaceListOnly = probeBody?.method === "tools/list";

  if (!/^probe:(mcp|a2mcp):https?:\/\//.test(subjectUri)) {
    throw new Error("subjectUri must use probe:mcp: or probe:a2mcp: with an http(s) endpoint");
  }
  if (utf8Length(subjectUri) > 512) throw new Error("subjectUri exceeds contract limit");

  return {
    schema: PROBE_RECEIPT_SCHEMA,
    subject: {
      uri: subjectUri,
      name: result.candidate.name,
      endpoint,
      protocol,
    },
    measurement: {
      measuredAt,
      reachable: result.metrics.reachable,
      statusCode: result.statusCode,
      latencyMs: result.metrics.latencyMs,
      ...(result.error ? { error: result.error } : {}),
      ...(result.rawSnippet ? { rawSnippet: result.rawSnippet } : {}),
      ...(result.payment ? { payment: result.payment } : {}),
    },
    metrics: result.metrics,
    score,
    assessment: {
      status,
      label: score.label,
      summary:
        status === "healthy"
          ? interfaceListOnly
            ? "Single-shot MCP tools/list interface-health measurement passed DataBard's healthy receipt threshold."
            : "Single-shot Probe measurement passed DataBard's healthy receipt threshold."
          : status === "degraded"
            ? "Service was reachable, but the single-shot measurement showed degraded quality or errors."
            : status === "broken"
              ? "Service response was broken or too weak for payment reliance in this single-shot measurement."
              : "Service endpoint could not be reached in this single-shot measurement.",
    },
    methodology: {
      version: PROBE_RECEIPT_METHODOLOGY_VERSION,
      runner: "databard-probe-runner",
      scorer: "databard-probe-scorer",
      paymentsAllowed: opts.paymentsAllowed ?? false,
      probeRequest: {
        method: result.candidate.method ?? "POST",
        ...(result.candidate.body ? { body: result.candidate.body } : {}),
      },
      caveats: [
        "Single-shot measurement, not an uptime guarantee.",
        ...(interfaceListOnly
          ? ["MCP evidence is based on the tools/list interface response only; it does not invoke tools or verify tool-output correctness."]
          : []),
        "Credential checks are neutral unless a service-specific verifier was configured.",
        "Receipts measure the endpoint named in the subject URI only; they do not audit contracts, operators, or financial claims.",
      ],
    },
  };
}

/** Canonicalise evidence and derive exactly what publishReceipt expects. */
export function createProbeReceiptArtifact(
  evidence: ProbeReceiptEvidence,
  evidenceUri: string,
): ProbeReceiptArtifact {
  const canonicalJson = stableStringify(evidence);
  const evidenceHash = sha256Bytes32(canonicalJson);
  const checkedAt = Math.floor(Date.parse(evidence.measurement.measuredAt) / 1000);
  if (!Number.isFinite(checkedAt) || checkedAt <= 0) throw new Error("invalid measuredAt timestamp");
  if (!/^https:\/\//.test(evidenceUri)) throw new Error("evidenceUri must be an https URL");
  if (utf8Length(evidenceUri) > 512) throw new Error("evidenceUri exceeds contract limit");

  const score = Math.round(evidence.score.total);
  if (score < 0 || score > 100) throw new Error("score outside uint8 receipt range");

  return {
    evidence,
    canonicalJson,
    evidenceHash,
    contractInput: {
      subjectHash: subjectHashFor(evidence.subject.uri),
      subjectUri: evidence.subject.uri,
      score,
      status: RECEIPT_STATUS_CODES[evidence.assessment.status],
      checkedAt,
      evidenceHash,
      evidenceUri,
    },
  };
}
