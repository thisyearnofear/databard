/**
 * Voice configuration + seller personas.
 *
 * DataBard hosts two voices per episode (Alex + Morgan). A **persona** is a competing seller
 * that packages a voice pair with a distinct style, price floor, and bidding strategy. The
 * market picks a persona per WANT; every episode is delivered by exactly one persona.
 *
 * Backwards-compat: `getVoiceConfig()` still returns the currently-active persona's voices,
 * defaulting to Cascade (which matches DataBard's pre-market Alex/Morgan sound).
 */
import { store } from "./store";
import type { Want, WantType } from "./types";

const VOICE_CONFIG_TTL = 86400 * 365; // 1 year

export interface VoiceConfig {
  alex: string;
  morgan: string;
}

/** Pricing input passed to a persona's strategy so bids reflect the WANT's shape. */
export interface PricingContext {
  want: Want;
  /** Rough measure of catalog complexity — tables × failing-tests weight. */
  contextSize: number;
  /** 0..1; higher = tighter deadline / more critical delta. */
  urgency: number;
}

export type PricingStrategy = (ctx: PricingContext) => {
  priceLamports: number;
  reasoning: string;
};

export type PersonaKind = "content" | "reseller";

export interface PersonaSeller {
  id: string;
  name: string;
  /** One-line style descriptor shown in the auction dashboard. */
  style: string;
  voices: VoiceConfig;
  /** Minimum acceptable price, in lamports. Bids below this are never generated. */
  costFloorLamports: number;
  pricingStrategy: PricingStrategy;
  /** Optional wallet address (set by market/sellers.ts once keypairs are provisioned). */
  publicKey?: string;
  /**
   * "content" personas generate audio directly.
   * "reseller" personas buy from content personas and repackage — the graph beat.
   */
  kind: PersonaKind;
  /** Which WANT types this persona bids on (default: content bids on "brief" only). */
  bidsOn: WantType[];
}

const LAMPORTS_PER_SOL = 1_000_000_000;
const sol = (n: number) => Math.round(n * LAMPORTS_PER_SOL);

/** ElevenLabs voice presets users can pick from (unchanged from pre-market). */
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

/* ----------------------------- Persona registry ----------------------------- */

/**
 * Signal — the premium executive-brief seller.
 * Short (60s), headline-only. Bids higher on small schemas and high-priority WANTs — its value is
 * getting the CEO out of the meeting fast.
 */
const SIGNAL: PersonaSeller = {
  id: "signal",
  name: "Signal",
  style: "Executive brief — 60s, headline-level, no drilling",
  kind: "content",
  bidsOn: ["brief"],
  voices: {
    alex: "TxGEqnHWrfWFTfGW9XjX",  // Josh — authoritative narrator
    morgan: "EXAVITQu4vr4xnSDxMaL", // Sarah — reassuring, confident
  },
  costFloorLamports: sol(0.05),
  pricingStrategy: ({ want, contextSize, urgency }) => {
    // Premium: higher for urgent WANTs, discount for large schemas (won't drill anyway).
    const urgencyMultiplier = 1 + urgency * 0.6;
    const sizeDiscount = Math.max(0.8, 1 - contextSize / 200);
    const price = Math.round(sol(0.05) * urgencyMultiplier * sizeDiscount);
    return {
      priceLamports: Math.max(price, sol(0.05)),
      reasoning:
        urgency > 0.5
          ? `Urgent brief for ${want.schemaFqn} — I lead with the single headline that matters.`
          : `Executive summary of ${want.schemaFqn} in 60 seconds — decision-ready.`,
    };
  },
};

/**
 * Cascade — the mid-tier deep-dive seller. This is DataBard's classic voice.
 * 3–5 min, drills into failing tests and lineage risk. Bids higher when the WANT surfaces failures.
 */
