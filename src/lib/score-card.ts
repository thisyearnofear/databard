import type { Episode, ScriptSegment } from "@/lib/types";

/** Shared briefings stay live long enough to forward in Slack. */
export const SHARE_TTL_SECONDS = 86400 * 21;

export interface ScoreCard {
  name: string;
  score: number;
  failed: number;
  total: number;
  quote: string;
  speaker: string;
  segmentIndex: number;
}

const HOOK = /failing|red flag|stale|no owner|pii|coverage|critical|broke|risk/i;

export function healthScore(episode: Pick<Episode, "qualitySummary">): number {
  const { passed, total } = episode.qualitySummary;
  if (total <= 0) return 0;
  return Math.round((passed / total) * 100);
}

function pickSegment(script: ScriptSegment[], segmentIndex?: number | null): { seg: ScriptSegment; index: number } {
  if (segmentIndex != null && script[segmentIndex]) {
    return { seg: script[segmentIndex], index: segmentIndex };
  }
  const hooked = script.findIndex((s) => HOOK.test(s.text));
  if (hooked >= 0) return { seg: script[hooked], index: hooked };
  const morgan = script.findIndex((s) => s.speaker.toLowerCase() === "morgan");
  if (morgan >= 0) return { seg: script[morgan], index: morgan };
  return { seg: script[0] ?? { speaker: "Morgan", text: "The data needs a closer look.", topic: "" }, index: 0 };
}

export function scoreClass(score: number): string {
  if (score >= 80) return "text-[var(--success)]";
  if (score >= 50) return "text-[var(--warning)]";
  return "text-[var(--danger)]";
}

export function shareText(card: ScoreCard, url: string): string {
  return `${card.name} is ${card.score}.\n\n"${card.quote}"\n— ${card.speaker}\n\n${url}`;
}

export function scoreFromEpisode(episode: Episode, segmentIndex?: number | null): ScoreCard {
  const { seg, index } = pickSegment(episode.script ?? [], segmentIndex);
  const quote = seg.text.trim();
  return {
    name: episode.schemaName,
    score: healthScore(episode),
    failed: episode.qualitySummary.failed,
    total: episode.qualitySummary.total,
    quote: quote.length > 220 ? `${quote.slice(0, 217).trimEnd()}…` : quote,
    speaker: seg.speaker || "Morgan",
    segmentIndex: index,
  };
}
