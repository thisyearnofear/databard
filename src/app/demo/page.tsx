import { promises as fs } from "fs";
import path from "path";
import DemoPlayer from "./DemoPlayer";
import type { Episode } from "@/lib/types";

export const metadata = {
  title: "Demo — DataBard",
  description: "Listen to a sample DataBard podcast episode. Two AI hosts analyze an e-commerce dataset — table health, failing tests, PII, and lineage.",
};

const DEMO_FILES = {
  enterprise: { json: "sample-episode.json", mp3: "/demo-episode.mp3" },
  web3: { json: "sample-episode-dune.json", mp3: "/demo-episode-dune.mp3" },
} as const;

export default async function DemoPage() {
  // Default to enterprise demo — SSR with zero client fetch for metadata
  const demoPath = path.join(process.cwd(), "public", DEMO_FILES.enterprise.json);
  let episode: Episode | null = null;
  let error: string | null = null;

  try {
    const raw = await fs.readFile(demoPath, "utf-8");
    episode = JSON.parse(raw);
  } catch {
    error = "Demo episode data not available. Run `npm run dev` and generate a sample first.";
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 gap-6">
      {episode ? (
        <DemoPlayer episode={episode} demoMp3={DEMO_FILES.enterprise.mp3} />
      ) : (
        <div className="flex flex-col items-center gap-4 pt-20">
          <p className="text-[var(--danger)]">{error}</p>
          <a href="/" className="text-sm text-[var(--accent)] hover:underline">
            ← Back to DataBard
          </a>
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 max-w-md text-center mt-4">
        <p className="text-sm font-medium mb-1">This is a demo episode</p>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Pre-loaded server-side for instant playback. Connect your own data source to generate a custom episode.
        </p>
        <a href="/" className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-xs font-medium inline-block">
          Generate your own →
        </a>
      </div>
    </main>
  );
}
