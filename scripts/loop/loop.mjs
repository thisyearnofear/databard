#!/usr/bin/env node
/**
 * DataBard × TestSprite verification loop.
 *
 * This is the autonomous coding-agent loop DataBard submits to the TestSprite Season 3
 * hackathon. It:
 *
 *   1. Spins up the local Next.js dev server + a Cloudflare Tunnel so TestSprite Cloud
 *      can hit the machine's endpoints
 *   2. Uploads each invariant test (Python + requests + pytest) to TestSprite
 *   3. Runs the tests to a terminal verdict
 *   4. On any failure, calls Claude Code non-interactively to diagnose + patch the code
 *      in-place, guided by the TestSprite failure bundle
 *   5. Re-runs; iterates until green (or hits a hard cap of MAX_ITERATIONS)
 *   6. Appends each iteration's outcome to LOOP.md — the audit trail that becomes the
 *      hackathon's Loop-Quality submission evidence
 *
 * Design notes:
 *   - Backend tests cost 0 credits per run in TestSprite. We use pytest/requests specs
 *     hitting our /api/market/* routes to assert economic invariants (Digest margin
 *     positive, Cascade wins Quality, escrow state machine, etc.).
 *   - Claude Code (`claude -p`) is the coding agent. The loop hands it the failing test
 *     source + the TestSprite root-cause hypothesis + a scope hint (which lib file to
 *     edit) and asks for a minimal patch. Every patch is committed by the loop so a human
 *     reviewer sees an exact audit trail.
 *   - Iterations are bounded (MAX_ITERATIONS = 4). If the loop can't fix in that budget,
 *     it stops and asks a human. Runaway loops are worse than honest failures.
 */
import { spawn, execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { setTimeout as delay } from "timers/promises";
import { proposeAndApplyFix } from "./fixer.mjs";

// Load .env into process.env so ANTHROPIC_API_KEY + TESTSPRITE_API_KEY are available.
try {
  const envFile = readFileSync(resolve(new URL("../../.env", import.meta.url).pathname), "utf-8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env optional */ }

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const LOOP_DIR = join(ROOT, ".loop");
const LOOP_MD = join(ROOT, "LOOP.md");
const TESTS_DIR = join(ROOT, "tests/testsprite");

const PROJECT_ID_BACKEND = "98d788db-4ec4-46ea-abb9-49acd9d4ffd5";
const MAX_ITERATIONS = 4;
const DEFAULT_TESTS = [
  {
    name: "digest-margin",
    file: "test_digest_margin.py",
    scopeHint: "src/lib/voice-config.ts (DIGEST pricingStrategy) or src/lib/market/reseller.ts (sub-WANT deadline)",
    candidatePath: "src/lib/voice-config.ts",
  },
  {
    name: "persona-fit",
    file: "test_persona_fit.py",
    scopeHint: "src/lib/market/buyer.ts (scoreBid weights) or src/lib/voice-config.ts (persona costFloor)",
    candidatePath: "src/lib/market/buyer.ts",
  },
  {
    name: "escrow-state-machine",
    file: "test_escrow_state_machine.py",
    scopeHint: "src/lib/market/protocol.ts (VALID_TRANSITIONS) or src/lib/market/orchestrator.ts (deliver/release guards)",
    candidatePath: "src/lib/market/orchestrator.ts",
  },
];

if (!existsSync(LOOP_DIR)) mkdirSync(LOOP_DIR, { recursive: true });

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: opts.silent ? "pipe" : "inherit", encoding: "utf-8", cwd: ROOT, ...opts });
}

async function startDevServer() {
  log("Starting Next.js dev server on :3000…");
  const proc = spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", (d) => { if (process.env.LOOP_VERBOSE) process.stderr.write("[dev] " + d); });
  proc.stderr.on("data", (d) => { if (process.env.LOOP_VERBOSE) process.stderr.write("[dev] " + d); });
  // Poll until responsive
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    try {
      const res = await fetch("http://localhost:3000/api/market/keypairs");
      if (res.ok) {
        log("Dev server responsive.");
        return proc;
      }
    } catch { /* not ready */ }
    await delay(1000);
  }
  proc.kill();
  throw new Error("Dev server did not start within 60s.");
}

