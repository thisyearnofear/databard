#!/usr/bin/env node
/**
 * Fast local loop — same shape as loop.mjs but uses pytest locally (via local-runner.mjs)
 * instead of TestSprite Cloud. Ideal for iterating on the fixer + collecting LOOP.md
 * evidence without paying cloud round-trip latency.
 *
 * The tests are the SAME Python files that TestSprite Cloud runs. This runner mirrors
 * the failure-bundle shape so the fixer sees identical structure either way.
 *
 * Usage:
 *   node scripts/loop/loop-local.mjs [test-name] [--target-url <url>]
 *
 * If --target-url is not given, uses the running dev server at http://localhost:3000
 * (assumes the caller started dev + tunnel already, or is running against localhost).
 */
import { spawnSync, execSync } from "child_process";
import { readFileSync, appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { runLocalTest } from "./local-runner.mjs";
import { proposeAndApplyFix } from "./fixer.mjs";
import { precheckForGraphCycle, recycleFromNewsroom } from "./wallet-ops.mjs";

// Load .env
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
const MAX_ITERATIONS = 4;

if (!existsSync(LOOP_DIR)) mkdirSync(LOOP_DIR, { recursive: true });

const DEFAULT_TESTS = [
  {
    name: "digest-margin",
    file: "test_digest_margin.py",
    scopeHint: "src/lib/voice-config.ts inside the `const DIGEST: PersonaSeller` block — specifically the `estimatedSubCost` line inside DIGEST.pricingStrategy. Do NOT touch SIGNAL, CASCADE, or NEWSROOM.",
    candidatePath: "src/lib/voice-config.ts",
    expectedAnchor: "estimatedSubCost", // old_string must include this
    disallowedInFile: [],
  },
  {
    name: "persona-fit",
    file: "test_persona_fit.py",
    scopeHint: "src/lib/market/buyer.ts inside `function scoreBid` — the `0.68 * fit + 0.32 * priceValue` line. Do NOT change other functions.",
    candidatePath: "src/lib/market/buyer.ts",
    expectedAnchor: "fit + 0",
    disallowedInFile: [],
  },
  {
    name: "escrow-state-machine",
    file: "test_escrow_state_machine.py",
    scopeHint: "src/lib/market/protocol.ts inside `const VALID_TRANSITIONS`. Only edit the transition allow-list.",
    candidatePath: "src/lib/market/protocol.ts",
    expectedAnchor: "VALID_TRANSITIONS",
    disallowedInFile: [],
  },
];

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: opts.silent ? "pipe" : "inherit", encoding: "utf-8", cwd: ROOT, ...opts });
}

function commitFix(iter, message) {
  try {
    sh(`git add -A`, { silent: true });
    const diffStat = sh(`git diff --cached --stat`, { silent: true }).trim();
    if (!diffStat) {
      log("[git] no changes to commit — fixer's patch was a no-op");
      return null;
    }
    const subject = message ?? `loop(fix): iteration ${iter}`;
    const body = `${diffStat}\n\napplied by scripts/loop/loop-local.mjs (iteration ${iter})`;
    const tmp = join(LOOP_DIR, `commit-msg-${Date.now()}.txt`);
    writeFileSync(tmp, `${subject}\n\n${body}\n`);
    sh(`git commit -F '${tmp}'`, { silent: true });
    const sha = sh(`git rev-parse --short HEAD`, { silent: true }).trim();
    log(`[git] committed ${sha}`);
    return sha;
  } catch (e) {
    log(`[git] commit failed: ${e.message.slice(0, 200)}`);
    return null;
  }
}

