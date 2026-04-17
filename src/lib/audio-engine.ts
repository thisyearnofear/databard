/**
 * Audio engine — all ElevenLabs interactions in one place.
 * TTS (two voices), sound effects, and stream-to-buffer helpers.
 */
import { ElevenLabsClient } from "elevenlabs";
import type { Readable } from "stream";
import type { ScriptSegment } from "./types";

// Two fixed podcast host voices
const VOICES = {
  Alex: "JBFqnCBsd6RMkjVDRZzb",   // George
  Morgan: "XB0fDUnXU5powFXDhCwa",  // Charlotte
} as const;

const MODEL = "eleven_multilingual_v2";

let client: ElevenLabsClient | null = null;

function getClient(): ElevenLabsClient {
  if (!client) {
    client = new ElevenLabsClient(); // reads ELEVENLABS_API_KEY from env
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

/** Synthesize a single script segment to mp3 buffer */
export async function synthesizeSpeech(
  segment: ScriptSegment,
  prevText?: string,
  nextText?: string,
): Promise<Buffer> {
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
  return streamToBuffer(stream);
}

/** Generate a short sound effect */
export async function synthesizeSfx(prompt: string, durationSeconds = 2): Promise<Buffer> {
  const stream = await getClient().textToSoundEffects.convert({
    text: prompt,
    duration_seconds: durationSeconds,
  });
  return streamToBuffer(stream);
}

/** Synthesize full episode: intro sfx + speech segments + transition sfx + outro sfx */
export async function synthesizeEpisode(script: ScriptSegment[]): Promise<Buffer[]> {
  const buffers: Buffer[] = [];

  // Intro jingle
  buffers.push(await synthesizeSfx("podcast intro jingle, upbeat tech vibes, short", 3));

  // Speech segments with context stitching
  for (let i = 0; i < script.length; i++) {
    const prev = i > 0 ? script[i - 1].text : undefined;
    const next = i < script.length - 1 ? script[i + 1].text : undefined;

    // Add transition sound between topic changes
    if (i > 0 && script[i].topic !== script[i - 1].topic) {
      buffers.push(await synthesizeSfx("short subtle whoosh transition sound", 1));
    }

    buffers.push(await synthesizeSpeech(script[i], prev, next));
  }

  // Outro
  buffers.push(await synthesizeSfx("podcast outro jingle, mellow fade out, short", 3));

  return buffers;
}
