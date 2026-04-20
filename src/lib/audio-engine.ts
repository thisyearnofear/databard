/**
 * Audio engine — all ElevenLabs interactions in one place.
 * TTS (two voices), sound effects, and stream-to-buffer helpers.
 * Uses file-backed cache for audio persistence across restarts.
 */
import { ElevenLabsClient } from "elevenlabs";
import type { Readable } from "stream";
import type { ScriptSegment } from "./types";
import { cache } from "./cache";

// Two fixed podcast host voices
const VOICES = {
  Alex: "JBFqnCBsd6RMkjVDRZzb",   // George
  Morgan: "XB0fDUnXU5powFXDhCwa",  // Charlotte
} as const;

const MODEL = "eleven_multilingual_v2";
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

function getCached(key: string): Buffer | null {
  const b64 = cache.get<string>(key);
  return b64 ? Buffer.from(b64, "base64") : null;
}

function setCached(key: string, buffer: Buffer): void {
  cache.set(key, buffer.toString("base64"), AUDIO_CACHE_TTL);
}

/** Synthesize a single script segment to mp3 buffer */
export async function synthesizeSpeech(
  segment: ScriptSegment,
  prevText?: string,
  nextText?: string,
): Promise<Buffer> {
  const cacheKey = `audio:speech:${segment.speaker}:${segment.text.slice(0, 80)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const stream = await getClient().textToSpeech.convert(
    VOICES[segment.speaker],
    {
      text: segment.text,
      model_id: MODEL,
      output_format: "mp3_44100_128",
      ...(prevText && { previous_text: prevText }),
      ...(nextText && { next_text: nextText }),
    },
  );
  const buffer = await streamToBuffer(stream);
  setCached(cacheKey, buffer);
  return buffer;
}

/** Generate a short sound effect */
export async function synthesizeSfx(prompt: string, durationSeconds = 2): Promise<Buffer> {
  const cacheKey = `audio:sfx:${prompt}:${durationSeconds}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const stream = await getClient().textToSoundEffects.convert({
    text: prompt,
    duration_seconds: durationSeconds,
  });
  const buffer = await streamToBuffer(stream);
  setCached(cacheKey, buffer);
  return buffer;
}

/** Estimate ElevenLabs API calls for a script */
export function estimateCost(script: ScriptSegment[]): { segments: number; sfxCalls: number; totalCalls: number } {
  let sfxCalls = 2; // intro + outro
  for (let i = 1; i < script.length; i++) {
    if (script[i].topic !== script[i - 1].topic) sfxCalls++;
  }
  return { segments: script.length, sfxCalls, totalCalls: script.length + sfxCalls };
}

/** Synthesize full episode: intro sfx + speech segments + transition sfx + outro sfx */
export async function synthesizeEpisode(script: ScriptSegment[]): Promise<Buffer[]> {
  const buffers: Buffer[] = [];

  buffers.push(await synthesizeSfx("podcast intro jingle, upbeat tech vibes, short", 3));

  for (let i = 0; i < script.length; i++) {
    const prev = i > 0 ? script[i - 1].text : undefined;
    const next = i < script.length - 1 ? script[i + 1].text : undefined;

    if (i > 0 && script[i].topic !== script[i - 1].topic) {
      buffers.push(await synthesizeSfx("short subtle whoosh transition sound", 1));
    }

    buffers.push(await synthesizeSpeech(script[i], prev, next));
  }

  buffers.push(await synthesizeSfx("podcast outro jingle, mellow fade out, short", 3));

  return buffers;
}
