"use client";

import Link from "next/link";
import { useWizard } from "@/components/wizard";
import { useGeneration } from "@/components/wizard/useGeneration";

export default function LabsPage() {
  const { state, dispatch } = useWizard();
  const { generateAnthem } = useGeneration();

  return (
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 gap-6 max-w-2xl mx-auto">
      <div className="w-full">
        <Link href="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">← Back to DataBard</Link>
      </div>

      <div className="w-full">
        <h1 className="text-2xl font-bold mb-1">🎵 Labs</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Experimental features that aren&apos;t part of the core analysis workflow. Have fun, but don&apos;t expect production reliability.
        </p>
      </div>

      {/* Anthem experiment */}
      <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎵</span>
          <div>
            <h2 className="text-sm font-semibold">Data Anthem</h2>
            <p className="text-xs text-[var(--text-muted)]">Turn your data schema into a song with AI-generated lyrics and music.</p>
          </div>
        </div>

        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 text-xs text-[var(--text-muted)]">
          <p className="font-medium text-[var(--text)] mb-1">How it works:</p>
          <ul className="space-y-0.5 ml-3">
            <li>1. Connect a data source from the main app</li>
            <li>2. Select a schema</li>
            <li>3. Come back here and click Generate Anthem</li>
            <li>4. DataBard writes lyrics from your table names, columns, and test results</li>
          </ul>
        </div>

        {!state.selectedSchema ? (
          <Link
            href="/"
            className="text-center bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-4 py-2.5 text-sm font-medium transition ease-out"
          >
            Connect a data source first →
          </Link>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="text-xs text-[var(--text-muted)]">
              Selected: <span className="text-[var(--text)] font-medium">{state.selectedSchema}</span>
            </div>
            <button
              onClick={() => generateAnthem(state.selectedSchema!)}
              className="bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-4 py-2.5 text-sm font-semibold transition ease-out hover:scale-[1.01]"
            >
              🎵 Generate Anthem
            </button>
          </div>
        )}
      </div>

      {/* Demo anthems */}
      <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col gap-3">
        <h3 className="text-sm font-semibold">🎧 Demo Anthems</h3>
        <p className="text-xs text-[var(--text-muted)]">Pre-generated examples so you can hear what a data song sounds like.</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={async () => {
              const isWeb3 = state.persona === "web3";
              const sampleUrl = isWeb3 ? "/sample-anthem-web3.json" : "/sample-anthem-enterprise.json";
              const audioUrl = isWeb3 ? "/demo-anthem-web3.mp3" : null;
              dispatch({ type: "SET_GEN_STEP", step: -1 });
              try {
                const res = await fetch(sampleUrl);
                const metadata = await res.json();
                dispatch({ type: "SET_EPISODE", episode: metadata });
                dispatch({ type: "SET_AUDIO_URL", url: audioUrl });
                dispatch({ type: "SET_STATUS", status: "" });
                if (audioUrl) {
                  window.location.href = `/protocol`;
                } else {
                  dispatch({ type: "SET_STEP", step: "episode" });
                }
              } catch (e) {
                dispatch({ type: "SET_STATUS", status: `Error: ${e instanceof Error ? e.message : "Failed to load demo anthem"}` });
              }
            }}
            className="text-left bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm hover:border-[var(--accent)] transition-colors cursor-pointer"
          >
            <span className="font-medium">{state.persona === "web3" ? "🪐 Web3 Anthem" : "🏢 Enterprise Anthem"}</span>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Pre-generated demo · click to play</p>
          </button>
        </div>
      </div>
    </main>
  );
}
