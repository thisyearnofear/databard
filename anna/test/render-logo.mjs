// Renders listing/logo.svg to a 512×512 PNG for the Developer Console.
// The SVG is opened as a document at exactly 512×512, so the screenshot is
// pixel-for-pixel the mark (no margins, no scaling).
//
// Usage: node test/render-logo.mjs

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const SESSION = "databard-anna-logo";
const cli = async (...a) => (await run("agent-browser", ["--session", SESSION, ...a])).stdout.trim();

const svg = join(here, "../listing/logo.svg");
const out = join(here, "../listing/logo-512.png");

try {
  await cli("set", "viewport", "512", "512");
  await cli("open", pathToFileURL(svg).href);
  await new Promise((r) => setTimeout(r, 400));
  await cli("screenshot", out);
  console.log(`logo written: ${out}`);
} finally {
  try { await cli("close"); } catch {}
}