function appendLoopMd(entry) {
  const line = `\n---\n\n### ${entry.timestamp} — \`${entry.test}\` iteration ${entry.iteration}\n\n**Status:** ${entry.status}\n${entry.commit ? `**Commit:** \`${entry.commit}\`\n` : ""}${entry.rootCause ? `**Root cause:** ${entry.rootCause}\n` : ""}${entry.provider ? `**Fixer provider:** ${entry.provider}\n` : ""}${entry.reasoning ? `**Fixer reasoning:** ${entry.reasoning}\n` : ""}${entry.runner ? `**Runner:** ${entry.runner}\n` : ""}`;
  appendFileSync(LOOP_MD, line);
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => !a.startsWith("--"));
  const urlIdx = args.indexOf("--target-url");
  const targetUrl = urlIdx >= 0 ? args[urlIdx + 1] : "http://localhost:3000";

  const tests = only ? DEFAULT_TESTS.filter((t) => t.name === only) : DEFAULT_TESTS;
  if (tests.length === 0) throw new Error(`No matching test for '${only}'.`);

  log(`Target URL: ${targetUrl}`);
  log(`Running invariants: ${tests.map((t) => t.name).join(", ")}`);

  // Pre-flight wallet check — invariants that hit the market flow need real devnet SOL.
  // Without this, drained wallets return HTTP 500 which look identical to invariant failures.
  const needsWallets = tests.some((t) => ["digest-margin", "persona-fit", "escrow-state-machine"].includes(t.name));
  if (needsWallets) {
    const pre = await precheckForGraphCycle();
    if (!pre.ok) {
      log(`[precheck] ${pre.message}`);
      log(`[precheck] attempting to recycle from Newsroom's accumulated balance…`);
      const rec = await recycleFromNewsroom();
      if (!rec.ok) {
        log(`[precheck] recycle failed: ${rec.reason ?? "unknown"}`);
        log(`[precheck] ✗ cannot proceed. Top up main wallet (see LOOP.md) and rerun.`);
        process.exit(3);
      }
      log(`[precheck] recycled — Consumer +${rec.results.find((r) => r.role === "Consumer")?.amountSol.toFixed(4)} SOL, DigestBuyer +${rec.results.find((r) => r.role === "DigestBuyer")?.amountSol.toFixed(4)} SOL`);
      const post = await precheckForGraphCycle();
      if (!post.ok) {
        log(`[precheck] ✗ still short after recycle: ${post.message}`);
        process.exit(3);
      }
    }
    log(`[precheck] ✓ wallets ready`);
  }
  log("");

  for (const test of tests) {
    let passed = false;
    for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
      log(`\n═══ Test '${test.name}' — iteration ${iter}/${MAX_ITERATIONS} ═══`);
      const res = runLocalTest({ testFile: test.file, targetUrl });
      if (res.ok) {
        log(`✓ ${test.name} passed on iteration ${iter}`);
        passed = true;
        appendLoopMd({
          timestamp: new Date().toISOString(),
          test: test.name,
          iteration: iter,
          status: "✓ passed",
          runner: "local pytest",
        });
        break;
      }

      // Infra failure — target unreachable or on-chain funds insufficient. Try to recycle
      // wallets from Newsroom's accumulated balance and retry ONCE before giving up.
      if (res.infra) {
        log(`⚠ ${test.name} — infrastructure failure. Attempting recycle + retry.`);
        log(`  reason: ${res.reason}`);
        const rec = await recycleFromNewsroom();
        if (rec.ok) {
          const consumerGain = rec.results.filter((r) => r.role === "Consumer" && !r.error).reduce((n, r) => n + r.amountSol, 0);
          const digestGain = rec.results.filter((r) => r.role === "DigestBuyer" && !r.error).reduce((n, r) => n + r.amountSol, 0);
          log(`  recycled: Consumer +${consumerGain.toFixed(4)} SOL, DigestBuyer +${digestGain.toFixed(4)} SOL`);
          const retry = runLocalTest({ testFile: test.file, targetUrl });
          if (retry.ok) {
            log(`✓ ${test.name} passed after recycle`);
            passed = true;
            appendLoopMd({
              timestamp: new Date().toISOString(),
              test: test.name,
              iteration: iter,
              status: "✓ passed after Newsroom → Consumer recycle",
              runner: "local pytest",
            });
            break;
          }
        }
        appendLoopMd({
          timestamp: new Date().toISOString(),
          test: test.name,
          iteration: iter,
          status: `⚠ infrastructure failure — ${res.reason}`,
          runner: "local pytest",
        });
        break;
      }

      log(`× ${test.name} failed on iteration ${iter}`);
      log(`  assertion: ${res.failureBundle.assertion.split("\n")[0]}`);

      // Attempt fix
      const patch = await proposeAndApplyFix({
        repoRoot: ROOT,
        test,
        failure: res.failureBundle,
        candidatePath: test.candidatePath,
        expectedAnchor: test.expectedAnchor,
      });

      if (!patch.ok) {
        log(`[fixer] × all providers exhausted: ${patch.reason}`);
        appendLoopMd({
          timestamp: new Date().toISOString(),
          test: test.name,
          iteration: iter,
          status: `× failed → fixer bailed (${patch.reason})`,
          runner: "local pytest",
        });
        break;
      }

      log(`[fixer] ✓ ${patch.provider} patched ${patch.path}`);
      log(`  reasoning: ${patch.reasoning}`);
      const sha = commitFix(iter, patch.commitMessage);
      appendLoopMd({
        timestamp: new Date().toISOString(),
        test: test.name,
        iteration: iter,
        status: `× failed → fixer patched (${sha ?? "no diff"})`,
        commit: sha,
        provider: patch.provider,
        reasoning: patch.reasoning,
        rootCause: res.failureBundle.analysis?.rootCauseHypothesis,
        runner: "local pytest",
      });
    }
    if (!passed) log(`⚠ Gave up on ${test.name} after ${MAX_ITERATIONS} iterations.`);
  }
  log("\nLoop complete.");
}

main().catch((e) => {
  console.error("Loop failed:", e);
  process.exit(1);
});
