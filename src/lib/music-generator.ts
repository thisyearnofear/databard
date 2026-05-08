import type { Episode, MusicPlan, MusicSection } from "./types";

/**
 * Music Generator — transforms data health signals into musical compositions.
 * Maps health scores to moods/genres and creates a structured lyric plan.
 */

export function generateMusicPlan(episode: Episode, persona: "web3" | "enterprise" = "web3"): MusicPlan {
  const health = episode.qualitySummary.total > 0 
    ? (episode.qualitySummary.passed / episode.qualitySummary.total) * 100 
    : 100;
  
  const isHealthy = health >= 90;
  const isCritical = health < 50;

  // 1. Determine Genre & Mood based on persona and health
  let genre = "";
  let mood = "";
  let positiveGlobalStyles: string[] = [];
  let negativeGlobalStyles: string[] = ["distorted", "noisy"];

  if (persona === "web3") {
    if (isHealthy) {
      genre = "Upbeat Afrobeat";
      mood = "Triumphant and celebratory";
      positiveGlobalStyles = ["afrobeat", "shakers", "clean electric guitar", "high energy"];
    } else if (isCritical) {
      genre = "Dark Cyberpunk Synthwave";
      mood = "Urgent and glitchy";
      positiveGlobalStyles = ["dark synth", "heavy bass", "industrial", "glitch", "fast tempo"];
    } else {
      genre = "Chill Lo-fi Hip Hop";
      mood = "Relaxed but focused";
      positiveGlobalStyles = ["lo-fi", "jazz hop", "mellow", "smooth rhodes"];
    }
  } else {
    // Enterprise persona
    if (isHealthy) {
      genre = "Inspirational Corporate Pop";
      mood = "Professional and forward-looking";
      positiveGlobalStyles = ["modern pop", "acoustic guitar", "bright piano", "uplifting"];
    } else if (isCritical) {
      genre = "Melancholic Blues Rock";
      mood = "Serious and weary";
      positiveGlobalStyles = ["blues rock", "distorted guitar", "slow drums", "gritty"];
    } else {
      genre = "Smooth Corporate Jazz";
      mood = "Sophisticated and balanced";
      positiveGlobalStyles = ["jazz fusion", "soft saxophone", "upright bass", "light percussion"];
    }
  }

  // 2. Generate Lyrics (Sections)
  const sections: MusicSection[] = [];

  // Intro
  sections.push({
    sectionName: "Intro",
    durationMs: 8000,
    lines: [`[Intro] (${mood} instrumental buildup)`],
    positiveStyles: ["buildup", "atmospheric"]
  });

  // Verse 1: The Context
  sections.push({
    sectionName: "Verse 1",
    durationMs: 15000,
    lines: [
      `[Verse 1] Scanning ${episode.schemaName}, checking every row`,
      `${episode.tableCount} tables in the catalog, ready for the show`,
      `Alex sees the brightness, lineage flowing clear`,
      `But Morgan's in the shadows, waiting for the fear`
    ]
  });

  // Chorus: The Health Score (The Hook)
  const healthColor = isHealthy ? "shining bright" : isCritical ? "falling down" : "steady now";
  sections.push({
    sectionName: "Chorus",
    durationMs: 15000,
    lines: [
      `[Chorus] ${episode.schemaName}, ${Math.round(health)} percent ${health >= 70 ? "strong" : "wrong"}`,
      `Data health is ${healthColor}, listen to our song`,
      `${episode.qualitySummary.passed} tests are passing, ${episode.qualitySummary.failed} are left in doubt`,
      `DataBard is here to tell you what it's all about`
    ],
    positiveStyles: ["anthemic", "catchy", "vocal harmony"]
  });

  // Verse 2: The Issues
  const issues = episode.researchTrail?.recommendedActions?.slice(0, 2) || [];
  const issueLines = issues.length > 0 
    ? issues.map(i => `Flagging ${i.table || "the schema"} for ${i.category.toLowerCase()}`)
    : ["No major flags today, everything is fine", "Consistency is key for our data line"];

  sections.push({
    sectionName: "Verse 2",
    durationMs: 15000,
    lines: [
      `[Verse 2] Morgan spots the trouble, ${isCritical ? "danger in the stack" : "cracks within the wall"}`,
      ...issueLines,
      `Trace the lineage backward, watch the metrics fall`,
      `But knowledge is the power, to fix what we have found`
    ]
  });

  // Outro
  sections.push({
    sectionName: "Outro",
    durationMs: 10000,
    lines: [
      `[Outro] Clean up the tables, fix the tests today`,
      `DataBard is signing off, the Bards are here to stay`,
      `(${genre} fade out)`
    ],
    positiveStyles: ["fade out"]
  });

  return {
    positiveGlobalStyles,
    negativeGlobalStyles,
    sections,
    genre,
    mood
  };
}
