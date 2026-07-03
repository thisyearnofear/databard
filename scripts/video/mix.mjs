#!/usr/bin/env node
/**
 * Mix the Playwright recording + ElevenLabs voiceover into the final MP4.
 *
 * Video source: video/raw.webm (silent, 121s)
 * Audio source: video/narration.mp3 (86s)
 *
 * The narration starts 2s in (so the title beat lands first), and the video's end
 * plays out beyond the voice — silent tail is fine, it lets the "receipts ledger"
 * beat breathe.
 *
 * Final output: docs/DEMO.mp4 (H.264 + AAC, 1440x900).
 */
import { execSync } from "child_process";
import { existsSync, statSync } from "fs";
import { resolve } from "path";

const RAW = resolve(new URL("../../video/raw.webm", import.meta.url).pathname);
const AUDIO = resolve(new URL("../../video/narration.mp3", import.meta.url).pathname);
const OUT = resolve(new URL("../../docs/DEMO.mp4", import.meta.url).pathname);

if (!existsSync(RAW)) {
  console.error(`Missing ${RAW} — run scripts/video/record.mjs first.`);
  process.exit(1);
}
if (!existsSync(AUDIO)) {
  console.error(`Missing ${AUDIO} — run scripts/video/tts.mjs first.`);
  process.exit(1);
}

const AUDIO_START_DELAY_MS = 1500;

// Complex filter:
//   [1:a] adelay=1500|1500 → offset narration by 1.5s (title beat)
//   ,afade in over 0.4s, fade out final 1.0s
//   ,volume=1.1                                     → gentle boost
// The video stream is passed through re-encoded to h264 (yuv420p for wide compat).
// Apply the delay + fades via -af on input #1, then map cleanly. Avoids the ffmpeg
// filter_complex label-parsing quirk with adelay.
const audioFilter = [
  "aformat=channel_layouts=stereo",
  `adelay=${AUDIO_START_DELAY_MS}|${AUDIO_START_DELAY_MS}`,
  "afade=t=in:st=0:d=0.4",
  "afade=t=out:st=88:d=1.5",
  "volume=1.1",
].join(",");

const args = [
  "-y",
  "-i", RAW,
  "-i", AUDIO,
  "-map", "0:v:0",
  "-map", "1:a:0",
  "-af", audioFilter,
  "-c:v", "libx264",
  "-preset", "medium",
  "-crf", "20",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "192k",
  "-movflags", "+faststart",
  OUT,
];

console.log(`Mixing → ${OUT}`);
try {
  // Quote args that contain spaces or filter commas so the shell parses correctly.
  const cmd = `ffmpeg ${args.map((a) => (/[\s,|=]/.test(a) ? `"${a}"` : a)).join(" ")}`;
  execSync(cmd, { stdio: ["ignore", "inherit", "pipe"] });
} catch (e) {
  console.error("ffmpeg failed:", e.message);
  console.error(e.stderr?.toString?.().slice(-2000));
  process.exit(1);
}

const size = statSync(OUT).size;
console.log(`\n✓ ${OUT} (${(size / 1024 / 1024).toFixed(1)} MB)`);
