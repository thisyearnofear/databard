/**
 * One definition of what a health score looks like. Every surface — score card,
 * league, dashboard, on-chain index, OG images, badge SVG — maps a 0-100 score
 * through these helpers so a given number always renders the same colour.
 */
export type ScoreTone = "good" | "warn" | "bad";

export function scoreTone(score: number): ScoreTone {
  if (score >= 80) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

const TONE_VAR: Record<ScoreTone, string> = {
  good: "--success",
  warn: "--warning",
  bad: "--danger",
};

/** Hex equivalents for server-rendered images, which cannot read CSS vars. */
const TONE_HEX: Record<ScoreTone, string> = {
  good: "#5bf58c",
  warn: "#f5c842",
  bad: "#f55b5b",
};

/** Literal class names — Tailwind only emits utilities it can see whole. */
const TONE_TEXT: Record<ScoreTone, string> = {
  good: "text-[var(--success)]",
  warn: "text-[var(--warning)]",
  bad: "text-[var(--danger)]",
};

const TONE_TINT: Record<ScoreTone, string> = {
  good: "bg-[var(--success)]/10 text-[var(--success)]",
  warn: "bg-[var(--warning)]/10 text-[var(--warning)]",
  bad: "bg-[var(--danger)]/10 text-[var(--danger)]",
};

export function scoreTextClass(score: number): string {
  return TONE_TEXT[scoreTone(score)];
}

/** Soft tinted pill: tone-coloured text on a 10% tone background. */
export function scoreTintClass(score: number): string {
  return TONE_TINT[scoreTone(score)];
}

export function scoreColor(score: number): string {
  return `var(${TONE_VAR[scoreTone(score)]})`;
}

export function scoreHex(score: number): string {
  return TONE_HEX[scoreTone(score)];
}
