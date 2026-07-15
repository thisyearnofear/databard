/** Shared health presentation semantics for briefing surfaces. */
export type HealthTone = "green" | "orange" | "red";
export type HealthTrend = "up" | "down" | "stable";

export function healthTone(score: number): HealthTone {
  return score >= 80 ? "green" : score >= 50 ? "orange" : "red";
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
