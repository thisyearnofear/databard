#!/usr/bin/env node
/**
 * Generate demo audio using ElevenLabs API directly.
 * Reads segments from public/sample-episode.json, synthesizes each via TTS,
 * saves individual MP3s to public/segments/, then concatenates into public/demo-episode.mp3.
 *
 * Usage: node scripts/generate-demo.js
 * Requires: ELEVENLABS_API_KEY in .env, ffmpeg installed
 */

const fs = require("fs");
const path = require("path");

// Load .env manually (no dotenv dependency)
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}
const { execSync } = require("child_process");

const SAMPLE_PATH = path.join(__dirname, "../public/sample-episode.json");
const SEGMENTS_DIR = path.join(__dirname, "../public/segments");
const OUTPUT_PATH = path.join(__dirname, "../public/demo-episode.mp3");

// Same voice IDs as audio-engine.ts
const VOICES = {
  Alex: "JBFqnCBsd6RMkjVDRZzb", // George
  Morgan: "EXAVITQu4vr4xnSDxMaL", // Sarah
};

const MODEL = "eleven_multilingual_v2";

async function synthesize(segment, prevText, nextText) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  const voiceId = VOICES[segment.speaker];
  if (!voiceId) throw new Error(`Unknown speaker: ${segment.speaker}`);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const body = {
    text: segment.text,
    model_id: MODEL,
    output_format: "mp3_44100_128",
    ...(prevText && { previous_text: prevText }),
    ...(nextText && { next_text: nextText }),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${errText}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log("🎙️  DataBard Demo Audio Generator\n");

  // Check ffmpeg
  try {
    execSync("which ffmpeg", { stdio: "ignore" });
  } catch {
    console.error("❌ ffmpeg not found. Install it: brew install ffmpeg");
    process.exit(1);
  }

  const episode = JSON.parse(fs.readFileSync(SAMPLE_PATH, "utf-8"));
  fs.mkdirSync(SEGMENTS_DIR, { recursive: true });

  const script = episode.script;
  console.log(`📝 ${script.length} segments to generate\n`);

  // Generate each segment
  for (let i = 0; i < script.length; i++) {
    const seg = script[i];
    const num = String(i + 1).padStart(2, "0");
    const filename = `${num}-${seg.speaker.toLowerCase()}-${seg.topic}.mp3`;
    const filepath = path.join(SEGMENTS_DIR, filename);

    // Skip if already exists
    if (fs.existsSync(filepath) && fs.statSync(filepath).size > 1000) {
      console.log(`⏭️  [${i + 1}/${script.length}] ${filename} (cached)`);
      continue;
    }

    const prev = i > 0 ? script[i - 1].text : undefined;
    const next = i < script.length - 1 ? script[i + 1].text : undefined;

    console.log(`🔊 [${i + 1}/${script.length}] ${filename} ...`);
    const buffer = await synthesize(seg, prev, next);
    fs.writeFileSync(filepath, buffer);
    console.log(`   ✅ ${(buffer.length / 1024).toFixed(1)} KB`);

    // Small delay to avoid rate limits
    if (i < script.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Concatenate with ffmpeg
  console.log("\n🔗 Concatenating segments...");
  const filelistPath = path.join(SEGMENTS_DIR, "filelist.txt");
  const files = fs
    .readdirSync(SEGMENTS_DIR)
    .filter((f) => f.endsWith(".mp3"))
    .sort();

  fs.writeFileSync(
    filelistPath,
    files.map((f) => `file '${f}'`).join("\n")
  );

  execSync(
    `ffmpeg -f concat -safe 0 -i "${filelistPath}" -c copy "${OUTPUT_PATH}" -y`,
    { cwd: SEGMENTS_DIR, stdio: "inherit" }
  );

  fs.unlinkSync(filelistPath);

  const size = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Created ${OUTPUT_PATH} (${size} MB)`);
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
