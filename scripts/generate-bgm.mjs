import "dotenv/config";
import { writeFileSync } from "fs";
import path from "path";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const OUT = path.join(process.cwd(), "demo-assets", "bgm.mp3");

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY not set");
    process.exit(1);
  }

  const client = new ElevenLabsClient({ apiKey });

  console.log("Generating background music...");
  const audio = await client.music.generate({
    prompt: "Subtle ambient electronic background music, professional, confident, minimal, corporate tech, low energy, 80 seconds, no drums, soft pads, dark mood",
    durationSeconds: 80,
  });

  const chunks = [];
  for await (const chunk of audio) {
    chunks.push(Buffer.from(chunk));
  }
  writeFileSync(OUT, Buffer.concat(chunks));
  console.log(`✓ Background music saved to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
