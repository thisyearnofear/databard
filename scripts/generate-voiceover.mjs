import { readFileSync } from "fs";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import path from "path";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// Load .env manually
const envFile = readFileSync(path.join(process.cwd(), ".env"), "utf8");
envFile.split("\n").forEach((line) => {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
});

const OUT = path.join(process.cwd(), "demo-assets", "voiceover");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// Updated narration — honest framing, Solana is optional not foundational
const segments = [
  {
    file: "01-landing.mp3",
    text: "DataBard turns data health into something people actually consume — a two-minute audio briefing. Sixty-one percent of dashboards are never opened. Only two point three percent drive decisions. We built a report that travels.",
  },
  {
    file: "02-dashboard.mp3",
    text: "Here's this week's briefing. Six protocols tracked, health scores computed from real schema metadata. Uniswap Analytics dropped eleven points — new test failures in the whale-trades pipeline, cascading to eight downstream tables.",
  },
  {
    file: "03-what-changed.mp3",
    text: "The trend narrative tells you what changed and what to fix first. Tools say 'anomaly in table X' — nobody acts on that. People act on 'dropped eleven points, two new failures after Friday's deploy, here's the owner.' Narratives get acted on. Dashboards get skimmed.",
  },
  {
    file: "04-listen.mp3",
    text: "Two AI hosts walk you through the findings in two minutes. The synthesis is the moat — you can't read forty-seven rows of test results aloud. You have to distill.",
  },
  {
    file: "05-attestation.mp3",
    text: "For teams that need public trust, every report can be attested on Solana. The SHA-256 is written via Memo program — costs about five ten-thousandths of a cent. Anyone can verify the hash against the report with one RPC call. It's optional — most teams keep reports internal. But for protocols making public health claims, verifiable is worth more than claimed.",
  },
  {
    file: "06-leaderboard.mp3",
    text: "This is the public registry. Protocols that want to be on it — their verified health is marketing. Their marketing is our distribution.",
  },
];

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY not set");
    process.exit(1);
  }

  const client = new ElevenLabsClient({ apiKey });

  // Adam — deep, professional male voice
  const voiceId = "pNInz6obpgDQGcFmaJgB";
  const modelId = "eleven_multilingual_v2";

  for (const segment of segments) {
    const outPath = path.join(OUT, segment.file);
    console.log(`Generating: ${segment.file} — "${segment.text.slice(0, 50)}..."`);

    const audio = await client.textToSpeech.convert(voiceId, {
      text: segment.text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    });

    const chunks = [];
    for await (const chunk of audio) {
      chunks.push(Buffer.from(chunk));
    }
    writeFileSync(outPath, Buffer.concat(chunks));
    console.log(`  ✓ Saved to ${outPath}`);
  }

  console.log("\nAll voiceover segments regenerated!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
