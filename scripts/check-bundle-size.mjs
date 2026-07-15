/**
 * Bundle size guard — runs after `next build` + `prepare-standalone`.
 * Fails the build if the standalone output exceeds the threshold, catching
 * bundle bloat regressions before they ship.
 *
 * Usage: node scripts/check-bundle-size.mjs
 * Exit code 1 if any check fails.
 */
import { statSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const STANDALONE_DIR = '.next/standalone';
const THRESHOLD_MB = 120; // Current healthy size is ~73MB; 120MB gives headroom
const WARN_MB = 90;

function dirSize(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += dirSize(path);
    } else {
      total += statSync(path).size;
    }
  }
  return total;
}

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

const size = dirSize(STANDALONE_DIR);
const sizeMB = size / 1024 / 1024;

console.log(`\nBundle size check:`);
console.log(`  .next/standalone: ${mb(size)}`);

if (sizeMB > THRESHOLD_MB) {
  console.error(`\n❌ FAIL: Bundle size ${mb(size)} exceeds ${THRESHOLD_MB}MB threshold.`);
  console.error(`   This usually means a heavy directory is being traced into the bundle.`);
  console.error(`   Check next.config.mjs outputFileTracingExcludes and prepare-standalone.mjs filter.`);
  process.exit(1);
}

if (sizeMB > WARN_MB) {
  console.warn(`\n⚠️  WARN: Bundle size ${mb(size)} is above ${WARN_MB}MB (threshold: ${THRESHOLD_MB}MB).`);
  console.warn(`   Not failing the build, but investigate before it grows further.`);
} else {
  console.log(`  ✓ Under ${WARN_MB}MB warning threshold`);
}

// Also check for known bloat signatures
const contractsDir = join(STANDALONE_DIR, 'contracts');
if (existsSync(contractsDir)) {
  const contractsSize = dirSize(contractsDir);
  console.error(`\n❌ FAIL: contracts/ directory (${mb(contractsSize)}) found in standalone output.`);
  console.error(`   Rust build artifacts should never be in the server bundle.`);
  console.error(`   Check outputFileTracingExcludes in next.config.mjs.`);
  process.exit(1);
}

const videoDir = join(STANDALONE_DIR, 'video');
if (existsSync(videoDir)) {
  const videoSize = dirSize(videoDir);
  console.error(`\n❌ FAIL: video/ directory (${mb(videoSize)}) found in standalone output.`);
  console.error(`   Video files should never be in the server bundle.`);
  console.error(`   Check outputFileTracingExcludes in next.config.mjs.`);
  process.exit(1);
}

console.log(`  ✓ No bloat signatures detected\n`);
