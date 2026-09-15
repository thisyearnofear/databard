/**
 * Probe scorer — computes a composite trust score (0–100) for an A2MCP
 * endpoint based on probe metrics.
 *
 * Scoring rubric:
 *   - schemaCompleteness (30%): does the /tools response have name, description,
 *     inputSchema with properties? Are examples provided?
 *   - latency (20%): response time relative to thresholds
 *   - freshness (20%): does the response carry a generatedAt / timestamp that is recent?
 *   - priceValue (15%): cost-per-call relative to richness of output
 *   - errorRate (15%): did the probe succeed cleanly or did it error/degrade?
 *
 * Pure function — no I/O, fully unit-testable.
 */

export interface ProbeMetrics {
  /** true if the endpoint returned a valid response (any status) */
  reachable: boolean;
  /** HTTP status code of the probe call */
  statusCode: number;
  /** Response time in milliseconds */
  latencyMs: number;
  /** true if /tools returned a valid JSON schema with properties */
  hasInputSchema: boolean;
  /** true if the tool listing includes examples */
  hasExamples: boolean;
  /** true if the tool listing includes a description field */
  hasDescription: boolean;
  /** number of tools advertised */
  toolCount: number;
  /** true if the response includes a generatedAt or timestamp field */
  hasTimestamp: boolean;
  /** how recent the timestamp is in minutes (null if absent) */
  timestampAgeMinutes: number | null;
  /** price per call in USD (0 if free, null if unknown) */
  priceUsd: number | null;
  /** number of fields in the response payload (proxy for richness) */
  responseFieldCount: number;
  /** true if the response was a demo/fallback (demo: true) */
  isDemo: boolean;
  /** true if the response contained an error or degradation notice */
  hasError: boolean;
  /** Ligis credential check result (null if not queried) */
  credentialVerified?: boolean | null;
}

export interface ProbeScore {
  total: number;
  label: "excellent" | "good" | "fair" | "poor" | "unreachable";
  breakdown: {
    schemaCompleteness: number;
    latency: number;
    freshness: number;
    priceValue: number;
    reliability: number;
    credentials: number;
  };
  flags: string[];
}

const WEIGHTS = {
  schemaCompleteness: 0.25,
  latency: 0.18,
  freshness: 0.17,
  priceValue: 0.13,
  reliability: 0.13,
  credentials: 0.14,
} as const;

/** Score schema completeness 0–100 */
function scoreSchema(m: ProbeMetrics): number {
  if (!m.reachable) return 0;
  let score = 0;
  if (m.hasInputSchema) score += 40;
  if (m.hasDescription) score += 25;
  if (m.hasExamples) score += 20;
  if (m.toolCount >= 2) score += 15;
  else if (m.toolCount === 1) score += 8;
  return Math.min(100, score);
}

/** Score latency 0–100 (lower is better) */
function scoreLatency(m: ProbeMetrics): number {
  if (!m.reachable) return 0;
  if (m.latencyMs <= 500) return 100;
  if (m.latencyMs <= 1000) return 90;
  if (m.latencyMs <= 2000) return 75;
  if (m.latencyMs <= 5000) return 55;
  if (m.latencyMs <= 10000) return 35;
  if (m.latencyMs <= 30000) return 15;
  return 5;
}

/** Score freshness 0–100 */
function scoreFreshness(m: ProbeMetrics): number {
  if (!m.reachable) return 0;
  if (!m.hasTimestamp || m.timestampAgeMinutes === null) return 40; // no timestamp is mediocre
  const age = m.timestampAgeMinutes;
  if (age <= 5) return 100;
  if (age <= 30) return 85;
  if (age <= 120) return 65;
  if (age <= 1440) return 45; // within a day
  return 20;
}

/** Score price-to-value ratio 0–100 */
function scorePriceValue(m: ProbeMetrics): number {
  if (!m.reachable) return 0;
  if (m.priceUsd === null) return 50; // unknown pricing is neutral
  if (m.priceUsd === 0) {
    // Free service — high value, but slightly less trustworthy than paid
    return m.responseFieldCount >= 5 ? 90 : 75;
  }
  // Paid: value = richness / price
  const richness = m.responseFieldCount;
  if (m.priceUsd <= 0.10 && richness >= 5) return 95;
  if (m.priceUsd <= 0.50 && richness >= 5) return 85;
  if (m.priceUsd <= 1.00 && richness >= 8) return 80;
  if (m.priceUsd <= 1.00 && richness >= 4) return 65;
  if (m.priceUsd <= 5.00 && richness >= 10) return 60;
  if (m.priceUsd > 5.00) return 30;
  return 50;
}

/** Score reliability 0–100 */
function scoreReliability(m: ProbeMetrics): number {
  if (!m.reachable) return 0;
  let score = 100;
  if (m.hasError) score -= 50;
  if (m.isDemo) score -= 30; // demo fallback is less reliable than live data
  if (m.statusCode >= 500) score -= 40;
  else if (m.statusCode >= 400) score -= 25;
  return Math.max(0, score);
}

/** Score credentials 0–100 (Ligis integration) */
function scoreCredentials(m: ProbeMetrics): number {
  if (!m.reachable) return 0;
  if (m.credentialVerified === true) return 100;
  if (m.credentialVerified === false) return 10;
  // null / undefined means not checked — neutral score
  return 50;
}

function label(total: number): ProbeScore["label"] {
  if (total >= 80) return "excellent";
  if (total >= 60) return "good";
  if (total >= 40) return "fair";
  if (total >= 1) return "poor";
  return "unreachable";
}

export function scoreProbe(m: ProbeMetrics): ProbeScore {
  if (!m.reachable) {
    return {
      total: 0,
      label: "unreachable",
      breakdown: {
        schemaCompleteness: 0,
        latency: 0,
        freshness: 0,
        priceValue: 0,
        reliability: 0,
        credentials: 0,
      },
      flags: ["Endpoint unreachable"],
    };
  }

  const breakdown = {
    schemaCompleteness: scoreSchema(m),
    latency: scoreLatency(m),
    freshness: scoreFreshness(m),
    priceValue: scorePriceValue(m),
    reliability: scoreReliability(m),
    credentials: scoreCredentials(m),
  };

  const total = Math.round(
    breakdown.schemaCompleteness * WEIGHTS.schemaCompleteness +
    breakdown.latency * WEIGHTS.latency +
    breakdown.freshness * WEIGHTS.freshness +
    breakdown.priceValue * WEIGHTS.priceValue +
    breakdown.reliability * WEIGHTS.reliability +
    breakdown.credentials * WEIGHTS.credentials
  );

  const flags: string[] = [];
  if (m.isDemo) flags.push("Returned demo/fallback data");
  if (m.hasError) flags.push("Response contained errors");
  if (m.latencyMs > 10000) flags.push("Very slow response");
  if (!m.hasInputSchema) flags.push("No input schema advertised");
  if (m.priceUsd === null) flags.push("Pricing unknown");
  if (m.credentialVerified === false) flags.push("Credentials NOT verified by Ligis");
  if (m.credentialVerified === true) flags.push("Credentials verified via Ligis");

  return { total, label: label(total), breakdown, flags };
}
