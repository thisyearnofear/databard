#!/usr/bin/env node
/**
 * Generate the demo voiceover via ElevenLabs.
 *
 * Reads scripts/video/narration.txt, sends to ElevenLabs TTS with a slower, more
 * measured voice (George — the DataBard default), and writes to video/narration.mp3.
 *
 * The narration is broken into paragraphs so ElevenLabs gets natural cadence.
 * Uses the same voice ID as the podcast pipeline (JBFqnCBsd6RMkjVDRZzb / George).
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const NARRATION = resolve(new URL("./narration.txt", import.meta.url).pathname);
const OUT = resolve(new URL("../../video/narration.mp3", import.meta.url).pathname);

// Load .env for ELEVENLABS_API_KEY
try {
  const env = readFileSync(resolve(new URL("../../.env", import.meta.url).pathname), "utf-8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env optional */ }

const VOICE_ID = process.env.DEMO_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb"; // George
const MODEL_ID = "eleven_multilingual_v2";
const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error("ELEVENLABS_API_KEY not set. Add it to .env.");
  process.exit(1);
}

async function tts(text) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
  const body = {
    text,
    model_id: MODEL_ID,
    voice_settings: {
      stability: 0.55,
      similarity_boost: 0.75,
      style: 0.35,
      use_speaker_boost: true,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${err.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const script = readFileSync(NARRATION, "utf-8").trim();
  const paragraphs = script.split(/\n\n+/).filter((p) => p.trim().length > 0);
  console.log(`Rendering ${paragraphs.length} paragraphs…`);
  const chunks = [];
  for (let i = 0; i < paragraphs.length; i++) {
    process.stdout.write(`  [${i + 1}/${paragraphs.length}] ${paragraphs[i].slice(0, 60)}…\n`);
    const buf = await tts(paragraphs[i]);
    chunks.push(buf);
  }
  const combined = Buffer.concat(chunks);
  writeFileSync(OUT, combined);
  console.log(`\n✓ Wrote ${OUT} (${(combined.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error("tts failed:", e.message);
  process.exit(1);
});
