// Scorer drift + sample sanity. The bundle's community-health.js must be
// byte-identical to a fresh transpile of src/lib/community-health.ts —
// regenerate with `node scripts/build-anna-scorer.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { parseCsv, analyzeCommunityData, verdictFor, SAMPLES } from "../bundle/community-health.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(root, "src/lib/community-health.ts");
const OUT = join(root, "anna/bundle/community-health.js");

const HEADER = `// GENERATED FILE — do not edit.
// Emitted by scripts/build-anna-scorer.mjs from src/lib/community-health.ts
// (ts.transpileModule, ESM, ES2022). Regenerate after any scorer change;
// anna/test/scorer.mjs fails on drift.
`;

test("generated scorer matches a fresh transpile (no drift)", () => {
  const src = readFileSync(SRC, "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    fileName: "community-health.ts",
  });
  assert.equal(readFileSync(OUT, "utf8"), HEADER + outputText);
});

test("all three SAMPLES score to stable report shapes", () => {
  for (const s of SAMPLES) {
    const { header, rows } = parseCsv(s.csv);
    const report = analyzeCommunityData(header, rows);
    assert.equal(typeof report.score, "number");
    assert.ok(report.score >= 0 && report.score <= 100);
    assert.ok(["healthy", "at-risk", "critical"].includes(report.label));
    assert.ok(Array.isArray(report.checks) && report.checks.length > 0);
    assert.ok(report.checks.every((c) => ["pass", "partial", "fail"].includes(c.state)));
    assert.equal(report.rowCount, rows.length);
    assert.equal(report.columnCount, header.length);
    assert.ok(typeof verdictFor(report).title === "string" && verdictFor(report).title.length > 0);
  }
});

test("the three samples land in three different places", () => {
  const scores = SAMPLES.map((s) => {
    const { header, rows } = parseCsv(s.csv);
    return analyzeCommunityData(header, rows).score;
  });
  assert.ok(scores[1] > scores[0], "healthy beats messy");
  assert.ok(scores[0] > scores[2] || scores[1] > scores[2], "stale scores worst");
});
