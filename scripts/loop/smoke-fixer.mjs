#!/usr/bin/env node
/**
 * End-to-end fixer smoke test — does NOT touch git or the market.
 *
 * Deliberately corrupts a tiny sandbox file, then invokes the fixer with a fake test
 * failure describing what's wrong. Verifies:
 *   1. The provider chain returns SOMETHING
 *   2. The JSON parser accepts the response
 *   3. The patch validates + applies
 *   4. The sandbox file ends up in the expected state
 *
 * Restores the file to its original after each run.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { resolve, join } from "path";
import { proposeAndApplyFix } from "./fixer.mjs";

// Load .env
try {
  const envFile = readFileSync(resolve(new URL("../../.env", import.meta.url).pathname), "utf-8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env optional */ }

const REPO = resolve(new URL("../..", import.meta.url).pathname);
const SANDBOX_DIR = join(REPO, ".loop/smoke");
const SANDBOX_SRC_DIR = join(SANDBOX_DIR, "src/lib/market");
const SANDBOX_FILE_REL = ".loop/smoke/src/lib/market/rates.ts";
const SANDBOX_TEST_REL = "tests/testsprite/test_smoke_rate.py";

if (!existsSync(SANDBOX_SRC_DIR)) mkdirSync(SANDBOX_SRC_DIR, { recursive: true });

// A tiny file with a deliberately wrong constant. The "test" says the correct value is 0.15.
const BROKEN_SRC = `// Sandbox target — the loop's fixer must change 0.05 to 0.15 to pass the invariant test.
// This is a smoke-test fixture; not shipped in production builds.
export const HOUSE_TAKE_RATIO = 0.05;

export function houseTake(gross: number): number {
  return gross * HOUSE_TAKE_RATIO;
}
`;

// The "test" is descriptive — the fixer reads it as the invariant it must satisfy.
const FAKE_TEST_SRC = `"""
INVARIANT: HOUSE_TAKE_RATIO in .loop/smoke/src/lib/market/rates.ts must be exactly 0.15.
The current value is 0.05; the fixer must update it to 0.15 for the invariant to hold.
"""
def test_house_take_ratio_is_15pct():
    # The value 0.15 corresponds to 15%, the target ratio.
    from rates import HOUSE_TAKE_RATIO
    assert HOUSE_TAKE_RATIO == 0.15, f"expected 0.15, got {HOUSE_TAKE_RATIO}"
`;

writeFileSync(join(REPO, SANDBOX_FILE_REL), BROKEN_SRC);
writeFileSync(join(REPO, SANDBOX_TEST_REL), FAKE_TEST_SRC);

console.log("Sandbox seeded:");
console.log(`  target: ${SANDBOX_FILE_REL} (contains HOUSE_TAKE_RATIO = 0.05)`);
console.log(`  test:   ${SANDBOX_TEST_REL}\n`);

const test = {
  name: "smoke-house-take-ratio",
  file: "test_smoke_rate.py",
  scopeHint: SANDBOX_FILE_REL,
  candidatePath: SANDBOX_FILE_REL,
};

const fakeFailure = {
  status: "failed",
  analysis: {
    rootCauseHypothesis: "HOUSE_TAKE_RATIO is 0.05 but the invariant requires 0.15.",
    recommendedFixTarget: SANDBOX_FILE_REL,
  },
  assertion: "expected 0.15, got 0.05",
};

const start = Date.now();
const result = await proposeAndApplyFix({
  repoRoot: REPO,
  test,
  failure: fakeFailure,
  candidatePath: SANDBOX_FILE_REL,
});
const ms = Date.now() - start;

console.log(`\n──── result (${ms}ms) ────`);
console.log(JSON.stringify(result, null, 2));

if (result.ok) {
  const patched = readFileSync(join(REPO, SANDBOX_FILE_REL), "utf-8");
  const contains015 = patched.includes("0.15");
  console.log(`\nsandbox now contains "0.15"? ${contains015 ? "✓ yes" : "✗ NO"}`);
  console.log(`\npatched file:\n${patched}`);
}

// Cleanup
rmSync(join(REPO, SANDBOX_FILE_REL), { force: true });
rmSync(join(REPO, SANDBOX_TEST_REL), { force: true });
try { rmSync(SANDBOX_DIR, { recursive: true, force: true }); } catch {}
console.log("Sandbox cleaned up.");
