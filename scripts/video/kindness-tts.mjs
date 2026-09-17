#!/usr/bin/env node
/**
 * Generate timed narration for the Monid video; --mux adds it to a local master.
 * Default is offline --check. --generate explicitly opts into paid TTS calls.
 *
 * Voices: Cascade defaults — George (narrator/Alex), Charlotte (Morgan).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { preflight, probeDurationSec, validateTiming, cacheKey, cacheMatches, audioHash, requestAudio, runTool } from "./kindness-audio.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const OUT_DIR = resolve(ROOT, "video/out/audio");
const SILENT = resolve(ROOT, "video/out/databard-kindness-silent.mp4");
const FINAL = resolve(ROOT, "video/out/databard-kindness-final.mp4");

try {
  const env = readFileSync(resolve(ROOT, ".env"), "utf-8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* optional */
}

const API_KEY = process.env.ELEVENLABS_API_KEY;

const MODEL = process.env.ELEVENLABS_TTS_MODEL ?? "eleven_multilingual_v2";
const NARRATOR = process.env.DEMO_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb"; // George
const ALEX = "JBFqnCBsd6RMkjVDRZzb"; // George
const MORGAN = "XB0fDUnXU5powFXDhCwa"; // Charlotte

/** Scene VO timed to DataGarden.tsx SCENE map (85s). delayMs = when clip starts. */
const CLIPS = [
  {
    id: "01-hook",
    voice: NARRATOR,
    delayMs: 400,
    text: "Dune is the backbone of this industry. It helps teams explore their data.",
  },
  {
    id: "02-seat",
    voice: NARRATOR,
    delayMs: 8200,
    text: "DataBard complements those tools: an analyst that explains findings and recommends a next step.",
  },
  {
    id: "03-reach",
    voice: NARRATOR,
    delayMs: 20200,
    text: "Monid connects agents to metered data tools. Our recorded example used DEX price bars from surf.",
  },
  {
    id: "04-call",
    voice: NARRATOR,
    delayMs: 32400,
    text: "One call. DataBard runs the endpoint, scores the data's health, and writes the recommendations. The data source and payment method are separate choices.",
  },
  {
    id: "05-receipt",
    voice: NARRATOR,
    delayMs: 48400,
    text: "The recorded Monid fetch cost six-tenths of a cent. That is upstream data cost, not the total price of a narrated analysis. The response includes the provider cost receipt.",
  },
  {
    id: "06-song-narr",
    voice: NARRATOR,
    delayMs: 64200,
    text: "It explains the finding.",
  },
  {
    id: "06-alex",
    voice: ALEX,
    delayMs: 67500,
    text: "Our recorded run had forty-three rows and a health score of ninety-five.",
  },
  {
    id: "06-morgan",
    voice: MORGAN,
    delayMs: 74500,
    text: "One table lacked an owner. A health score is not proof the data is correct.",
  },
  {
    id: "07-close",
    voice: NARRATOR,
    delayMs: 80800,
    text: "Thank you, Dune. We killed them with kindness.",
  },
];

const SETTINGS = { stability: 0.55, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true };
const OUTPUT_FORMAT = "mp3_44100_128";

async function main() {
  const flags = new Set(process.argv.slice(2));
  for (const flag of flags) {
    if (!["--mux", "--reuse", "--generate", "--check"].includes(flag)) throw new Error(`Unknown flag: ${flag}`);
  }
  if (flags.has("--check") && flags.has("--generate")) throw new Error("Choose --check or --generate");
  const generate = flags.has("--generate");
  preflight({ mux: flags.has("--mux"), silent: SILENT });
  const plans = CLIPS.map((clip) => {
    const path = resolve(OUT_DIR, `${clip.id}.mp3`);
    const key = cacheKey({ ...clip, model: MODEL, settings: SETTINGS, outputFormat: OUTPUT_FORMAT });
    return { ...clip, path, key, cached: cacheMatches(path, key) };
  });
  if (!generate) {
    if (plans.some((clip) => !clip.cached)) throw new Error("Missing/stale audio cache. --generate explicitly opts into paid TTS requests.");
  } else {
    if ((!flags.has("--reuse") || plans.some((clip) => !clip.cached)) && !API_KEY) throw new Error("ELEVENLABS_API_KEY not set");
    mkdirSync(OUT_DIR, { recursive: true });
  }
  const paths = [];

  for (let i = 0; i < plans.length; i++) {
    const c = plans[i];
    const out = c.path;
    process.stdout.write(`[${i + 1}/${CLIPS.length}] ${c.id}… `);
    if (c.cached && (!generate || flags.has("--reuse"))) {
      console.log("reuse");
    } else {
      const buf = await requestAudio({ ...c, apiKey: API_KEY, model: MODEL, settings: SETTINGS, outputFormat: OUTPUT_FORMAT });
      writeFileSync(out, buf);
      writeFileSync(`${out}.json`, JSON.stringify({ key: c.key, audioHash: audioHash(buf) }));
      console.log(`${(buf.length / 1024).toFixed(1)} KB`);
    }
    const dur = probeDurationSec(out);
    validateTiming([{ ...c, durationSec: dur }], i + 1 < plans.length ? plans[i + 1].delayMs / 1000 : 85);
    paths.push({ ...c, path: out, durationSec: dur });
    console.log(`    → ${dur.toFixed(2)}s @ ${(c.delayMs / 1000).toFixed(1)}s`);
  }

  validateTiming(paths);
  if (!generate && (!flags.has("--mux") || flags.has("--check"))) {
    console.log("Offline validation passed; no TTS requests or output writes.");
    return;
  }
  writeFileSync(
    resolve(OUT_DIR, "manifest.json"),
    JSON.stringify(paths.map(({ id, delayMs, durationSec, text }) => ({ id, delayMs, durationSec, text })), null, 2),
  );

  if (!process.argv.includes("--mux")) {
    console.log("\nClips ready. Re-run with --mux to validate/reuse the cache and stitch onto the silent master (no paid TTS).");
    return;
  }

  if (!existsSync(SILENT)) {
    console.error(`Missing silent master: ${SILENT}`);
    process.exit(1);
  }

  // Build amix of delayed mono clips → stereo, then mux under video.
  const inputs = ["-i", SILENT];
  for (const p of paths) {
    inputs.push("-i", p.path);
  }

  const delayed = paths
    .map((p, i) => {
      const idx = i + 1; // 0 is video
      return `[${idx}:a]adelay=${p.delayMs}|${p.delayMs},apad=whole_dur=85[a${i}]`;
    })
    .join(";");
  const mixInputs = paths.map((_, i) => `[a${i}]`).join("");
  const filter = `${delayed};${mixInputs}amix=inputs=${paths.length}:duration=longest:normalize=0[aout]`;

  const args = [
    "-y",
    ...inputs,
    "-filter_complex",
    filter,
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    FINAL,
  ];

  console.log("\nMuxing…");
  runTool("ffmpeg", args);
  const finalDur = probeDurationSec(FINAL);
  if (Math.abs(finalDur - 85) > 0.1) throw new Error(`Final video duration mismatch: ${finalDur}`);
  console.log(`\n✓ ${FINAL} (${finalDur.toFixed(2)}s)`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