async function startTunnel() {
  log("Starting Cloudflare Tunnel to localhost:3000…");
  const proc = spawn("cloudflared", ["tunnel", "--url", "http://localhost:3000"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let publicUrl = null;
  proc.stdout.on("data", (d) => { process.stderr.write("[tunnel] " + d); });
  proc.stderr.on("data", (d) => {
    const s = d.toString();
    process.stderr.write("[tunnel] " + s);
    const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !publicUrl) publicUrl = m[0];
  });
  const start = Date.now();
  while (!publicUrl && Date.now() - start < 60_000) await delay(500);
  if (!publicUrl) {
    proc.kill();
    throw new Error("Cloudflare Tunnel URL not detected within 60s.");
  }
  log("Tunnel established:", publicUrl);
  return { proc, url: publicUrl };
}

/** Create a test on TestSprite, run it against `targetUrl`, wait for verdict. */
async function runTest(test, targetUrl) {
  log(`[testsprite] creating test '${test.name}' with code file ${test.file}…`);
  const codePath = join(TESTS_DIR, test.file);
  const cmd = [
    "testsprite", "test", "create",
    "--project", PROJECT_ID_BACKEND,
    "--type", "backend",
    "--name", test.name,
    "--code-file", codePath,
    "--target-url", targetUrl,
    "--run", "--wait",
    "--timeout", "300",
    "--output", "json",
  ];
  let out;
  try {
    out = sh(cmd.map((a) => `'${a}'`).join(" "), { silent: true });
  } catch (e) {
    // Non-zero exit = failure or error. Capture both stdout + stderr.
    out = (e.stdout ?? "") + (e.stderr ?? "");
    log(`[testsprite] test '${test.name}' non-zero exit (${e.status})`);
    return { ok: false, raw: out, exitCode: e.status };
  }
  const parsed = safeJson(out);
  return { ok: true, raw: out, parsed, exitCode: 0 };
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/** Retrieve the failure bundle from TestSprite for the failing test. */
async function getFailureBundle(testId) {
  const outDir = join(LOOP_DIR, `failure-${testId}`);
  try {
    sh(`testsprite test failure get '${testId}' --out '${outDir}' --output json`, { silent: true });
  } catch (e) {
    log(`[testsprite] failure get returned ${e.status}, stdout: ${e.stdout}`);
  }
  const bundlePath = join(outDir, "bundle.json");
  if (existsSync(bundlePath)) {
    return { path: outDir, bundle: JSON.parse(readFileSync(bundlePath, "utf-8")) };
  }
  return { path: outDir, bundle: null };
}

/** Ask Anthropic API for a JSON-structured patch. Apply it via fs. No nested CLI. */
async function attemptFix({ test, failure }) {
  log(`[fixer] proposing patch for '${test.name}' via Anthropic API…`);
  const result = await proposeAndApplyFix({
    repoRoot: ROOT,
    test,
    failure,
    candidatePath: test.candidatePath,
  });
  if (!result.ok) {
    log(`[fixer] × ${result.reason}`);
    return null;
  }
  log(`[fixer] ✓ patched ${result.path}: ${result.reasoning}`);
  return result;
}

function commitFix(test, iteration, message) {
  try {
    sh(`git add -A`, { silent: true });
    const diffStat = sh(`git diff --cached --stat`, { silent: true }).trim();
    if (!diffStat) {
      log("[git] no changes to commit — fixer's patch was a no-op");
      return null;
    }
    const subject = message ?? `loop(${test.name}): fix iteration ${iteration}`;
    const body = `${diffStat}\n\napplied by scripts/loop/loop.mjs (iteration ${iteration})`;
    const tmp = join(LOOP_DIR, `commit-msg-${Date.now()}.txt`);
    writeFileSync(tmp, `${subject}\n\n${body}\n`);
    sh(`git commit -F '${tmp}'`, { silent: true });
    const sha = sh(`git rev-parse --short HEAD`, { silent: true }).trim();
    log(`[git] committed ${sha}`);
    return sha;
  } catch (e) {
    log(`[git] commit failed: ${e.message}`);
    return null;
  }
}

function appendLoopMd(entry) {
  const line = `\n---\n\n### ${entry.timestamp} — \`${entry.test}\` iteration ${entry.iteration}\n\n**Status:** ${entry.status}\n${entry.commit ? `**Commit:** \`${entry.commit}\`\n` : ""}${entry.rootCause ? `**Root cause:** ${entry.rootCause}\n` : ""}${entry.fix ? `**Fix:** ${entry.fix}\n` : ""}`;
  appendFileSync(LOOP_MD, line);
}

// ------------------------------- main -------------------------------

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => !a.startsWith("--"));
  const skipTunnel = args.includes("--target-url");
  const targetUrlOverride = args.includes("--target-url") ? args[args.indexOf("--target-url") + 1] : null;

  const tests = only ? DEFAULT_TESTS.filter((t) => t.name === only) : DEFAULT_TESTS;
  if (tests.length === 0) throw new Error(`No matching test for '${only}'.`);

  let devProc, tunnelProc, targetUrl;

  try {
    if (targetUrlOverride) {
      targetUrl = targetUrlOverride;
      log(`Using target-url override: ${targetUrl}`);
    } else {
      devProc = await startDevServer();
      const t = await startTunnel();
      tunnelProc = t.proc;
      targetUrl = t.url;
      // Small settle so the tunnel routing propagates.
      await delay(3000);
    }

    for (const test of tests) {
      let passed = false;
      for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
        log(`\n═══ Test '${test.name}' — iteration ${iter}/${MAX_ITERATIONS} ═══`);
        const res = await runTest(test, targetUrl);
        if (res.exitCode === 0) {
          const runInfo = res.parsed?.run ?? {};
          const status = runInfo.status ?? "passed";
          if (status === "passed") {
            log(`✓ ${test.name} passed on iteration ${iter}`);
            passed = true;
            appendLoopMd({
              timestamp: new Date().toISOString(),
              test: test.name,
              iteration: iter,
              status: "✓ passed",
            });
            break;
          }
        }
        // Failure path
        const testId = res.parsed?.testId ?? res.parsed?.test?.id;
        const runId = res.parsed?.run?.id ?? res.parsed?.runId;
        log(`× ${test.name} failed on iteration ${iter} (testId=${testId ?? "?"}, runId=${runId ?? "?"})`);

        if (!testId) {
          log("No testId available — cannot invoke fixer. Aborting this test.");
          break;
        }

        const fb = await getFailureBundle(testId);
        const patch = await attemptFix({ test, failure: fb.bundle ?? res.raw });
        const sha = patch ? commitFix(test, iter, patch.commitMessage) : null;
        appendLoopMd({
          timestamp: new Date().toISOString(),
          test: test.name,
          iteration: iter,
          status: patch ? `× failed → fixer patched (${sha ?? "no diff"})` : `× failed → fixer bailed`,
          commit: sha,
          rootCause: fb.bundle?.analysis?.rootCauseHypothesis ?? patch?.reasoning,
          fix: patch?.path,
        });
      }
      if (!passed) {
        log(`⚠ Gave up on ${test.name} after ${MAX_ITERATIONS} iterations.`);
      }
    }
  } finally {
    if (tunnelProc) tunnelProc.kill();
    if (devProc) devProc.kill();
    log("Loop complete. Servers stopped.");
  }
}

main().catch((e) => {
  console.error("Loop failed:", e);
  process.exit(1);
});
