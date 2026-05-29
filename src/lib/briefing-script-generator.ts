/**
 * Coral Morning Briefing — specialized script generator for dev activity.
 * Turns GitHub activity data from Coral into a conversational two-host podcast.
 *
 * Alex: enthusiastic dev advocate. Morgan: skeptical code reviewer.
 */
import type { ScriptSegment } from "@/lib/types";

const BRIEFING_SYSTEM_PROMPT = `You are a script writer for a developer morning briefing podcast. Write a conversational two-host podcast script analyzing GitHub activity from the past 24 hours.

HOSTS:
- Alex: Enthusiastic dev. Gets excited about clean merges, well-written PRs, and productive activity. Uses dev slang naturally.
- Morgan: Skeptical code reviewer. Focuses on stalled PRs, unreviewed code, security concerns, and things that could go wrong. Dry humor, direct.

RULES:
- Output ONLY a JSON array: [{"speaker":"Alex"|"Morgan","topic":"string","text":"string"}]
- Open with a brief morning greeting and overview of what happened overnight
- Lead with the most important findings — merges that are live, PRs that are blocked
- If a PR has been open > 2 days without review, Morgan MUST call it out
- If there are new issues with "bug" or "security" labels, prioritize those
- If recent merges touch similar code, Alex should connect the dots
- Keep segments to 1-3 sentences — these get synthesized to speech
- Make it conversational. Interruptions, reactions, disagreements are good
- Total script: 10-20 segments
- No markdown, no code blocks — just the JSON array
- Reference specific PR titles, issue names, and authors by name`;

interface BriefingData {
  repo: string;
  data: BriefingSection[];
}

interface BriefingSection {
  category: string;
  label: string;
  items: Record<string, unknown>[];
}

function buildBriefingPrompt(data: BriefingData): string {
  const summary = data.data.map((section) => ({
    category: section.category,
    count: section.items.length,
    items: section.items,
  }));

  return JSON.stringify({
    repo: data.repo,
    summary,
  });
}

export async function generateBriefingScript(
  data: BriefingData,
): Promise<ScriptSegment[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return generateBriefingTemplate(data);
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: BRIEFING_SYSTEM_PROMPT },
          { role: "user", content: buildBriefingPrompt(data) },
        ],
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) throw new Error(`LLM API error: ${res.status}`);

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty LLM response");

    const parsed = JSON.parse(content);
    const segments: ScriptSegment[] = Array.isArray(parsed)
      ? parsed
      : parsed.segments ?? parsed.script;

    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error("LLM returned invalid script format");
    }

    return segments.map((s) => ({
      speaker: s.speaker === "Morgan" ? "Morgan" : "Alex",
      topic: s.topic || "briefing",
      text: String(s.text),
    }));
  } catch {
    return generateBriefingTemplate(data);
  }
}

function generateBriefingTemplate(data: BriefingData): ScriptSegment[] {
  const segments: ScriptSegment[] = [];

  segments.push({
    speaker: "Alex",
    topic: "intro",
    text: `Good morning! Let's see what happened overnight on ${data.repo}. Pulling up the activity now.`,
  });

  for (const section of data.data) {
    if (section.items.length === 0) {
      segments.push({
        speaker: "Morgan",
        topic: section.category,
        text: `No ${section.label.toLowerCase()} in the last 24 hours. Either everything's stable or nobody's working.`,
      });
      continue;
    }

    const names = section.items
      .slice(0, 3)
      .map((item) => item.title || item.name || item.subject)
      .filter(Boolean)
      .join(", ");

    if (section.category === "merged") {
      segments.push({
        speaker: "Alex",
        topic: "merges",
        text: `${section.items.length} ${section.items.length === 1 ? "PR just landed" : "PRs merged"}: ${names}. Let's see what shipped.`,
      });
    } else if (section.category === "open_prs") {
      segments.push({
        speaker: "Morgan",
        topic: "reviews",
        text: `${section.items.length} ${section.items.length === 1 ? "PR is" : "PRs are"} waiting for review: ${names}. Don't let these sit.`,
      });
    } else if (section.category === "new_issues") {
      segments.push({
        speaker: "Alex",
        topic: "issues",
        text: `${section.items.length} new ${section.items.length === 1 ? "issue" : "issues"} opened: ${names}. Let's check what needs attention.`,
      });
    } else if (section.category === "recent_commits") {
      segments.push({
        speaker: "Alex",
        topic: "commits",
        text: `Recent commits include: ${names}. Active development overnight.`,
      });
    }
  }

  segments.push({
    speaker: "Morgan",
    topic: "outro",
    text: "That's your morning briefing. Check the PRs that need review and the new issues. Don't let the backlog grow.",
  });

  segments.push({
    speaker: "Alex",
    topic: "outro",
    text: "Until tomorrow — happy coding!",
  });

  return segments;
}
