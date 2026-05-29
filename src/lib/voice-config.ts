/**
 * Voice configuration — runtime-overridable host voice IDs.
 * Defaults ship with DataBard; Pro users can override with their own
 * ElevenLabs voice IDs from the Pro settings dashboard.
 */
import { store } from "./store";

const VOICE_CONFIG_TTL = 86400 * 365; // 1 year

export interface VoiceConfig {
  alex: string;
  morgan: string;
}

export const DEFAULT_VOICES: VoiceConfig = {
  alex: "JBFqnCBsd6RMkjVDRZzb",   // George — Warm, Captivating Storyteller
  morgan: "EXAVITQu4vr4xnSDxMaL",  // Sarah — Mature, Reassuring, Confident
};

// Well-known ElevenLabs premade voices that users can pick from
export const VOICE_PRESETS: { id: string; name: string; description: string }[] = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", description: "Warm, captivating storyteller" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", description: "Mature, reassuring, confident" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", description: "Cultured, articulate, precise" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Deep, authoritative narrator" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", description: "Crisp, direct, energetic" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Calm, natural, conversational" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", description: "Friendly, young, approachable" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", description: "Deep, resonant, professional" },
];

export function getVoiceConfig(): VoiceConfig {
  const custom = store.get<VoiceConfig>("voice-config");
  return custom ?? { ...DEFAULT_VOICES };
}

export function updateVoiceConfig(config: Partial<VoiceConfig>): void {
  const current = getVoiceConfig();
  store.set("voice-config", { ...current, ...config }, VOICE_CONFIG_TTL);
}

export function resetVoiceConfig(): void {
  store.delete("voice-config");
}
