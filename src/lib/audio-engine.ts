/**
 * Audio engine — all ElevenLabs interactions in one place.
 * TTS (two voices), sound effects, music generation, and stream-to-buffer helpers.
 * Uses file-backed cache for audio persistence across restarts.
 */
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { Readable } from "stream";
import type { ScriptSegment, MusicPlan } from "./types";
import { audioCache } from "./store";
import { getVoiceConfig, type VoiceConfig } from "./voice-config";

// Two fixed podcast host voices — persona-scoped when caller passes an override,
// otherwise falls back to the runtime-overridable store (Pro settings UI).
function getVoices(override?: VoiceConfig) {
  const cfg = override ?? getVoiceConfig();
  return {
    Alex: cfg.alex,
    Morgan: cfg.morgan,
  } as const;
}

// Default TTS model for the flagship/subscription product. The $1 briefing
// overrides per-call (Flash) — see BRIEFING_TTS_MODEL. Set
// ELEVENLABS_TTS_MODEL to change the global default for all callers.
const DEFAULT_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL ?? "eleven_multilingual_v2";
const AUDIO_CACHE_TTL = 86400; // 24 hours

let client: ElevenLabsClient | null = null;

function getClient(): ElevenLabsClient {
  if (!client) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set in environment");
    client = new ElevenLabsClient({ apiKey });
  }
  return client;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === retries) {
        console.error("Final retry failed:", e);
        throw e;
      }
      console.warn(`Retry ${attempt + 1}/${retries}:`, e);
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw new Error("Unreachable");
}

function getCached(key: string): Buffer | null {
  const b64 = audioCache.get(key);
  return b64 ? Buffer.from(b64, "base64") : null;
}

function setCached(key: string, buffer: Buffer, ttl = AUDIO_CACHE_TTL): void {
  if (buffer.length === 0) return; // Don't cache empty buffers (skipped SFX)
  audioCache.set(key, buffer.toString("base64"), ttl);
}

/** Simple hash for cache keys */
function hashKey(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Synthesize a Data Anthem via ElevenLabs Music API */
export async function synthesizeMusic(plan: MusicPlan): Promise<Buffer> {
  const cacheKey = `audio:music:${hashKey(JSON.stringify(plan))}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  // Format composition plan for ElevenLabs API
  const body = {
    composition_plan: {
      positive_global_styles: plan.positiveGlobalStyles,
      negative_global_styles: plan.negativeGlobalStyles,
      sections: plan.sections.map(s => ({
        section_name: s.sectionName,
        duration_ms: s.durationMs,
        lines: s.lines,
        positive_local_styles: s.positiveStyles || [],
        negative_local_styles: s.negativeStyles || []
      }))
    },
    respect_sections_durations: true,
    output_format: "mp3_44100_128"
  };

  console.log(`[Music] Calling https://api.elevenlabs.io/v1/music/detailed`);
  console.log(`[Music] Genre: ${plan.genre}, Mood: ${plan.mood}`);

  const response = await withRetry(() => fetch("https://api.elevenlabs.io/v1/music/detailed", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }), 1, 3000); // 1 retry, longer delay for music

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Music] Error response:`, errorText);
    throw new Error(`ElevenLabs Music API error: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  console.log(`[Music] Got ${buffer.length} bytes`);
  setCached(cacheKey, buffer);
  return buffer;
}

/** Synthesize a single script segment to mp3 buffer */
export async function synthesizeSpeech(
  segment: ScriptSegment,
  prevText?: string,
  nextText?: string,
  voiceOverride?: VoiceConfig,
  modelOverride?: string,
): Promise<Buffer> {
  const voices = getVoices(voiceOverride);
  const model = modelOverride ?? DEFAULT_TTS_MODEL;
  const cacheKey = `audio:speech:${model}:${voices[segment.speaker]}:${hashKey(segment.text)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voices[segment.speaker]}?output_format=mp3_44100_128`;
  const body = {
    text: segment.text,
    model_id: model,
    ...(prevText && { previous_text: prevText }),
    ...(nextText && { next_text: nextText }),
  };

  console.log(`[TTS] Calling ${url}`);

  const response = await withRetry(() => fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }));

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[TTS] Error response:`, errorText);
    throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  setCached(cacheKey, buffer);
  return buffer;
}

/** Generate a short sound effect via ElevenLabs Sound Generation API */
export async function synthesizeSfx(prompt: string, durationSeconds = 2): Promise<Buffer> {
  const cacheKey = `audio:sfx:${hashKey(prompt)}:${durationSeconds}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn(`[SFX skipped - no API key]: ${prompt}`);
    return Buffer.alloc(0);
  }

  try {
    const response = await withRetry(() => fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: durationSeconds,
        prompt_influence: 0.3,
      }),
    }));

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[SFX] API error ${response.status}: ${errorText}`);
      return Buffer.alloc(0);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    setCached(cacheKey, buffer);
    return buffer;
  } catch (e) {
    console.warn(`[SFX] Failed: ${e instanceof Error ? e.message : String(e)}`);
    return Buffer.alloc(0);
  }
}

/** Estimate ElevenLabs API calls for a script */
export function estimateCost(
  script: ScriptSegment[],
  sfx: EpisodeSfxMode = "full",
): { segments: number; sfxCalls: number; totalCalls: number } {
  if (sfx === "none") return { segments: script.length, sfxCalls: 0, totalCalls: script.length };
  let sfxCalls = 2; // intro + outro
  if (sfx === "full") {
    for (let i = 1; i < script.length; i++) {
      if (script[i].topic !== script[i - 1].topic) sfxCalls++;
    }
  }
  return { segments: script.length, sfxCalls, totalCalls: script.length + sfxCalls };
}

/**
 * SFX dress for synthesizeEpisode. "full" is the legacy produced-podcast cut
 * (intro + per-topic whoosh + outro); "bookends" keeps intro + outro only;
 * "none" skips SFX entirely. SFX gens ($0.12 each) are the surprise cost
 * driver, so the $1 pay-per-call briefing defaults to "bookends" via
 * BRIEFING_SFX_MODE (UNIT_ECONOMICS.md).
 */
export type EpisodeSfxMode = "full" | "bookends" | "none";

/** Synthesize full episode: intro sfx + speech segments + transition sfx + outro sfx */
export async function synthesizeEpisode(
  script: ScriptSegment[],
  voiceOverride?: VoiceConfig,
  sfx: EpisodeSfxMode = "full",
  model?: string,
): Promise<Buffer[]> {
  const buffers: Buffer[] = [];

  if (sfx !== "none") {
    buffers.push(await synthesizeSfx("podcast intro jingle, upbeat tech vibes, short", 3));
  }

  for (let i = 0; i < script.length; i++) {
    const prev = i > 0 ? script[i - 1].text : undefined;
    const next = i < script.length - 1 ? script[i + 1].text : undefined;

    if (sfx === "full" && i > 0 && script[i].topic !== script[i - 1].topic) {
      buffers.push(await synthesizeSfx("short subtle whoosh transition sound", 1));
    }

    buffers.push(await synthesizeSpeech(script[i], prev, next, voiceOverride, model));
  }

  if (sfx !== "none") {
    buffers.push(await synthesizeSfx("podcast outro jingle, mellow fade out, short", 3));
  }

  return buffers;
}