const CASCADE: PersonaSeller = {
  id: "cascade",
  name: "Cascade",
  style: "Deep-dive — 3–5 min, drills into failures and lineage",
  kind: "content",
  bidsOn: ["brief"],
  voices: {
    alex: "JBFqnCBsd6RMkjVDRZzb",   // George — warm storyteller (DataBard default)
    morgan: "XB0fDUnXU5powFXDhCwa", // Charlotte — cultured, precise auditor
  },
  costFloorLamports: sol(0.02),
  pricingStrategy: ({ want, contextSize, urgency }) => {
    // Mid-tier: price scales with what there is to dig into.
    const failuresHinted = (want.evidenceHints ?? []).length;
    const depthBonus = 1 + failuresHinted * 0.08 + Math.min(0.5, contextSize / 100);
    const price = Math.round(sol(0.03) * depthBonus + urgency * sol(0.01));
    return {
      priceLamports: Math.max(price, sol(0.02)),
      reasoning:
        failuresHinted > 0
          ? `${failuresHinted} tables have hinted failures — I'll trace the lineage and name the owners.`
          : `Full drill-down on ${want.schemaFqn} — columns, tests, lineage, the works.`,
    };
  },
};

/**
 * Newsroom — the discount breaking-changes flash seller.
 * 45s, only what changed since last brief. Wins on tight budgets and delta-triggered WANTs.
 */
const NEWSROOM: PersonaSeller = {
  id: "newsroom",
  name: "Newsroom",
  style: "Flash — 45s, only what changed since last brief",
  kind: "content",
  bidsOn: ["brief"],
  voices: {
    alex: "pNInz6obpgDQGcFmaJgB", // Adam — natural, conversational
    morgan: "yoZ06aMxZJJ28mfd3POQ", // Sam — young, approachable
  },
  costFloorLamports: sol(0.01),
  pricingStrategy: ({ want, contextSize, urgency }) => {
    // Discount: fixed near cost floor; urgency and delta size barely move it.
    const price = Math.round(sol(0.012) + urgency * sol(0.003));
    return {
      priceLamports: Math.max(price, sol(0.01)),
      reasoning:
        (want.evidenceHints ?? []).length > 0
          ? `Delta-driven — I only cover the ${(want.evidenceHints ?? []).length} tables that changed.`
          : `Fast, cheap, current. If nothing changed, I say so and end early.`,
    };
  },
};

/**
 * Digest — a RESELLER persona. Doesn't generate audio itself. When it wins a digest WANT,
 * it posts sub-WANTs to content personas (typically Newsroom) for individual schema briefs,
 * awards them, deposits into sub-escrows, concatenates the delivered audio, and settles
 * the parent escrow. Two visible cash flows on-chain — the graph story.
 *
 * Pricing: charges more than the sum of sub-WANT floors so it captures a margin.
 */
const DIGEST: PersonaSeller = {
  id: "digest",
  name: "Digest",
  style: "Weekly aggregator — packages briefs from multiple sources into one release",
  kind: "reseller",
  bidsOn: ["digest"],
  voices: {
    // Digest doesn't synthesize its own voice — inherits from Newsroom for the demo audio join.
    alex: "pNInz6obpgDQGcFmaJgB",
    morgan: "yoZ06aMxZJJ28mfd3POQ",
  },
  costFloorLamports: sol(0.03),
  pricingStrategy: ({ want }) => {
    const schemaCount = want.digestSchemas?.length ?? 1;
    // Charge estimated sub-cost × N + margin.
    const estimatedSubCost = sol(0.012);
    const price = Math.round(estimatedSubCost * schemaCount * 1.25);
    return {
      priceLamports: Math.max(price, sol(0.03)),
      reasoning: `I'll aggregate ${schemaCount} Newsroom flashes into one release — you get the full weekly picture, one payment.`,
    };
  },
};

export const PERSONAS: readonly PersonaSeller[] = [SIGNAL, CASCADE, NEWSROOM, DIGEST];

const DEFAULT_PERSONA_ID = "cascade";

export function getPersona(id: string): PersonaSeller | undefined {
  return PERSONAS.find((p) => p.id === id);
}

export function getDefaultPersona(): PersonaSeller {
  return getPersona(DEFAULT_PERSONA_ID) ?? CASCADE;
}

/* ------------------ Backwards-compat voice config surface ------------------ */

/** Voices for a specific persona (used by the pipeline once a bid is awarded). */
export function getVoiceConfigForPersona(personaId: string): VoiceConfig {
  const persona = getPersona(personaId) ?? getDefaultPersona();
  return { ...persona.voices };
}

/**
 * Legacy: returns the currently-active persona's voices, honoring any user override.
 * Preserved for callers that pre-date the market (script generator's default path, Pro settings UI).
 */
export const DEFAULT_VOICES: VoiceConfig = getDefaultPersona().voices;

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
