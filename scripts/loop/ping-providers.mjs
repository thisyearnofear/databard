#!/usr/bin/env node
/**
 * Smoke-test the provider fallback chain — asks each configured provider to output the
 * single word "PONG" as JSON. Fast round-trip check before spinning up the full loop.
 * Never prints keys.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { enabledProviders, listConfigured } from "./providers.mjs";

// Load .env
try {
  const envFile = readFileSync(resolve(new URL("../../.env", import.meta.url).pathname), "utf-8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env optional */ }

const configured = listConfigured();
if (configured.length === 0) {
  console.error("No providers configured — set VENICE_API_KEY / NVIDIA_NIM_API_KEY / ANTHROPIC_API_KEY");
  process.exit(1);
}

console.log(`Fallback order: ${configured.join(" → ")}\n`);

const system = `Reply ONLY with the JSON: {"ping":"pong"}. No prose, no fences.`;
const user = `ping`;

for (const p of enabledProviders()) {
  process.stdout.write(`  ${p.name.padEnd(10)} `);
  const start = Date.now();
  try {
    const text = await p.chat({ system, user, maxTokens: 64 });
    const ms = Date.now() - start;
    const parsed = safeParseFirstJson(text);
    if (parsed && parsed.ping === "pong") {
      console.log(`✓ ${ms}ms  ${p.model}`);
    } else {
      console.log(`△ ${ms}ms  responded but not valid JSON (${p.model})`);
      console.log(`    got: ${text.slice(0, 120).replace(/\n/g, " ")}`);
    }
  } catch (e) {
    const ms = Date.now() - start;
    console.log(`✗ ${ms}ms  ${e.message.slice(0, 200)}`);
  }
}

function safeParseFirstJson(s) {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}
