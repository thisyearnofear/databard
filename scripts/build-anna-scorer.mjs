#!/usr/bin/env node
// Emits anna/bundle/community-health.js from src/lib/community-health.ts —
// the Anna bundle consumes the SAME scorer code, transpiled with the repo's
// own typescript. The generated file is committed; anna/test/scorer.mjs
// fails when it drifts. Run: node scripts/build-anna-scorer.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "src/lib/community-health.ts");
const OUT = join(root, "anna/bundle/community-health.js");

const HEADER = `// GENERATED FILE — do not edit.
// Emitted by scripts/build-anna-scorer.mjs from src/lib/community-health.ts
// (ts.transpileModule, ESM, ES2022). Regenerate after any scorer change;
// anna/test/scorer.mjs fails on drift.
`;

const src = readFileSync(SRC, "utf8");
const { outputText } = ts.transpileModule(src, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "community-health.ts",
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, HEADER + outputText);
console.log(`wrote ${OUT}`);
