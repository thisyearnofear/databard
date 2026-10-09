#!/usr/bin/env node
/**
 * check-surface-rules — enforces the surface contract from docs/DESIGN.md.
 *
 * Mechanical rules only (the ones a script can judge):
 *   1. No pictographic emoji in UI files — use PixelIcon (src/components/dither-kit/icon.tsx).
 *      Allowed: typographic symbols (✓ ✗ → · — etc.) and anything in server-rendered
 *      outputs where PixelIcon can't run (API routes, email/webhook text, OG images).
 *   2. No hardcoded hex colors in UI files — use the CSS vars from globals.css.
 *      Allowed: src/app/api/** (server-rendered PNG/SVG), src/lib/** (email/canvas
 *      renderers, score-tone owns the palette), src/components/dither-kit/** (kit
 *      internals), and lines marked `// surface-rules: allow`.
 *   3. External links with target="_blank" must carry rel="noopener noreferrer".
 *
 * Opt out of a specific line with a trailing comment:  // surface-rules: allow
 *
 * Run: node scripts/check-surface-rules.mjs  (wired into `npm run test:unit`)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../src", import.meta.url).pathname;

/** Paths exempt from the emoji + hex rules (non-DOM rendering contexts). */
const EXEMPT_PREFIXES = ["src/app/api/", "src/lib/", "src/components/dither-kit/"];
const EXEMPT_FILES = new Set([
  "src/components/editions/DitherSeal.tsx", // runtime fallback for a CSS var read via getComputedStyle
]);

const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const EMOJI_ALLOW = new Set(["✓", "✕", "✖", "✗", "✘", "⚐"]); // typographic marks, not emoji
// Only match hexes in style position (after a quote/paren/bracket), so plain
// text like "ASP #9878" doesn't false-positive.
const HEX = /["'(\[]\s*#[0-9a-fA-F]{3,8}\b/;
const ANCHOR_OPEN = /<a\b[^>]*>/gs;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(entry.name)) yield p;
  }
}

const violations = [];

for (const file of walk(SRC)) {
  const rel = file.replace(SRC, "src").replace(/^\//, "");
  const src = readFileSync(file, "utf8");
  const exempt = EXEMPT_PREFIXES.some((p) => rel.startsWith(p)) || EXEMPT_FILES.has(rel);
  const lines = src.split("\n");

  if (!exempt) {
    lines.forEach((line, i) => {
      if (line.includes("surface-rules: allow")) return;
      const bad = [...line].filter((c) => EMOJI.test(c) && !EMOJI_ALLOW.has(c));
      if (bad.length) {
        violations.push(`${rel}:${i + 1}  emoji ${bad.join("")} — use PixelIcon (docs/DESIGN.md)\n    ${line.trim().slice(0, 100)}`);
      }
      if (HEX.test(line)) {
        violations.push(`${rel}:${i + 1}  hardcoded hex color — use a CSS var (docs/DESIGN.md)\n    ${line.trim().slice(0, 100)}`);
      }
    });
  }

  // Rule 3 applies everywhere — external links are external links.
  for (const m of src.matchAll(ANCHOR_OPEN)) {
    const tag = m[0];
    if (tag.includes('target="_blank"') && !tag.includes("noopener")) {
      const line = src.slice(0, m.index).split("\n").length;
      violations.push(`${rel}:${line}  target="_blank" missing rel="noopener noreferrer"\n    ${tag.trim().slice(0, 100)}`);
    }
  }
}

if (violations.length) {
  console.error(`✗ ${violations.length} surface-rule violation(s):\n\n${violations.join("\n")}\n`);
  console.error(`Contract: docs/DESIGN.md · exempt a line with  // surface-rules: allow`);
  process.exit(1);
}
console.log("✓ surface rules clean");
