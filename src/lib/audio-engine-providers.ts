/**
 * Browser-based TTS fallback for ElevenLabs free tier (402 errors).
 * Uses the agent abstraction for provider detection.
 * Only used when the ElevenLabs API returns 402 — not the primary path.
 */
import type { ScriptSegment } from "./types";
import { getBestAgent, getAvailableAgents, executeGoal, type AgentProvider } from "./agent";

const VOICES = {
  Alex: "Antoni",
  Morgan: "Rachel",
} as const;

const ELEVENLABS_WEB_URL = "https://elevenlabs.io/app/speech-synthesis";

export type BrowserProvider = AgentProvider | "auto";

/** Synthesize a single segment via browser automation */
async function synthesizeSegmentViaWeb(segment: ScriptSegment): Promise<Buffer> {
  const voice = VOICES[segment.speaker];
  const goal = `Navigate to ElevenLabs speech synthesis page at ${ELEVENLABS_WEB_URL}. Select the voice "${voice}" from the voice dropdown. Enter the following text into the text area: "${segment.text.replace(/"/g, '\\"')}". Click the Generate button and wait for audio generation to complete. Extract the audio element's src attribute and return it.`;

  const result = await executeGoal(goal, ELEVENLABS_WEB_URL);

  if (!result.success) {
    throw new Error(`Web TTS failed: ${result.content}`);
  }

  // Extract audio URL from result
  const urlMatch = result.content.match(/https?:\/\/[^\s"']+\.(mp3|wav|ogg|webm)/);
  if (!urlMatch) {
    throw new Error("Failed to extract audio URL from browser automation result");
  }

  const audioRes = await fetch(urlMatch[0]);
  if (!audioRes.ok) throw new Error(`Failed to fetch audio: ${audioRes.statusText}`);
  return Buffer.from(await audioRes.arrayBuffer());
}

/** Synthesize full episode via browser automation (fallback for 402 errors) */
export async function synthesizeEpisodeViaWeb(script: ScriptSegment[]): Promise<Buffer[]> {
  const provider = await getBestAgent();
  if (provider === "none") {
    throw new Error("No browser automation provider available for TTS fallback");
  }

  console.log(`[Web TTS] Using provider: ${provider}`);
  const buffers: Buffer[] = [];

  for (let i = 0; i < script.length; i++) {
    console.log(`[Web TTS] Segment ${i + 1}/${script.length}: ${script[i].speaker}`);
    buffers.push(await synthesizeSegmentViaWeb(script[i]));
  }

  return buffers;
}

/** Check which providers are available (delegates to agent.ts) */
export async function checkProviders(): Promise<Record<string, boolean>> {
  const agents = await getAvailableAgents();
  return {
    "agent-browser": agents["agent-browser"],
    "browser-use": agents["browser-use"],
    tinyfish: agents.tinyfish,
  };
}
