import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

export function runTool(command, args, run = spawnSync) {
  const result = run(command, args, { encoding: "utf8", timeout: 120_000 });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || result.stderr?.slice(-800) || `exit ${result.status}`}`);
  }
  return result.stdout;
}

export function probeDurationSec(path, run = spawnSync) {
  const output = runTool("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], run);
  const duration = Number(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid media duration: ${path}`);
  return duration;
}

/** Must complete before creating files or requesting paid audio. */
export function preflight({ mux, silent, duration = 85 }, run = spawnSync) {
  if (mux && !existsSync(silent)) throw new Error(`Missing silent master: ${silent}`);
  runTool("ffprobe", ["-version"], run);
  if (mux) {
    runTool("ffmpeg", ["-version"], run);
    const actual = probeDurationSec(silent, run);
    if (Math.abs(actual - duration) > 0.1) throw new Error(`Silent master must be ${duration}s; got ${actual}s`);
  }
}

export function validateTiming(clips, duration = 85) {
  if (!Number.isFinite(duration) || duration <= 0 || !clips.length) throw new Error("Invalid timeline");
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const next = i + 1 < clips.length ? clips[i + 1].delayMs / 1000 : duration;
    const start = clip.delayMs / 1000;
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(clip.durationSec) || clip.durationSec <= 0 ||
        !Number.isFinite(next) || next <= start || next > duration || start + clip.durationSec > next) {
      throw new Error(`Clip ${clip.id} overlaps the next clip or exceeds the ${duration}s timeline`);
    }
  }
}

export function cacheKey({ voice, text, model, settings, outputFormat }) {
  return createHash("sha256").update(JSON.stringify({ voice, text, model, settings, outputFormat })).digest("hex");
}

export function audioHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function cacheMatches(path, key) {
  try {
    const record = JSON.parse(readFileSync(`${path}.json`, "utf8"));
    return record.key === key && record.audioHash === audioHash(readFileSync(path));
  } catch {
    return false;
  }
}

export async function requestAudio({ voice, text, model, settings, outputFormat, apiKey }, fetcher = fetch) {
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
  const response = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=${encodeURIComponent(outputFormat)}`, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: model, voice_settings: settings }),
  });
  if (!response.ok) throw new Error(`ElevenLabs request failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("ElevenLabs returned empty audio");
  return bytes;
}
