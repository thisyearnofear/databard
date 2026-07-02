#!/usr/bin/env node
/**
 * Local invariant runner — runs the same Python invariant tests that TestSprite Cloud
 * runs, but locally via pytest. Fast iteration for the loop (sub-minute per cycle);
 * TestSprite Cloud is still the "official" verification for submission evidence.
 *
 * Output shape mimics TestSprite's failure bundle so fixer.mjs doesn't care which
 * runner produced the failure.
 */
import { spawnSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO = resolve(new URL("../..", import.meta.url).pathname);
const TESTS_DIR = join(REPO, "tests/testsprite");

/**
 * Run one .py test against TARGET_URL. Returns { ok, pytestExitCode, stdout, stderr, failureBundle? }.
 * failureBundle shape imitates TestSprite:
 *   { status: "failed", analysis: { rootCauseHypothesis, recommendedFixTarget }, assertion }
 */
export function runLocalTest({ testFile, targetUrl }) {
  const testPath = join(TESTS_DIR, testFile);
  if (!existsSync(testPath)) return { ok: false, reason: `test file not found: ${testFile}` };

  const result = spawnSync(
    "python3",
    ["-m", "pytest", testPath, "-q", "--tb=short", "-s"],
    {
      cwd: REPO,
      env: { ...process.env, TARGET_URL: targetUrl },
      encoding: "utf-8",
      timeout: 240_000,
    },
  );

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const exitCode = result.status ?? -1;

  if (exitCode === 0) {
    return { ok: true, exitCode, stdout, stderr };
  }

  // Distinguish infrastructure failures (can't reach target, HTTP 500 from insufficient funds,
  // etc.) from real invariant failures. Infra failures should NOT trigger the fixer — no
  // amount of code editing fixes an unreachable server.
  const infraSignals = [
    /NameResolutionError|ConnectionError|MaxRetryError|Failed to resolve/,
    /HTTPError:\s+5\d\d/,
    /Connection refused/,
    /custom program error: 0x1/, // Solana: insufficient funds
    /Insufficient funds/,
  ];
  const combined = `${stdout}\n${stderr}`;
  const infraHit = infraSignals.find((re) => re.test(combined));
  if (infraHit) {
    return {
      ok: false,
      infra: true,
      exitCode,
      stdout,
      stderr,
      reason: `infrastructure failure (matches ${infraHit}) — target unreachable or on-chain funds insufficient`,
    };
  }

  // Parse the pytest output for the assertion line so we can hand a structured hint to the fixer.
  const assertMatch = stdout.match(/assert\s+.*|E\s+AssertionError:\s*.*|E\s+.*/g);
  const assertion = assertMatch ? assertMatch.slice(0, 6).join("\n") : "no assertion parsed";

  const failureBundle = {
    status: "failed",
    exitCode,
    testFile,
    stdout: stdout.slice(-3000),
    stderr: stderr.slice(-1500),
    assertion,
    analysis: {
      rootCauseHypothesis: inferHypothesis(testFile, stdout),
      recommendedFixTarget: recommendCandidate(testFile),
    },
  };
  return { ok: false, exitCode, stdout, stderr, failureBundle };
}

function inferHypothesis(testFile, stdout) {
  if (testFile.includes("digest_margin")) {
    return "Digest's parent price is not exceeding the sum of sub-WANT prices. The pricing strategy's `estimatedSubCost` or margin multiplier is likely too low — check src/lib/voice-config.ts DIGEST.pricingStrategy.";
  }
  if (testFile.includes("persona_fit")) {
    return "The buyer LLM's fit-vs-price weights are picking the wrong persona for the focus. Check the 0.68/0.32 split in src/lib/market/buyer.ts scoreBid.";
  }
  if (testFile.includes("escrow_state_machine")) {
    return "The escrow state machine allowed an out-of-order transition. Check VALID_TRANSITIONS in src/lib/market/protocol.ts.";
  }
  // Fallback: pull last-line assertion for a generic hint.
  const lines = stdout.split("\n").filter((l) => l.includes("assert") || l.includes("Error"));
  return lines.slice(-3).join(" | ") || "See stdout for assertion detail.";
}

function recommendCandidate(testFile) {
  if (testFile.includes("digest_margin")) return "src/lib/voice-config.ts";
  if (testFile.includes("persona_fit")) return "src/lib/market/buyer.ts";
  if (testFile.includes("escrow_state_machine")) return "src/lib/market/protocol.ts";
  return "src/lib/market/orchestrator.ts";
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const testFile = process.argv[2];
  const targetUrl = process.argv[3];
  if (!testFile || !targetUrl) {
    console.error("Usage: node local-runner.mjs <test-file> <target-url>");
    process.exit(2);
  }
  const res = runLocalTest({ testFile, targetUrl });
  if (res.ok) {
    console.log("✓ passed");
    console.log(res.stdout);
    process.exit(0);
  } else {
    console.log("✗ failed");
    console.log(res.stdout);
    console.log(JSON.stringify(res.failureBundle, null, 2));
    process.exit(res.exitCode ?? 1);
  }
}
