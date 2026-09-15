import { scoreProbe, type ProbeMetrics } from "../src/lib/probe-scorer";

function makeMetrics(overrides: Partial<ProbeMetrics> = {}): ProbeMetrics {
  return {
    reachable: true,
    statusCode: 200,
    latencyMs: 800,
    hasInputSchema: true,
    hasExamples: true,
    hasDescription: true,
    toolCount: 2,
    hasTimestamp: true,
    timestampAgeMinutes: 3,
    priceUsd: 0.5,
    responseFieldCount: 8,
    isDemo: false,
    hasError: false,
    credentialVerified: null,
    ...overrides,
  };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

// Test 1: unreachable endpoint scores 0
{
  const result = scoreProbe(makeMetrics({ reachable: false }));
  assert(result.total === 0, "unreachable scores 0");
  assert(result.label === "unreachable", "unreachable label");
}

// Test 2: perfect endpoint scores high
{
  const result = scoreProbe(makeMetrics({ credentialVerified: true }));
  assert(result.total >= 80, `perfect endpoint scores >= 80 (got ${result.total})`);
  assert(result.label === "excellent", `perfect endpoint labelled excellent (got ${result.label})`);
}

// Test 3: slow endpoint gets lower latency score
{
  const fast = scoreProbe(makeMetrics({ latencyMs: 200 }));
  const slow = scoreProbe(makeMetrics({ latencyMs: 25000 }));
  assert(fast.breakdown.latency > slow.breakdown.latency, "fast > slow latency score");
}

// Test 4: demo fallback reduces reliability
{
  const live = scoreProbe(makeMetrics({ isDemo: false }));
  const demo = scoreProbe(makeMetrics({ isDemo: true }));
  assert(live.breakdown.reliability > demo.breakdown.reliability, "live > demo reliability");
}

// Test 5: error response reduces reliability
{
  const clean = scoreProbe(makeMetrics({ hasError: false }));
  const errored = scoreProbe(makeMetrics({ hasError: true }));
  assert(clean.breakdown.reliability > errored.breakdown.reliability, "clean > errored reliability");
}

// Test 6: missing schema reduces schemaCompleteness
{
  const withSchema = scoreProbe(makeMetrics({ hasInputSchema: true }));
  const noSchema = scoreProbe(makeMetrics({ hasInputSchema: false }));
  assert(withSchema.breakdown.schemaCompleteness > noSchema.breakdown.schemaCompleteness, "schema present > absent");
}

// Test 7: free endpoint with rich response gets high priceValue
{
  const result = scoreProbe(makeMetrics({ priceUsd: 0, responseFieldCount: 8 }));
  assert(result.breakdown.priceValue >= 85, `free+rich gets high priceValue (got ${result.breakdown.priceValue})`);
}

// Test 8: expensive endpoint with sparse response gets low priceValue
{
  const result = scoreProbe(makeMetrics({ priceUsd: 10, responseFieldCount: 2 }));
  assert(result.breakdown.priceValue <= 35, `expensive+sparse gets low priceValue (got ${result.breakdown.priceValue})`);
}

// Test 9: stale timestamp reduces freshness
{
  const fresh = scoreProbe(makeMetrics({ timestampAgeMinutes: 2 }));
  const stale = scoreProbe(makeMetrics({ timestampAgeMinutes: 5000 }));
  assert(fresh.breakdown.freshness > stale.breakdown.freshness, "fresh > stale freshness");
}

// Test 10: no timestamp gets mediocre freshness (not zero)
{
  const result = scoreProbe(makeMetrics({ hasTimestamp: false, timestampAgeMinutes: null }));
  assert(result.breakdown.freshness === 40, `no timestamp = 40 (got ${result.breakdown.freshness})`);
}

// Test 11: 500 status reduces reliability heavily
{
  const ok = scoreProbe(makeMetrics({ statusCode: 200 }));
  const serverErr = scoreProbe(makeMetrics({ statusCode: 500 }));
  assert(ok.breakdown.reliability > serverErr.breakdown.reliability, "200 > 500 reliability");
}

// Test 12: flags include demo warning
{
  const result = scoreProbe(makeMetrics({ isDemo: true }));
  assert(result.flags.some(f => f.includes("demo")), "flags mention demo");
}

// Test 13: total is between 0 and 100
{
  const result = scoreProbe(makeMetrics());
  assert(result.total >= 0 && result.total <= 100, "total in range");
}

// Test 14: breakdown keys all present (6 dimensions now)
{
  const result = scoreProbe(makeMetrics());
  const keys = Object.keys(result.breakdown);
  assert(keys.length === 6, `breakdown has 6 keys (got ${keys.length})`);
  assert(keys.includes("schemaCompleteness"), "has schemaCompleteness");
  assert(keys.includes("latency"), "has latency");
  assert(keys.includes("freshness"), "has freshness");
  assert(keys.includes("priceValue"), "has priceValue");
  assert(keys.includes("reliability"), "has reliability");
  assert(keys.includes("credentials"), "has credentials");
}

// Test 15: verified credentials boost score
{
  const verified = scoreProbe(makeMetrics({ credentialVerified: true }));
  const unverified = scoreProbe(makeMetrics({ credentialVerified: false }));
  const unchecked = scoreProbe(makeMetrics({ credentialVerified: null }));
  assert(verified.breakdown.credentials === 100, "verified = 100");
  assert(unverified.breakdown.credentials === 10, "unverified = 10");
  assert(unchecked.breakdown.credentials === 50, "unchecked = 50 (neutral)");
  assert(verified.total > unverified.total, "verified total > unverified total");
}

// Test 16: credential flag appears
{
  const verified = scoreProbe(makeMetrics({ credentialVerified: true }));
  assert(verified.flags.some(f => f.includes("Ligis")), "verified flag mentions Ligis");
  const unverified = scoreProbe(makeMetrics({ credentialVerified: false }));
  assert(unverified.flags.some(f => f.includes("NOT verified")), "unverified flag warns");
}

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed > 0) process.exit(1);
