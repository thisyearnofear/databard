/**
 * POST /api/briefing
 * Coral Morning Briefing endpoint.
 *
 * Body: { repo: "owner/repo", githubToken?: string }
 *
 * Flow:
 * 1. Runs Coral SQL queries against GitHub (PRs, issues, commits)
 * 2. Generates a two-host podcast script from the activity
 * 3. Synthesizes audio via ElevenLabs
 * 4. Returns audio + segments for interactive playback
 */
import { NextRequest, NextResponse } from "next/server";
import { generateBriefingScript } from "@/lib/briefing-script-generator";
import { synthesizeEpisode } from "@/lib/audio-engine";
import type { ScriptSegment } from "@/lib/types";

interface BriefingSection {
  category: string;
  label: string;
  items: Record<string, unknown>[];
}

interface CoralResult {
  [key: string]: unknown;
}

async function runCoralQuery(query: string): Promise<CoralResult[]> {
  const gatewayUrl = process.env.CORAL_GATEWAY_URL;

  if (gatewayUrl) {
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Coral-Auth": process.env.CORAL_GATEWAY_TOKEN || "",
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`Coral Gateway error: ${res.statusText}`);
    const data = await res.json();
    return data.results ?? data;
  }

  // Local Coral CLI
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  const { stdout } = await execAsync(`coral sql --format json "${query.replace(/"/g, '\\"')}"`, {
    timeout: 30000,
  });
  return JSON.parse(stdout);
}

const QUERIES: Record<string, { query: string; category: string; label: string }> = {
  open_prs: {
    query: `SELECT title, author, created_at, updated_at, url, additions, deletions, changed_files, labels FROM github.pull_requests WHERE state = 'open' AND draft = false ORDER BY updated_at DESC LIMIT 10`,
    category: "open_prs",
    label: "Open PRs Awaiting Review",
  },
  merged: {
    query: `SELECT title, author, merged_at, url, additions, deletions, changed_files FROM github.pull_requests WHERE merged_at >= date('now', '-1 day') ORDER BY merged_at DESC LIMIT 10`,
    category: "merged",
    label: "Recently Merged",
  },
  new_issues: {
    query: `SELECT title, author, created_at, url, labels, assignee FROM github.issues WHERE state = 'open' AND created_at >= date('now', '-3 days') ORDER BY created_at DESC LIMIT 10`,
    category: "new_issues",
    label: "New Issues",
  },
  recent_commits: {
    query: `SELECT subject, author, committed_at, hash FROM github.commits WHERE committed_at >= date('now', '-1 day') ORDER BY committed_at DESC LIMIT 10`,
    category: "recent_commits",
    label: "Recent Commits",
  },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const repo = (body.repo as string)?.trim();
    const githubToken = (body.githubToken as string)?.trim();

    if (!repo) {
      return NextResponse.json(
        { ok: false, error: "Repository name required (e.g., owner/repo)" },
        { status: 400 }
      );
    }

    // Validate repo format
    if (!repo.includes("/") || repo.split("/").length !== 2) {
      return NextResponse.json(
        { ok: false, error: "Invalid repo format. Use owner/repo" },
        { status: 400 }
      );
    }

    // Set GitHub token for Coral if provided
    if (githubToken) {
      process.env.CORAL_GITHUB_TOKEN = githubToken;
    }

    // Run all Coral queries in parallel
    const sections: BriefingSection[] = [];
    const queryEntries = Object.entries(QUERIES);

    console.log(`[Briefing] Running ${queryEntries.length} Coral queries for ${repo}...`);

    const results = await Promise.allSettled(
      queryEntries.map(async ([key, { query, category, label }]) => {
        try {
          const items = await runCoralQuery(query);
          return { category, label, items };
        } catch (e) {
          console.warn(`[Briefing] Query ${key} failed:`, e);
          return { category, label, items: [] };
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        sections.push(result.value);
      }
    }

    // Check if we got any data at all
    const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
    if (totalItems === 0) {
      return NextResponse.json(
        { ok: false, error: "No data returned from Coral. Make sure Coral is installed and the GitHub source is configured with a valid token." },
        { status: 500 }
      );
    }

    console.log(`[Briefing] Got ${totalItems} items across ${sections.length} categories`);

    // Generate script from briefing data
    const script = await generateBriefingScript({ repo, data: sections });

    // Synthesize audio
    let audioBase64: string | null = null;
    let audioError: string | null = null;

    try {
      const buffers = await synthesizeEpisode(script);
      audioBase64 = Buffer.concat(buffers).toString("base64");
    } catch (e) {
      audioError = e instanceof Error ? e.message : "Audio synthesis failed";
      console.warn("[Briefing] Audio synthesis failed:", audioError);
    }

    // Build interactive segments for the player
    const segments = script.map((s: ScriptSegment, i: number) => ({
      id: `seg-${i}`,
      speaker: s.speaker,
      topic: s.topic,
      text: s.text,
      // Link segments to actual data items
      dataItems: sections
        .find((sec) => sec.category === s.topic)
        ?.items.slice(0, 3)
        .filter((item) =>
          s.text.toLowerCase().includes((item.title as string || item.subject as string || "").toLowerCase())
        ) || [],
    }));

    return NextResponse.json({
      ok: true,
      repo,
      script,
      segments,
      sections: sections.map((s) => ({
        category: s.category,
        label: s.label,
        count: s.items.length,
        items: s.items.slice(0, 10),
      })),
      audio: audioBase64,
      audioError,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[Briefing] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
