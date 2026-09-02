import { scoreTone, type ScoreTone } from "@/lib/product/score-tone";

/** Shared health presentation semantics for briefing surfaces. */
export type HealthTone = "green" | "orange" | "red";
export type HealthTrend = "up" | "down" | "stable";

const TONE_NAME: Record<ScoreTone, HealthTone> = { good: "green", warn: "orange", bad: "red" };

export function healthTone(score: number): HealthTone {
  return TONE_NAME[scoreTone(score)];
}

export function healthTrend(history: number[]): HealthTrend {
  if (history.length < 2) return "stable";
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  return latest > previous ? "up" : latest < previous ? "down" : "stable";
}

export function briefingSourceName(schemaName: string): string {
  return schemaName.split(".")[0] || schemaName;
}
